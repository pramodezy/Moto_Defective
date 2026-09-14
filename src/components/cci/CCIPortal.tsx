import React, { useState, useMemo, useEffect } from 'react';
import { 
  Store, 
  Truck, 
  Layers, 
  Printer, 
  CheckCircle2, 
  AlertTriangle, 
  MapPin, 
  Barcode, 
  FileText,
  Clock,
  AlertCircle,
  PackageCheck,
  Send
} from 'lucide-react';
import { ShippingOrder, DefectiveItem, CCIMaster } from '../../types/crm';
import { formatINR, formatDate, getCrmStatusStyle } from '../../lib/utils';
import { SlaBadge } from '../layout/SlaBadge';
import { printConsignmentManifest } from '../../services/manifestGenerator';
import { 
  getMotorolaStatusInfo, 
  getCciActionDetails 
} from '../../lib/motorolaStatus';

interface CCIPortalProps {
  stationCode: string;
  station?: CCIMaster;
  orders: ShippingOrder[];
  items: DefectiveItem[];
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  onSelectOrder: (order: ShippingOrder) => void;
  onOpenPickupModal?: (order: ShippingOrder) => void;
}

export const CCIPortal: React.FC<CCIPortalProps> = ({
  stationCode,
  station,
  orders,
  items,
  activeTab,
  onTabChange,
  onSelectOrder,
  onOpenPickupModal,
}) => {
  // Sync active view with Navbar activeTab
  const isItemsTab = activeTab === 'cci_items' || activeTab === 'vault';
  const [internalView, setInternalView] = useState<'consignments' | 'items'>(
    isItemsTab ? 'items' : 'consignments'
  );

  useEffect(() => {
    if (activeTab === 'cci_items' || activeTab === 'vault') {
      setInternalView('items');
    } else if (activeTab === 'cci_consignments') {
      setInternalView('consignments');
    }
  }, [activeTab]);

  const activeView = internalView;

  const handleViewChange = (view: 'consignments' | 'items') => {
    setInternalView(view);
    if (onTabChange) {
      onTabChange(view === 'items' ? 'cci_items' : 'cci_consignments');
    }
  };

  const [consignmentFilter, setConsignmentFilter] = useState<'all' | 'action_pickup' | 'in_transit_monitor' | 'waiting_awb' | 'cwh_received' | 'delivered'>('all');
  const [itemStatusFilter, setItemStatusFilter] = useState<string>('ALL');

  // Strict station scoping
  const stationOrders = useMemo(() => orders.filter((o) => o.station_code === stationCode), [orders, stationCode]);
  const stationItems = useMemo(() => items.filter((i) => i.station_code === stationCode), [items, stationCode]);

  // Actionable categorization for CCI:
  // 1. "Not Return" items: Action for CCI -> Create DC in Moto CRM
  const notReturnItems = useMemo(() => {
    return stationItems.filter((i) => {
      const moto = (i.motorola_parts_status || '').toLowerCase();
      return moto.includes('not return');
    });
  }, [stationItems]);

  // 2. "CCI send to CWH" + AWB updated from CWH -> Action for CCI: Pickup Handover Pending
  // Strictly orders with AWB where parcel has NOT yet been handed over to courier and is NOT yet in transit or CWH received
  const pickupHandoverOrders = useMemo(() => {
    return stationOrders.filter((o) => {
      if (o.crm_status === 'In Transit' || o.crm_status === 'CWH Received' || o.crm_status === 'Dispatched to RC' || o.crm_status === 'Closed' || o.crm_status === 'Discrepancy Tagged') {
        return false;
      }
      if (o.pickup_status === 'Pickup Done') return false;
      const moto = getMotorolaStatusInfo(o.motorola_status);
      if (moto.code === 3 || moto.code === 4 || moto.code === 5 || moto.code === 6) return false;
      const hasAwb = !!(o.active_awb || o.excel_ref_awb);
      return hasAwb;
    });
  }, [stationOrders]);

  // 3. "CCI send to CWH" + once updated -> In-Transit till delivery & updated as CWH Received: CCI need to monitor
  // Strictly consignments en route to CWH (In Transit or Pickup Done), excluding CWH Received and closed
  const inTransitMonitorOrders = useMemo(() => {
    return stationOrders.filter((o) => {
      if (o.crm_status === 'CWH Received' || o.crm_status === 'Dispatched to RC' || o.crm_status === 'Closed' || o.crm_status === 'Discrepancy Tagged') {
        return false;
      }
      const moto = getMotorolaStatusInfo(o.motorola_status);
      if (moto.code === 3 || moto.code === 4 || moto.code === 5 || moto.code === 6) return false;
      const hasAwb = !!(o.active_awb || o.excel_ref_awb);
      return hasAwb && (o.crm_status === 'In Transit' || o.pickup_status === 'Pickup Done');
    });
  }, [stationOrders]);

  // 4. "CCI send to CWH" + AWB not yet updated by CWH: DC created, waiting for CWH to issue AWB
  const awaitingCwhAwbOrders = useMemo(() => {
    return stationOrders.filter((o) => {
      if (o.crm_status === 'In Transit' || o.crm_status === 'CWH Received' || o.crm_status === 'Dispatched to RC' || o.crm_status === 'Closed' || o.crm_status === 'Discrepancy Tagged') {
        return false;
      }
      const moto = getMotorolaStatusInfo(o.motorola_status);
      if (moto.code === 3 || moto.code === 4 || moto.code === 5 || moto.code === 6) return false;
      const hasAwb = !!(o.active_awb || o.excel_ref_awb);
      return !hasAwb;
    });
  }, [stationOrders]);

  // 5. CWH Stage (CWH Received & ASP Send to RC):
  // "ASP Send to RC is a dispatch from CWH to RC hence for CCI it is not actionable"
  const cwhStageOrders = useMemo(() => {
    return stationOrders.filter((o) => {
      if (o.crm_status === 'Closed') return false;
      const moto = getMotorolaStatusInfo(o.motorola_status);
      return moto.code === 3 || moto.code === 4 || o.crm_status === 'CWH Received' || o.crm_status === 'Dispatched to RC' || o.crm_status === 'Discrepancy Tagged';
    });
  }, [stationOrders]);

  // 6. Delivered & Closed at RC (RC Received ASP)
  const deliveredOrders = useMemo(() => {
    return stationOrders.filter((o) => {
      const moto = getMotorolaStatusInfo(o.motorola_status);
      return moto.code === 5 || moto.code === 6 || o.crm_status === 'Closed';
    });
  }, [stationOrders]);

  // Filtered consignments based on selected subtab
  const displayedOrders = useMemo(() => {
    switch (consignmentFilter) {
      case 'action_pickup':
        return pickupHandoverOrders;
      case 'in_transit_monitor':
        return inTransitMonitorOrders;
      case 'waiting_awb':
        return awaitingCwhAwbOrders;
      case 'cwh_received':
        return cwhStageOrders;
      case 'delivered':
        return deliveredOrders;
      default:
        return stationOrders;
    }
  }, [consignmentFilter, pickupHandoverOrders, inTransitMonitorOrders, awaitingCwhAwbOrders, cwhStageOrders, deliveredOrders, stationOrders]);

  // Filtered items based on itemStatusFilter
  const displayedItems = useMemo(() => {
    if (itemStatusFilter === 'ALL') return stationItems;
    return stationItems.filter((i) => {
      const info = getMotorolaStatusInfo(i.motorola_parts_status);
      return String(info.code) === itemStatusFilter;
    });
  }, [stationItems, itemStatusFilter]);

  const totalValue = stationOrders.reduce((sum, o) => sum + (o.total_declared_value || 0), 0);
  const discrepanciesCount = stationOrders.filter((o) => o.crm_status === 'Discrepancy Tagged').length;

  return (
    <div className="space-y-6">
      {/* Station Header Profile */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-[#0d2218] via-[#102a20] to-[#143328] border border-emerald-500/40 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Store className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-emerald-300 px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40">
                  cci_{stationCode}
                </span>
                <span className="text-xs text-slate-300 font-semibold">
                  Station Code: <strong className="text-white font-mono">{stationCode}</strong>
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-medium">
                  {station?.region || 'West'} Region
                </span>
              </div>
              <h2 className="text-xl font-extrabold text-white font-['Outfit'] mt-1">
                {station?.station_name || `Motorola Authorized Service Center - ${stationCode}`}
              </h2>
              <p className="text-xs text-emerald-200/80 flex items-center gap-1.5 mt-0.5">
                <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                {station?.city ? `${station.city}, ` : ''}{station?.state || 'India'} • Contact: {station?.contact_person || 'N/A'} ({station?.contact_phone || 'N/A'})
              </p>
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs text-emerald-300 uppercase tracking-wider font-semibold">
              Station Pipeline Value
            </div>
            <div className="text-2xl font-bold font-mono text-white mt-0.5">
              {formatINR(totalValue)}
            </div>
            <div className="text-[11px] text-slate-400">
              {stationOrders.length} Consignments • {stationItems.length} Defective Units
            </div>
          </div>
        </div>
      </div>

      {/* Action & Monitoring Banners for CCI */}
      <div className="space-y-3">
        {/* Banner 1: Not Return -> Create DC */}
        {notReturnItems.length > 0 && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs">
                <h4 className="font-bold text-amber-300">
                  ⚠️ Action Required for CCI: {notReturnItems.length} Defective Part{notReturnItems.length > 1 ? 's' : ''} in &quot;Not Return&quot; Status
                </h4>
                <p className="text-slate-300 mt-0.5">
                  Parts are at the station with no Delivery Challan created yet. Please create a DC in Motorola CRM to begin dispatch.
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                handleViewChange('items');
                setItemStatusFilter('1');
              }}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white shrink-0 transition-colors shadow cursor-pointer"
            >
              View Parts &amp; Create DC ({notReturnItems.length})
            </button>
          </div>
        )}

        {/* Banner 2: CCI send to CWH -> AWB updated from CWH -> Pickup Handover Pending */}
        {pickupHandoverOrders.length > 0 && (
          <div className="p-4 rounded-xl bg-gradient-to-r from-amber-950/40 via-amber-900/30 to-[#101a35] border-2 border-amber-500/60 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <Truck className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs">
                <h4 className="font-bold text-amber-300">
                  ⚡ Action Required for CCI: {pickupHandoverOrders.length} Consignment{pickupHandoverOrders.length > 1 ? 's' : ''} with AWB Updated — Pickup Handover Pending
                </h4>
                <p className="text-slate-200 mt-0.5">
                  CWH has assigned the courier AWB. Handover parcel to courier and record pickup status (Pickup Done / Pickup Not Done).
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                handleViewChange('consignments');
                setConsignmentFilter('action_pickup');
              }}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white shrink-0 transition-colors shadow cursor-pointer"
            >
              Handover Parcels ({pickupHandoverOrders.length})
            </button>
          </div>
        )}

        {/* Banner 3: In-Transit Monitoring till delivery and updated as CWH Received */}
        {inTransitMonitorOrders.length > 0 && (
          <div className="p-3.5 rounded-xl bg-cyan-950/30 border border-cyan-500/30 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <Truck className="w-4 h-4 text-cyan-400 shrink-0" />
              <div>
                <span className="font-bold text-cyan-300">In-Transit Monitoring:</span>
                <span className="text-slate-300 ml-1.5">
                  {inTransitMonitorOrders.length} consignment{inTransitMonitorOrders.length > 1 ? 's' : ''} handed over to courier. Monitor shipments until delivery &amp; updated as &quot;CWH Received&quot; in Moto CRM.
                </span>
              </div>
            </div>
            <button
              onClick={() => {
                handleViewChange('consignments');
                setConsignmentFilter('in_transit_monitor');
              }}
              className="text-cyan-400 hover:underline shrink-0 text-xs font-medium cursor-pointer"
            >
              View In-Transit ({inTransitMonitorOrders.length})
            </button>
          </div>
        )}
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-[#101a35] border border-[#1c2b53]">
          <span className="text-xs text-slate-400">Total Consignments</span>
          <div className="text-2xl font-bold font-mono text-white mt-1">
            {stationOrders.length}
          </div>
          <span className="text-[10px] text-slate-400">Station lifetime record</span>
        </div>

        <div className="p-4 rounded-xl bg-[#101a35] border border-amber-500/40 bg-gradient-to-b from-amber-950/20 to-[#101a35]">
          <span className="text-xs text-amber-300 font-semibold">⚡ Action: Pickup Pending</span>
          <div className="text-2xl font-bold font-mono text-amber-400 mt-1">
            {pickupHandoverOrders.length}
          </div>
          <span className="text-[10px] text-slate-400">AWB updated; handover pending</span>
        </div>

        <div className="p-4 rounded-xl bg-[#101a35] border border-[#1c2b53]">
          <span className="text-xs text-slate-400">🚚 In-Transit (Monitor)</span>
          <div className="text-2xl font-bold font-mono text-cyan-400 mt-1">
            {inTransitMonitorOrders.length}
          </div>
          <span className="text-[10px] text-slate-400">Monitor till CWH Received</span>
        </div>

        <div className="p-4 rounded-xl bg-[#101a35] border border-[#1c2b53]">
          <span className="text-xs text-slate-400">🏢 CWH &amp; RC Processed</span>
          <div className="text-2xl font-bold font-mono text-indigo-300 mt-1">
            {cwhStageOrders.length + deliveredOrders.length}
          </div>
          <span className="text-[10px] text-slate-400">No action for CCI (CWH / RC stage)</span>
        </div>
      </div>

      {/* View Switcher Tabs (Synchronized with Navbar) */}
      <div className="flex items-center gap-2 border-b border-[#1f2e5a] pb-2">
        <button
          onClick={() => handleViewChange('consignments')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeView === 'consignments'
              ? 'bg-emerald-600 text-white shadow'
              : 'bg-[#101a35] text-slate-400 hover:text-slate-200 border border-[#1c2b53]'
          }`}
        >
          <Truck className="w-3.5 h-3.5" />
          My Station Consignments (SO) ({stationOrders.length})
        </button>

        <button
          onClick={() => handleViewChange('items')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeView === 'items'
              ? 'bg-emerald-600 text-white shadow'
              : 'bg-[#101a35] text-slate-400 hover:text-slate-200 border border-[#1c2b53]'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          Station Defective Items Vault ({stationItems.length})
          {notReturnItems.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-black font-bold ml-1">
              {notReturnItems.length}
            </span>
          )}
        </button>
      </div>

      {/* Consignments Subtabs & Table */}
      {activeView === 'consignments' && (
        <div className="space-y-4">
          {/* Subtabs for Consignments */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setConsignmentFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                consignmentFilter === 'all'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'bg-[#101a35] text-slate-400 hover:text-slate-200 border border-[#1c2b53]'
              }`}
            >
              All Consignments ({stationOrders.length})
            </button>

            <button
              onClick={() => setConsignmentFilter('action_pickup')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                consignmentFilter === 'action_pickup'
                  ? 'bg-amber-600 text-white shadow font-semibold'
                  : 'bg-[#101a35] text-amber-300 hover:text-white border border-amber-500/40'
              }`}
            >
              <Truck className="w-3.5 h-3.5" />
              ⚡ Action: Pickup Handover Pending ({pickupHandoverOrders.length})
            </button>

            <button
              onClick={() => setConsignmentFilter('in_transit_monitor')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                consignmentFilter === 'in_transit_monitor'
                  ? 'bg-cyan-600 text-white shadow font-semibold'
                  : 'bg-[#101a35] text-cyan-300 hover:text-white border border-cyan-500/30'
              }`}
            >
              <Truck className="w-3.5 h-3.5" />
              🚚 In-Transit (Monitor till CWH Received) ({inTransitMonitorOrders.length})
            </button>

            <button
              onClick={() => setConsignmentFilter('waiting_awb')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                consignmentFilter === 'waiting_awb'
                  ? 'bg-slate-700 text-white shadow'
                  : 'bg-[#101a35] text-slate-400 hover:text-slate-200 border border-[#1c2b53]'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              ⏳ DC Created - Waiting CWH AWB ({awaitingCwhAwbOrders.length})
            </button>

            <button
              onClick={() => setConsignmentFilter('cwh_received')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                consignmentFilter === 'cwh_received'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'bg-[#101a35] text-slate-400 hover:text-slate-200 border border-[#1c2b53]'
              }`}
              title="CWH Received & ASP Send to RC (Dispatched from CWH to RC in Lenovo CRM — No Action for CCI)"
            >
              🏢 At CWH / Dispatched to RC (No CCI Action) ({cwhStageOrders.length})
            </button>

            <button
              onClick={() => setConsignmentFilter('delivered')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                consignmentFilter === 'delivered'
                  ? 'bg-emerald-700 text-white shadow'
                  : 'bg-[#101a35] text-slate-400 hover:text-slate-200 border border-[#1c2b53]'
              }`}
            >
              ✓ Delivered to RC ({deliveredOrders.length})
            </button>
          </div>

          <div className="rounded-xl border border-[#1c2b53] overflow-hidden bg-[#101a35] shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#0b1329] text-slate-400 border-b border-[#1c2b53] font-mono">
                  <tr>
                    <th className="py-3 px-3.5 text-left uppercase tracking-wider text-[11px] font-semibold whitespace-nowrap">SO Code</th>
                    <th className="py-3 px-3.5 text-left uppercase tracking-wider text-[11px] font-semibold whitespace-nowrap">Courier &amp; AWB</th>
                    <th className="py-3 px-3 text-center uppercase tracking-wider text-[11px] font-semibold whitespace-nowrap">Units</th>
                    <th className="py-3 px-3.5 text-left uppercase tracking-wider text-[11px] font-semibold whitespace-nowrap">Motorola Status</th>
                    <th className="py-3 px-3.5 text-left uppercase tracking-wider text-[11px] font-semibold whitespace-nowrap">CCI Stage</th>
                    <th className="py-3 px-3.5 text-left uppercase tracking-wider text-[11px] font-semibold whitespace-nowrap">Pickup Status</th>
                    <th className="py-3 px-3.5 text-center uppercase tracking-wider text-[11px] font-semibold whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1c2b53]/60 text-slate-300">
                  {displayedOrders.map((so) => {
                    const orderItems = items.filter((i) => (i.shipping_order_code || '').trim() === so.so_code.trim());
                    const units = orderItems.length > 0 
                      ? orderItems.reduce((s, i) => s + (parseInt(String(i.quantity || 1), 10) || 1), 0) 
                      : (so.total_items || 0);
                    const motoInfo = getMotorolaStatusInfo(so.motorola_status);
                    const cciAction = getCciActionDetails(so);
                    const hasAwb = !!(so.active_awb || so.excel_ref_awb);
                    const isPickupPending = cciAction.actionType === 'PICKUP_HANDOVER_PENDING';

                    return (
                      <tr key={so.id} className="hover:bg-slate-800/40 transition-colors">
                        {/* 1. SO Code */}
                        <td className="py-3 px-3.5 whitespace-nowrap align-middle">
                          <button
                            onClick={() => onSelectOrder(so)}
                            className="font-mono font-semibold text-cyan-300 hover:text-cyan-200 hover:underline text-left block cursor-pointer"
                          >
                            {so.so_code}
                          </button>
                          {so.eway_bill_required && (
                            <span className="text-[9px] text-amber-400 font-sans block mt-0.5">E-Way Bill Req</span>
                          )}
                        </td>

                        {/* 2. Courier & AWB */}
                        <td className="py-3 px-3.5 whitespace-nowrap align-middle">
                          <div className="text-slate-300 font-medium text-xs">{so.courier || 'BlueDart Express'}</div>
                          <div className="font-mono text-cyan-400/90 text-[11px] mt-0.5">
                            {so.active_awb || so.excel_ref_awb || (motoInfo.isDelivered ? 'Delivered (Direct)' : 'Pending CWH AWB')}
                          </div>
                        </td>

                        {/* 3. Units */}
                        <td className="py-3 px-3 text-center font-mono font-semibold text-slate-200 whitespace-nowrap align-middle">
                          {units}
                        </td>

                        {/* 4. Motorola Status */}
                        <td className="py-3 px-3.5 whitespace-nowrap align-middle">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${motoInfo.badgeClass} inline-block whitespace-nowrap`}
                            title={motoInfo.meaning}
                          >
                            {motoInfo.label}
                          </span>
                        </td>

                        {/* 6. CCI Stage (Clean typography without redundant pill borders) */}
                        <td className="py-3 px-3.5 whitespace-nowrap align-middle">
                          {cciAction.actionType === 'PICKUP_HANDOVER_PENDING' ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                              Pickup Pending
                            </span>
                          ) : cciAction.actionType === 'IN_TRANSIT_MONITOR' ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-cyan-300 font-medium">
                              <Truck className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                              In-Transit (Monitor)
                            </span>
                          ) : cciAction.actionType === 'AWAITING_CWH_AWB' ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                              <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                              Waiting CWH AWB
                            </span>
                          ) : cciAction.actionType === 'CWH_RECEIVED' ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-indigo-300 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                              At CWH (Verified)
                            </span>
                          ) : cciAction.actionType === 'DISPATCHED_TO_RC' ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-blue-300 font-medium">
                              <Send className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                              Dispatched CWH → RC
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              Delivered to RC
                            </span>
                          )}
                        </td>

                        {/* 7. Pickup Status (Clean text with status icons, no bulky capsules) */}
                        <td className="py-3 px-3.5 whitespace-nowrap align-middle">
                          {motoInfo.isDelivered ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              Delivered
                            </span>
                          ) : motoInfo.code === 4 ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-blue-300 font-medium">
                              <Send className="w-3.5 h-3.5 shrink-0 text-blue-400" />
                              CWH Dispatched
                            </span>
                          ) : so.pickup_status === 'Pickup Done' ? (
                            <div className="flex flex-col">
                              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300 font-medium">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                Pickup Done
                              </span>
                              {so.pickup_date && (
                                <span className="text-[10px] text-slate-400 font-mono mt-0.5">
                                  {formatDate(so.pickup_date)}
                                </span>
                              )}
                            </div>
                          ) : so.pickup_status === 'Pickup Not Done' ? (
                            <div className="flex flex-col">
                              <span className="inline-flex items-center gap-1.5 text-xs text-rose-400 font-medium">
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                                Pickup Failed
                              </span>
                              {so.pickup_remarks && (
                                <span className="text-[10px] text-rose-300/80 truncate max-w-[130px]" title={so.pickup_remarks}>
                                  {so.pickup_remarks}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                              <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                              {hasAwb ? 'Handover Pending' : 'AWB Pending'}
                            </span>
                          )}
                        </td>

                        {/* 8. Actions (Prominent button only when action is pending, otherwise just clean print manifest button) */}
                        <td className="py-3 px-3.5 text-center whitespace-nowrap align-middle">
                          <div className="flex items-center justify-center gap-2">
                            {/* Handover / Pickup button: STRICTLY for Code 2 (CCI send to CWH) */}
                            {isPickupPending ? (
                              <button
                                onClick={() => onOpenPickupModal?.(so)}
                                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-sm transition-all hover:scale-[1.02] cursor-pointer"
                                title="AWB issued from CWH: Handover consignment to courier & record pickup status"
                              >
                                <Truck className="w-3.5 h-3.5" />
                                Handover
                              </button>
                            ) : motoInfo.code === 2 && hasAwb ? (
                              <button
                                onClick={() => onOpenPickupModal?.(so)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-[#1a274c] hover:bg-[#233566] text-slate-200 border border-[#1f2e5a] transition-colors cursor-pointer"
                                title="View or Edit AWB Details / Pickup Status"
                              >
                                <Truck className="w-3.5 h-3.5" />
                                Edit
                              </button>
                            ) : null}

                            <button
                              onClick={() => printConsignmentManifest(so, orderItems, station)}
                              className="inline-flex items-center justify-center p-1.5 rounded-lg text-xs font-medium bg-[#1a274c] hover:bg-[#233566] text-cyan-300 border border-cyan-500/30 transition-colors cursor-pointer"
                              title="Print Consignment Manifest"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {displayedOrders.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        No consignments match this filter for Station {stationCode}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Defective Line Items View */}
      {activeView === 'items' && (
        <div className="space-y-4">
          {/* Item Filter Bar */}
          <div className="p-3 rounded-xl bg-[#101a35] border border-[#1c2b53] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-300">Filter by Motorola Status:</span>
              <select
                value={itemStatusFilter}
                onChange={(e) => setItemStatusFilter(e.target.value)}
                aria-label="Filter items by Motorola Status"
                className="bg-[#0b1329] border border-[#1f2e5a] text-slate-200 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-cyan-500"
              >
                <option value="ALL">All Statuses ({stationItems.length})</option>
                <option value="1">1. Not Return - Action: Create DC in Moto CRM ({notReturnItems.length})</option>
                <option value="2">2. CCI Send to CWH - Active Logistics</option>
                <option value="3">3. CWH Received - At Warehouse</option>
                <option value="4">4. ASP Send to RC - Outbound to RC</option>
                <option value="5">5. RC Received ASP - Completed</option>
                <option value="6">6. RC Received ASP(Negative) - Discrepancy</option>
              </select>
            </div>

            <div className="text-xs text-slate-400">
              Showing <strong className="text-white font-mono">{displayedItems.length}</strong> items
            </div>
          </div>

          <div className="rounded-xl border border-[#1c2b53] overflow-hidden bg-[#101a35] shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#0b1329] text-slate-400 border-b border-[#1c2b53] font-mono">
                  <tr>
                    <th className="py-3 px-3.5 text-left uppercase tracking-wider text-[11px] font-semibold whitespace-nowrap">SR Number</th>
                    <th className="py-3 px-3.5 text-left uppercase tracking-wider text-[11px] font-semibold whitespace-nowrap">Defective Part No</th>
                    <th className="py-3 px-3.5 text-left uppercase tracking-wider text-[11px] font-semibold whitespace-nowrap">Category</th>
                    <th className="py-3 px-3.5 text-left uppercase tracking-wider text-[11px] font-semibold whitespace-nowrap">Description</th>
                    <th className="py-3 px-3.5 text-left uppercase tracking-wider text-[11px] font-semibold whitespace-nowrap">Model</th>
                    <th className="py-3 px-3 text-center uppercase tracking-wider text-[11px] font-semibold whitespace-nowrap">Qty</th>
                    <th className="py-3 px-3.5 text-left uppercase tracking-wider text-[11px] font-semibold whitespace-nowrap">SO Code</th>
                    <th className="py-3 px-3.5 text-left uppercase tracking-wider text-[11px] font-semibold whitespace-nowrap">Motorola Status</th>
                    <th className="py-3 px-3.5 text-right uppercase tracking-wider text-[11px] font-semibold whitespace-nowrap">Est. Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1c2b53]/60 text-slate-300">
                  {displayedItems.map((item) => {
                    const motoInfo = getMotorolaStatusInfo(item.motorola_parts_status);
                    const isNotReturn = motoInfo.code === 1;

                    return (
                      <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-3.5 font-mono font-medium text-white whitespace-nowrap align-middle">{item.sr_number}</td>
                        <td className="py-3 px-3.5 font-mono text-cyan-300 whitespace-nowrap align-middle">{item.sr_part_number}</td>
                        <td className="py-3 px-3.5 text-slate-200 whitespace-nowrap align-middle">{item.part_category}</td>
                        <td className="py-3 px-3.5 text-slate-400 max-w-xs truncate align-middle">{item.part_description}</td>
                        <td className="py-3 px-3.5 whitespace-nowrap align-middle text-slate-300">{item.sr_model_name || '-'}</td>
                        <td className="py-3 px-3 text-center font-mono font-semibold text-slate-200 whitespace-nowrap align-middle">{item.quantity || 1}</td>
                        <td className="py-3 px-3.5 font-mono text-slate-400 whitespace-nowrap align-middle">{item.shipping_order_code}</td>
                        
                        {/* Motorola Status */}
                        <td className="py-3 px-3.5 whitespace-nowrap align-middle">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${motoInfo.badgeClass} inline-block whitespace-nowrap`}
                            title={motoInfo.meaning}
                          >
                            {motoInfo.label}
                          </span>
                          {isNotReturn && (
                            <div className="text-[9px] text-amber-300 font-semibold mt-0.5">
                              Action: Create DC in Moto CRM
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-3.5 text-right font-mono font-bold text-emerald-400 whitespace-nowrap align-middle">
                          {formatINR((item.estimated_value || 8000) * (item.quantity || 1))}
                        </td>
                      </tr>
                    );
                  })}

                  {displayedItems.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        No defective items match this status filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

