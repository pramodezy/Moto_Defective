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

  const [consignmentFilter, setConsignmentFilter] = useState<
    'all' | 'action_pickup' | 'pending_reissue' | 'in_transit_monitor' | 'waiting_awb' | 'cwh_received' | 'delivered'
  >('all');
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

  // 2. Stage 3: "Pickup Pending" (AWB issued by CWH, awaiting physical courier handover)
  const pickupHandoverOrders = useMemo(() => {
    return stationOrders.filter((o) => {
      if (o.crm_status === 'In Transit' || o.crm_status === 'Delivered at CWH' || o.crm_status === 'Pending Inward at CWH' || o.crm_status === 'CWH to Create DC' || o.crm_status === 'Pickup Pending for RC' || o.crm_status === 'In Transit to RC' || o.crm_status === 'Delivered to RC' || o.crm_status === 'Discrepancies' || o.crm_status === 'Delivered to RC (Discrepancies)') {
        return false;
      }
      if (o.pickup_status === 'Pickup Done') return false;
      if (o.crm_status === 'Pending AWB Re-Issue' || o.pickup_status === 'Pickup Not Done') return false;
      const moto = getMotorolaStatusInfo(o.motorola_status);
      if (moto.code === 3 || moto.code === 4 || moto.code === 5 || moto.code === 6) return false;
      return o.crm_status === 'Pickup Pending' || !!(o.active_awb || o.excel_ref_awb);
    });
  }, [stationOrders]);

  // 3. Stage 4: "Pending AWB Re-Issue" (CCI marked Pickup Not Done; waiting CWH to cancel & re-issue token)
  const pendingReissueOrders = useMemo(() => {
    return stationOrders.filter((o) => {
      return o.crm_status === 'Pending AWB Re-Issue' || o.pickup_status === 'Pickup Not Done';
    });
  }, [stationOrders]);

  // 4. Stage 5: "In Transit" (CCI marked Pickup Done; monitor en route to CWH)
  const inTransitMonitorOrders = useMemo(() => {
    return stationOrders.filter((o) => {
      if (o.crm_status === 'Delivered at CWH' || o.crm_status === 'Pending Inward at CWH' || o.crm_status === 'CWH to Create DC' || o.crm_status === 'Pickup Pending for RC' || o.crm_status === 'In Transit to RC' || o.crm_status === 'Delivered to RC' || o.crm_status === 'Discrepancies' || o.crm_status === 'Delivered to RC (Discrepancies)') {
        return false;
      }
      const moto = getMotorolaStatusInfo(o.motorola_status);
      if (moto.code === 3 || moto.code === 4 || moto.code === 5 || moto.code === 6) return false;
      return o.crm_status === 'In Transit' || o.pickup_status === 'Pickup Done';
    });
  }, [stationOrders]);

  // 5. Stage 2: "Pending AWB" (DC created in Moto CRM, awaiting initial AWB token generation by CWH)
  const awaitingCwhAwbOrders = useMemo(() => {
    return stationOrders.filter((o) => {
      if (o.crm_status === 'In Transit' || o.crm_status === 'Delivered at CWH' || o.crm_status === 'Pending Inward at CWH' || o.crm_status === 'CWH to Create DC' || o.crm_status === 'Pickup Pending for RC' || o.crm_status === 'In Transit to RC' || o.crm_status === 'Delivered to RC' || o.crm_status === 'Discrepancies' || o.crm_status === 'Delivered to RC (Discrepancies)') {
        return false;
      }
      if (o.crm_status === 'Pending AWB Re-Issue' || o.pickup_status === 'Pickup Not Done') return false;
      const moto = getMotorolaStatusInfo(o.motorola_status);
      if (moto.code === 3 || moto.code === 4 || moto.code === 5 || moto.code === 6) return false;
      const hasAwb = !!(o.active_awb || o.excel_ref_awb);
      return o.crm_status === 'Pending AWB' || !hasAwb;
    });
  }, [stationOrders]);

  // 6. Stages 6 - 11: CWH & RC Operations (Delivered at CWH, Pending Inward, CWH to Create DC, Pickup Pending for RC, In Transit to RC)
  const cwhStageOrders = useMemo(() => {
    return stationOrders.filter((o) => {
      if (o.crm_status === 'Delivered to RC' || o.crm_status === 'Delivered to RC (Discrepancies)') return false;
      const moto = getMotorolaStatusInfo(o.motorola_status);
      return (
        moto.code === 3 ||
        moto.code === 4 ||
        o.crm_status === 'Delivered at CWH' ||
        o.crm_status === 'Pending Inward at CWH' ||
        o.crm_status === 'CWH to Create DC' ||
        o.crm_status === 'Pickup Pending for RC' ||
        o.crm_status === 'In Transit to RC' ||
        o.crm_status === 'Discrepancies'
      );
    });
  }, [stationOrders]);

  // 7. Stages 12 & 13: Delivered to RC (RC Received ASP)
  const deliveredOrders = useMemo(() => {
    return stationOrders.filter((o) => {
      const moto = getMotorolaStatusInfo(o.motorola_status);
      return (
        moto.code === 5 ||
        moto.code === 6 ||
        o.crm_status === 'Delivered to RC' ||
        o.crm_status === 'Delivered to RC (Discrepancies)'
      );
    });
  }, [stationOrders]);

  // Filtered consignments based on selected subtab
  const displayedOrders = useMemo(() => {
    switch (consignmentFilter) {
      case 'action_pickup':
        return pickupHandoverOrders;
      case 'pending_reissue':
        return pendingReissueOrders;
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
  }, [consignmentFilter, pickupHandoverOrders, pendingReissueOrders, inTransitMonitorOrders, awaitingCwhAwbOrders, cwhStageOrders, deliveredOrders, stationOrders]);

  // Filtered items based on itemStatusFilter
  const displayedItems = useMemo(() => {
    if (itemStatusFilter === 'ALL') return stationItems;
    return stationItems.filter((i) => {
      const info = getMotorolaStatusInfo(i.motorola_parts_status);
      return String(info.code) === itemStatusFilter;
    });
  }, [stationItems, itemStatusFilter]);

  const totalValue = stationOrders.reduce((sum, o) => sum + (o.total_declared_value || 0), 0);
  const discrepanciesCount = stationOrders.filter((o) => o.crm_status === 'Discrepancies' || o.crm_status === 'Delivered to RC (Discrepancies)').length;

  return (
    <div className="space-y-6">
      {/* Station Header Profile */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3 rounded-xl bg-sky-50 text-[#001489] border border-sky-200">
              <Store className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-sky-800 px-2 py-0.5 rounded bg-sky-50 border border-sky-200">
                  cci_{stationCode}
                </span>
                <span className="text-xs text-slate-600 font-semibold">
                  Station Code: <strong className="text-slate-900 font-mono">{stationCode}</strong>
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium border border-slate-200">
                  {station?.region || 'West'} Region
                </span>
              </div>
              <h2 className="text-xl font-extrabold text-slate-900 font-['Outfit'] mt-1">
                {station?.station_name || `Motorola Authorized Service Center - ${stationCode}`}
              </h2>
              <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                <MapPin className="w-3.5 h-3.5 text-sky-600" />
                {station?.city ? `${station.city}, ` : ''}{station?.state || 'India'} • Contact: {station?.contact_person || 'N/A'} ({station?.contact_phone || 'N/A'})
              </p>
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
              Station Pipeline Value
            </div>
            <div className="text-2xl font-bold font-mono text-slate-900 mt-0.5">
              {formatINR(totalValue)}
            </div>
            <div className="text-[11px] text-slate-500">
              {stationOrders.length} Consignments • {stationItems.length} Defective Units
            </div>
          </div>
        </div>
      </div>

      {/* Action & Monitoring Banners for CCI */}
      <div className="space-y-3">
        {/* Banner 1: Not Return -> Create DC */}
        {notReturnItems.length > 0 && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-xs">
                <h4 className="font-bold text-amber-900">
                  ⚠️ Action Required for CCI: {notReturnItems.length} Defective Part{notReturnItems.length > 1 ? 's' : ''} in &quot;Not Return&quot; Status
                </h4>
                <p className="text-amber-800/90 mt-0.5">
                  Parts are at the station with no Delivery Challan created yet. Please create a DC in Motorola CRM to begin dispatch.
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                handleViewChange('items');
                setItemStatusFilter('1');
              }}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white shrink-0 transition-colors shadow-xs cursor-pointer"
            >
              View Parts &amp; Create DC ({notReturnItems.length})
            </button>
          </div>
        )}

        {/* Banner 2: CCI send to CWH -> AWB updated from CWH -> Pickup Handover Pending */}
        {pickupHandoverOrders.length > 0 && (
          <div className="p-4 rounded-xl bg-amber-50 border-2 border-amber-400 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <Truck className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-xs">
                <h4 className="font-bold text-amber-950">
                  ⚡ Action Required for CCI: {pickupHandoverOrders.length} Consignment{pickupHandoverOrders.length > 1 ? 's' : ''} with AWB Updated — Pickup Handover Pending
                </h4>
                <p className="text-amber-900/90 mt-0.5">
                  CWH has assigned the courier AWB. Handover parcel to courier and record pickup status (Pickup Done / Pickup Not Done).
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                handleViewChange('consignments');
                setConsignmentFilter('action_pickup');
              }}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white shrink-0 transition-colors shadow-xs cursor-pointer"
            >
              Handover Parcels ({pickupHandoverOrders.length})
            </button>
          </div>
        )}

        {/* Banner 3: In-Transit Monitoring till delivery and updated as CWH Received */}
        {inTransitMonitorOrders.length > 0 && (
          <div className="p-3.5 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-between gap-3 text-xs shadow-xs">
            <div className="flex items-center gap-2.5">
              <Truck className="w-4 h-4 text-sky-700 shrink-0" />
              <div>
                <span className="font-bold text-sky-900">In-Transit Monitoring:</span>
                <span className="text-sky-800/90 ml-1.5">
                  {inTransitMonitorOrders.length} consignment{inTransitMonitorOrders.length > 1 ? 's' : ''} handed over to courier. Monitor shipments until delivery &amp; updated as &quot;CWH Received&quot; in Moto CRM.
                </span>
              </div>
            </div>
            <button
              onClick={() => {
                handleViewChange('consignments');
                setConsignmentFilter('in_transit_monitor');
              }}
              className="text-[#001489] hover:underline shrink-0 text-xs font-semibold cursor-pointer"
            >
              View In-Transit ({inTransitMonitorOrders.length})
            </button>
          </div>
        )}

        {/* Banner 4: Pickup Not Done -> Waiting CWH Re-issue */}
        {pendingReissueOrders.length > 0 && (
          <div className="p-4 rounded-xl bg-rose-50 border-2 border-rose-400 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
              <div className="text-xs">
                <h4 className="font-bold text-rose-950">
                  ⚠️ Pickup Exception: {pendingReissueOrders.length} Consignment{pendingReissueOrders.length > 1 ? 's' : ''} Marked &quot;Pickup Not Done&quot;
                </h4>
                <p className="text-rose-900/90 mt-0.5">
                  Courier pickup failed. The CWH logistics team has been notified to cancel previous tokens and re-issue fresh AWBs for your station.
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                handleViewChange('consignments');
                setConsignmentFilter('pending_reissue');
              }}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-700 hover:bg-rose-800 text-white shrink-0 transition-colors shadow-xs cursor-pointer"
            >
              View Exceptions ({pendingReissueOrders.length})
            </button>
          </div>
        )}
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
          <span className="text-xs text-slate-500">Total Consignments</span>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
            {stationOrders.length}
          </div>
          <span className="text-[10px] text-slate-500">Station lifetime record</span>
        </div>

        <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-300 shadow-xs">
          <span className="text-xs text-amber-900 font-semibold">⚡ Action: Pickup Pending</span>
          <div className="text-2xl font-bold font-mono text-amber-800 mt-1">
            {pickupHandoverOrders.length}
          </div>
          <span className="text-[10px] text-amber-700/80">AWB updated; handover pending</span>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
          <span className="text-xs text-slate-500">🚚 In-Transit (Monitor)</span>
          <div className="text-2xl font-bold font-mono text-sky-700 mt-1">
            {inTransitMonitorOrders.length}
          </div>
          <span className="text-[10px] text-slate-500">Monitor till CWH Received</span>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
          <span className="text-xs text-slate-500">🏢 CWH &amp; RC Processed</span>
          <div className="text-2xl font-bold font-mono text-slate-800 mt-1">
            {cwhStageOrders.length + deliveredOrders.length}
          </div>
          <span className="text-[10px] text-slate-500">No action for CCI (CWH / RC stage)</span>
        </div>
      </div>

      {/* View Switcher Tabs (Synchronized with Navbar) */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => handleViewChange('consignments')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeView === 'consignments'
              ? 'bg-[#001489] text-white shadow-xs'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Truck className="w-3.5 h-3.5" />
          My Station Consignments (SO) ({stationOrders.length})
        </button>

        <button
          onClick={() => handleViewChange('items')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeView === 'items'
              ? 'bg-[#001489] text-white shadow-xs'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          Station Defective Items Vault ({stationItems.length})
          {notReturnItems.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-white font-bold ml-1">
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
                  ? 'bg-[#001489] text-white shadow-xs font-semibold'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              All Consignments ({stationOrders.length})
            </button>

            <button
              onClick={() => setConsignmentFilter('action_pickup')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                consignmentFilter === 'action_pickup'
                  ? 'bg-amber-600 text-white shadow-xs font-semibold'
                  : 'bg-white text-amber-900 hover:bg-amber-50 border border-amber-300'
              }`}
            >
              <Truck className="w-3.5 h-3.5" />
              ⚡ Action: Pickup Handover Pending ({pickupHandoverOrders.length})
            </button>

            <button
              onClick={() => setConsignmentFilter('pending_reissue')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                consignmentFilter === 'pending_reissue'
                  ? 'bg-rose-700 text-white shadow-xs font-semibold'
                  : pendingReissueOrders.length > 0
                  ? 'bg-rose-50 text-rose-900 hover:bg-rose-100 border border-rose-300 font-semibold'
                  : 'bg-white text-rose-800 hover:bg-rose-50 border border-rose-200'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
              ⚠️ Waiting AWB Re-Issue ({pendingReissueOrders.length})
            </button>

            <button
              onClick={() => setConsignmentFilter('in_transit_monitor')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                consignmentFilter === 'in_transit_monitor'
                  ? 'bg-sky-700 text-white shadow-xs font-semibold'
                  : 'bg-white text-sky-900 hover:bg-sky-50 border border-sky-300'
              }`}
            >
              <Truck className="w-3.5 h-3.5" />
              🚚 In-Transit (Monitor till CWH Received) ({inTransitMonitorOrders.length})
            </button>

            <button
              onClick={() => setConsignmentFilter('waiting_awb')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                consignmentFilter === 'waiting_awb'
                  ? 'bg-slate-700 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              ⏳ DC Created - Waiting CWH AWB ({awaitingCwhAwbOrders.length})
            </button>

            <button
              onClick={() => setConsignmentFilter('cwh_received')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                consignmentFilter === 'cwh_received'
                  ? 'bg-purple-700 text-white shadow-xs'
                  : 'bg-white text-purple-900 hover:bg-purple-50 border border-purple-300'
              }`}
              title="CWH Received & ASP Send to RC (Dispatched from CWH to RC in Lenovo CRM — No Action for CCI)"
            >
              🏢 At CWH / Dispatched to RC (No CCI Action) ({cwhStageOrders.length})
            </button>

            <button
              onClick={() => setConsignmentFilter('delivered')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                consignmentFilter === 'delivered'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'bg-white text-emerald-900 hover:bg-emerald-50 border border-emerald-300'
              }`}
            >
              ✓ Delivered to RC ({deliveredOrders.length})
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100/90 text-slate-600 border-b border-slate-200 font-mono text-[11px] tracking-wider uppercase">
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
                <tbody className="divide-y divide-slate-200 text-slate-700">
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
                      <tr key={so.id} className="hover:bg-slate-50/80 transition-colors">
                        {/* 1. SO Code */}
                        <td className="py-3 px-3.5 whitespace-nowrap align-middle">
                          <button
                            onClick={() => onSelectOrder(so)}
                            className="font-mono font-semibold text-[#001489] hover:underline text-left block cursor-pointer"
                          >
                            {so.so_code}
                          </button>
                          {so.eway_bill_required && (
                            <span className="text-[9px] text-amber-700 font-sans block mt-0.5 font-medium">E-Way Bill Req</span>
                          )}
                        </td>

                        {/* 2. Courier & AWB */}
                        <td className="py-3 px-3.5 whitespace-nowrap align-middle">
                          <div className="text-slate-800 font-medium text-xs">{so.courier || 'BlueDart Express'}</div>
                          <div className="font-mono text-sky-800 text-[11px] mt-0.5 font-medium">
                            {so.active_awb || so.excel_ref_awb || (motoInfo.isDelivered ? 'Delivered (Direct)' : 'Pending CWH AWB')}
                          </div>
                        </td>

                        {/* 3. Units */}
                        <td className="py-3 px-3 text-center font-mono font-semibold text-slate-900 whitespace-nowrap align-middle">
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

                        {/* 6. CCI Stage */}
                        <td className="py-3 px-3.5 whitespace-nowrap align-middle">
                          {so.crm_status === 'Pending AWB Re-Issue' || so.pickup_status === 'Pickup Not Done' || cciAction.actionType === 'AWAITING_REISSUE' ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-50 text-rose-900 border border-rose-300">
                              <AlertTriangle className="w-3 h-3 text-rose-700 shrink-0" />
                              Waiting AWB Re-Issue
                            </span>
                          ) : cciAction.actionType === 'PICKUP_HANDOVER_PENDING' || so.crm_status === 'Pickup Pending' ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-300">
                              <Clock className="w-3 h-3 text-amber-700 shrink-0" />
                              Pickup Pending
                            </span>
                          ) : cciAction.actionType === 'IN_TRANSIT_MONITOR' || so.crm_status === 'In Transit' ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-sky-800 font-medium">
                              <Truck className="w-3.5 h-3.5 text-sky-700 shrink-0" />
                              In-Transit (Monitor)
                            </span>
                          ) : cciAction.actionType === 'AWAITING_CWH_AWB' || so.crm_status === 'Pending AWB' ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                              <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              Waiting CWH AWB
                            </span>
                          ) : cciAction.actionType === 'DELIVERED_CWH' || so.crm_status === 'Delivered at CWH' || so.crm_status === 'Pending Inward at CWH' || so.crm_status === 'CWH to Create DC' ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-purple-800 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5 text-purple-700 shrink-0" />
                              At CWH (Verified)
                            </span>
                          ) : cciAction.actionType === 'DISPATCHED_TO_RC' || so.crm_status === 'Pickup Pending for RC' || so.crm_status === 'In Transit to RC' ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-blue-800 font-medium">
                              <Send className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                              Dispatched CWH → RC
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-800 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              Delivered to RC
                            </span>
                          )}
                        </td>

                        {/* 7. Pickup Status */}
                        <td className="py-3 px-3.5 whitespace-nowrap align-middle">
                          {motoInfo.isDelivered ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-800 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              Delivered
                            </span>
                          ) : motoInfo.code === 4 ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-blue-800 font-medium">
                              <Send className="w-3.5 h-3.5 shrink-0 text-blue-700" />
                              CWH Dispatched
                            </span>
                          ) : so.pickup_status === 'Pickup Done' ? (
                            <div className="flex flex-col">
                              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-800 font-medium">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                Pickup Done
                              </span>
                              {so.pickup_date && (
                                <span className="text-[10px] text-slate-500 font-mono mt-0.5">
                                  {formatDate(so.pickup_date)}
                                </span>
                              )}
                            </div>
                          ) : so.pickup_status === 'Pickup Not Done' ? (
                            <div className="flex flex-col">
                              <span className="inline-flex items-center gap-1.5 text-xs text-rose-800 font-medium">
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                Pickup Failed
                              </span>
                              {so.pickup_remarks && (
                                <span className="text-[10px] text-rose-700/80 truncate max-w-[130px]" title={so.pickup_remarks}>
                                  {so.pickup_remarks}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                              <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              {hasAwb ? 'Handover Pending' : (motoInfo.code === 1 ? 'CCI to Create DC' : 'Pending AWB')}
                            </span>
                          )}
                        </td>

                        {/* 8. Actions */}
                        <td className="py-3 px-3.5 text-center whitespace-nowrap align-middle">
                          <div className="flex items-center justify-center gap-2">
                            {/* Handover / Pickup button: STRICTLY for Code 2 (CCI send to CWH) */}
                            {isPickupPending ? (
                              <button
                                onClick={() => onOpenPickupModal?.(so)}
                                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-colors cursor-pointer"
                                title="AWB issued from CWH: Handover consignment to courier & record pickup status"
                              >
                                <Truck className="w-3.5 h-3.5" />
                                Handover
                              </button>
                            ) : motoInfo.code === 2 && hasAwb ? (
                              <button
                                onClick={() => onOpenPickupModal?.(so)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer"
                                title="View or Edit AWB Details / Pickup Status"
                              >
                                <Truck className="w-3.5 h-3.5" />
                                Edit
                              </button>
                            ) : null}

                            <button
                              onClick={() => printConsignmentManifest(so, orderItems, station)}
                              className="inline-flex items-center justify-center p-1.5 rounded-lg text-xs font-medium bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition-colors cursor-pointer shadow-xs"
                              title="Print Consignment Manifest"
                            >
                              <Printer className="w-3.5 h-3.5 text-slate-600" />
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
          <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-700">Filter by Motorola Status:</span>
              <select
                value={itemStatusFilter}
                onChange={(e) => setItemStatusFilter(e.target.value)}
                aria-label="Filter items by Motorola Status"
                className="bg-slate-50 border border-slate-300 text-slate-700 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-[#001489] transition-colors"
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

            <div className="text-xs text-slate-500">
              Showing <strong className="text-slate-900 font-mono">{displayedItems.length}</strong> items
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100/90 text-slate-600 border-b border-slate-200 font-mono text-[11px] tracking-wider uppercase">
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
                <tbody className="divide-y divide-slate-200 text-slate-700 bg-white">
                  {displayedItems.map((item) => {
                    const motoInfo = getMotorolaStatusInfo(item.motorola_parts_status);
                    const isNotReturn = motoInfo.code === 1;

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3.5 font-mono font-medium text-slate-900 whitespace-nowrap align-middle">{item.sr_number}</td>
                        <td className="py-3 px-3.5 font-mono text-sky-700 whitespace-nowrap align-middle font-medium">{item.sr_part_number}</td>
                        <td className="py-3 px-3.5 text-slate-800 whitespace-nowrap align-middle">{item.part_category}</td>
                        <td className="py-3 px-3.5 text-slate-500 max-w-xs truncate align-middle">{item.part_description}</td>
                        <td className="py-3 px-3.5 whitespace-nowrap align-middle text-slate-700">{item.sr_model_name || '-'}</td>
                        <td className="py-3 px-3 text-center font-mono font-semibold text-slate-900 whitespace-nowrap align-middle">{item.quantity || 1}</td>
                        <td className="py-3 px-3.5 font-mono text-slate-600 whitespace-nowrap align-middle">{item.shipping_order_code}</td>
                        
                        {/* Motorola Status */}
                        <td className="py-3 px-3.5 whitespace-nowrap align-middle">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${motoInfo.badgeClass} inline-block whitespace-nowrap`}
                            title={motoInfo.meaning}
                          >
                            {motoInfo.label}
                          </span>
                          {isNotReturn && (
                            <div className="text-[9px] text-amber-700 font-semibold mt-0.5">
                              Action: Create DC in Moto CRM
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-3.5 text-right font-mono font-bold text-emerald-700 whitespace-nowrap align-middle">
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

