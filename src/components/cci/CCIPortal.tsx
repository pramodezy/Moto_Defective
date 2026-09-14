import React, { useState, useMemo } from 'react';
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
  onSelectOrder: (order: ShippingOrder) => void;
  onOpenPickupModal?: (order: ShippingOrder) => void;
}

export const CCIPortal: React.FC<CCIPortalProps> = ({
  stationCode,
  station,
  orders,
  items,
  onSelectOrder,
  onOpenPickupModal,
}) => {
  const [activeView, setActiveView] = useState<'consignments' | 'items'>('consignments');
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
  // Strictly only Code 2 (CCI send to CWH) - excludes ASP Send to RC, CWH Received, and RC Received
  const pickupHandoverOrders = useMemo(() => {
    return stationOrders.filter((o) => {
      const moto = getMotorolaStatusInfo(o.motorola_status);
      if (moto.code !== 2) return false;
      const hasAwb = !!(o.active_awb || o.excel_ref_awb);
      return hasAwb && o.pickup_status !== 'Pickup Done';
    });
  }, [stationOrders]);

  // 3. "CCI send to CWH" + once updated -> In-Transit till delivery & updated as CWH Received: CCI need to monitor
  // Strictly only Code 2 (CCI send to CWH) en route to warehouse
  const inTransitMonitorOrders = useMemo(() => {
    return stationOrders.filter((o) => {
      const moto = getMotorolaStatusInfo(o.motorola_status);
      if (moto.code !== 2) return false;
      const hasAwb = !!(o.active_awb || o.excel_ref_awb);
      return hasAwb && o.pickup_status === 'Pickup Done';
    });
  }, [stationOrders]);

  // 4. "CCI send to CWH" + AWB not yet updated by CWH: DC created, waiting for CWH to issue AWB
  const awaitingCwhAwbOrders = useMemo(() => {
    return stationOrders.filter((o) => {
      const moto = getMotorolaStatusInfo(o.motorola_status);
      if (moto.code !== 2) return false;
      const hasAwb = !!(o.active_awb || o.excel_ref_awb);
      return !hasAwb;
    });
  }, [stationOrders]);

  // 5. CWH Stage (CWH Received & ASP Send to RC):
  // "ASP Send to RC is a dispatch from CWH to RC hence for CCI it is not actionable"
  const cwhStageOrders = useMemo(() => {
    return stationOrders.filter((o) => {
      const moto = getMotorolaStatusInfo(o.motorola_status);
      return moto.code === 3 || moto.code === 4 || o.crm_status === 'CWH Received' || o.crm_status === 'Dispatched to RC';
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
                setActiveView('items');
                setItemStatusFilter('1');
              }}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white shrink-0 transition-colors shadow"
            >
              View Parts &amp; Create DC ({notReturnItems.length})
            </button>
          </div>
        )}

        {/* Banner 2: CCI send to CWH -> AWB updated from CWH -> Pickup Handover Pending */}
        {pickupHandoverOrders.length > 0 && (
          <div className="p-4 rounded-xl bg-gradient-to-r from-amber-950/40 via-amber-900/30 to-[#101a35] border-2 border-amber-500/60 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-pulse">
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
                setActiveView('consignments');
                setConsignmentFilter('action_pickup');
              }}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white shrink-0 transition-colors shadow"
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
                setActiveView('consignments');
                setConsignmentFilter('in_transit_monitor');
              }}
              className="text-cyan-400 hover:underline shrink-0 text-xs font-medium"
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
          <span className="text-xs text-slate-400">🏢 CWH Received / RC</span>
          <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
            {cwhStageOrders.length + deliveredOrders.length}
          </div>
          <span className="text-[10px] text-slate-400">At CWH / Dispatched to RC</span>
        </div>
      </div>

      {/* View Switcher Tabs */}
      <div className="flex items-center gap-2 border-b border-[#1f2e5a] pb-2">
        <button
          onClick={() => setActiveView('consignments')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeView === 'consignments'
              ? 'bg-emerald-600 text-white shadow'
              : 'bg-[#101a35] text-slate-400 hover:text-slate-200 border border-[#1c2b53]'
          }`}
        >
          <Truck className="w-3.5 h-3.5" />
          Consignments Dispatch Orders ({stationOrders.length})
        </button>

        <button
          onClick={() => setActiveView('items')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeView === 'items'
              ? 'bg-emerald-600 text-white shadow'
              : 'bg-[#101a35] text-slate-400 hover:text-slate-200 border border-[#1c2b53]'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          Defective Line Items ({stationItems.length})
          {notReturnItems.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-black font-bold">
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
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                consignmentFilter === 'all'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'bg-[#101a35] text-slate-400 hover:text-slate-200 border border-[#1c2b53]'
              }`}
            >
              All Consignments ({stationOrders.length})
            </button>

            <button
              onClick={() => setConsignmentFilter('action_pickup')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
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
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
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
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
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
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
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
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
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
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0b1329] text-slate-400 border-b border-[#1c2b53] font-mono">
                  <tr>
                    <th className="py-3 px-4">SO Code</th>
                    <th className="py-3 px-4">Courier & AWB</th>
                    <th className="py-3 px-4 text-center">Units</th>
                    <th className="py-3 px-4 text-right">Declared Value</th>
                    <th className="py-3 px-4">Motorola Status</th>
                    <th className="py-3 px-4">CCI Stage & Action</th>
                    <th className="py-3 px-4">Pickup Status</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1c2b53]/60 text-slate-300">
                  {displayedOrders.map((so) => {
                    const orderItems = items.filter((i) => i.shipping_order_code === so.so_code);
                    const motoInfo = getMotorolaStatusInfo(so.motorola_status);
                    const cciAction = getCciActionDetails(so);
                    const hasAwb = !!(so.active_awb || so.excel_ref_awb);
                    const isPickupPending = cciAction.actionType === 'PICKUP_HANDOVER_PENDING';

                    return (
                      <tr key={so.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4 font-mono font-medium text-cyan-300">
                          <button
                            onClick={() => onSelectOrder(so)}
                            className="hover:underline text-left"
                          >
                            {so.so_code}
                          </button>
                          {so.eway_bill_required && (
                            <div className="text-[9px] text-amber-400">E-Way Bill Req</div>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          <div className="text-slate-300">{so.courier}</div>
                          <div className="font-mono text-cyan-400 text-[11px] font-semibold">
                            {so.active_awb || so.excel_ref_awb || (motoInfo.isDelivered ? 'Delivered (Direct)' : 'Pending CWH AWB')}
                          </div>
                        </td>

                        <td className="py-3 px-4 text-center font-mono font-medium">
                          {orderItems.reduce((s, i) => s + (i.quantity || 1), 0)}
                        </td>

                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                          {formatINR(so.total_declared_value)}
                        </td>

                        {/* Motorola Status Badge */}
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${motoInfo.badgeClass}`}
                            title={motoInfo.meaning}
                          >
                            {motoInfo.label}
                          </span>
                        </td>

                        {/* CCI Stage & Action Column */}
                        <td className="py-3 px-4">
                          {cciAction.actionType === 'PICKUP_HANDOVER_PENDING' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/25 text-amber-300 border border-amber-500/50 animate-pulse">
                              ⚡ Pickup Handover Pending
                            </span>
                          ) : cciAction.actionType === 'IN_TRANSIT_MONITOR' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                              🚚 In-Transit (Monitor till CWH)
                            </span>
                          ) : cciAction.actionType === 'AWAITING_CWH_AWB' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                              ⏳ Waiting CWH AWB
                            </span>
                          ) : cciAction.actionType === 'CWH_RECEIVED' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                              🏢 CWH Received (Verified)
                            </span>
                          ) : cciAction.actionType === 'DISPATCHED_TO_RC' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/20 text-blue-300 border border-blue-500/40">
                              📦 Dispatched CWH → RC (No Action)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                              ✓ Delivered to RC (Closed)
                            </span>
                          )}
                        </td>

                        {/* Pickup Status Column */}
                        <td className="py-3 px-4">
                          {motoInfo.isDelivered ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              Delivered to RC
                            </span>
                          ) : motoInfo.code === 4 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/20 text-blue-300 border border-blue-500/40">
                              CWH Dispatched
                            </span>
                          ) : so.pickup_status === 'Pickup Done' ? (
                            <div className="flex flex-col">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 w-fit">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                Pickup Done
                              </span>
                              {so.pickup_date && (
                                <span className="text-[9px] text-slate-400 font-mono mt-0.5">
                                  {formatDate(so.pickup_date)}
                                </span>
                              )}
                            </div>
                          ) : so.pickup_status === 'Pickup Not Done' ? (
                            <div className="flex flex-col">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/40 w-fit">
                                <AlertTriangle className="w-3 h-3 text-rose-400" />
                                Pickup Failed
                              </span>
                              {so.pickup_remarks && (
                                <span className="text-[9px] text-rose-300/80 truncate max-w-[130px] mt-0.5" title={so.pickup_remarks}>
                                  {so.pickup_remarks}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                              <Clock className="w-3 h-3 text-slate-400" />
                              {hasAwb ? 'Handover Pending' : 'AWB Pending'}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Handover / Pickup button: STRICTLY for Code 2 (CCI send to CWH) */}
                            {isPickupPending ? (
                              <button
                                onClick={() => onOpenPickupModal?.(so)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-sm transition-all hover:scale-[1.02] cursor-pointer animate-pulse"
                                title="AWB issued from CWH: Handover consignment to courier and record pickup status"
                              >
                                <Truck className="w-3.5 h-3.5" />
                                Handover Parcel
                              </button>
                            ) : motoInfo.code === 2 && hasAwb ? (
                              <button
                                onClick={() => onOpenPickupModal?.(so)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-[#1a274c] hover:bg-[#233566] text-slate-200 border border-[#1f2e5a] transition-colors cursor-pointer"
                                title="View or Edit AWB Details / Pickup Status"
                              >
                                <Truck className="w-3.5 h-3.5" />
                                Edit Pickup
                              </button>
                            ) : motoInfo.code === 4 ? (
                              <span 
                                className="text-[10px] text-blue-300 font-mono px-2 py-0.5 rounded bg-blue-500/15 border border-blue-500/30"
                                title="Dispatch from CWH to RC in Lenovo CRM. Strictly not actionable for CCI."
                              >
                                Dispatched CWH → RC (No Action)
                              </span>
                            ) : motoInfo.code === 3 ? (
                              <span 
                                className="text-[10px] text-indigo-300 font-mono px-2 py-0.5 rounded bg-indigo-500/15 border border-indigo-500/30"
                                title="Received & verified at CWH in Motorola CRM. Monitoring complete."
                              >
                                Inward at CWH
                              </span>
                            ) : motoInfo.isDelivered ? (
                              <span className="text-[10px] text-emerald-400 font-mono">
                                Closed at RC
                              </span>
                            ) : (
                              <span 
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed"
                                title="Waiting for CWH to issue AWB token"
                              >
                                <Clock className="w-3 h-3" />
                                Waiting CWH AWB
                              </span>
                            )}

                            <button
                              onClick={() => printConsignmentManifest(so, orderItems, station)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-[#1a274c] hover:bg-[#233566] text-cyan-300 border border-cyan-500/30 transition-colors cursor-pointer"
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

          <div className="rounded-xl border border-[#1c2b53] overflow-hidden bg-[#101a35]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0b1329] text-slate-400 border-b border-[#1c2b53]">
                  <tr>
                    <th className="py-2.5 px-3">SR Number</th>
                    <th className="py-2.5 px-3">Defective Part No</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3">Description</th>
                    <th className="py-2.5 px-3">Model</th>
                    <th className="py-2.5 px-3 text-center">Qty</th>
                    <th className="py-2.5 px-3">SO Code</th>
                    <th className="py-2.5 px-3">Motorola Status</th>
                    <th className="py-2.5 px-3 text-right">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1c2b53]/60 text-slate-300">
                  {displayedItems.map((item) => {
                    const motoInfo = getMotorolaStatusInfo(item.motorola_parts_status);
                    const isNotReturn = motoInfo.code === 1;

                    return (
                      <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-2.5 px-3 font-mono font-medium text-white">{item.sr_number}</td>
                        <td className="py-2.5 px-3 font-mono text-cyan-300">{item.sr_part_number}</td>
                        <td className="py-2.5 px-3 text-slate-200">{item.part_category}</td>
                        <td className="py-2.5 px-3 text-slate-400 max-w-xs truncate">{item.part_description}</td>
                        <td className="py-2.5 px-3">{item.sr_model_name || '-'}</td>
                        <td className="py-2.5 px-3 text-center font-mono">{item.quantity || 1}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-400">{item.shipping_order_code}</td>
                        
                        {/* Motorola Status */}
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${motoInfo.badgeClass}`}
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

                        <td className="py-2.5 px-3 text-right font-mono text-emerald-400">
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

