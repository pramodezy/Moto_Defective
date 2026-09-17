import React, { useState, useMemo, useEffect } from 'react';
import { 
  Store, 
  Truck, 
  Layers, 
  CheckCircle2, 
  AlertTriangle, 
  MapPin, 
  Barcode, 
  FileText, 
  Clock, 
  AlertCircle, 
  PackageCheck, 
  Send, 
  Search, 
  X 
} from 'lucide-react';
import { ShippingOrder, DefectiveItem, CCIMaster } from '../../types/crm';
import { formatINR, formatDate, getCrmStatusStyle } from '../../lib/utils';
import { SlaBadge } from '../layout/SlaBadge';
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
  const [searchQuery, setSearchQuery] = useState('');

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
  // STRICT RULE: A CCI will handover shipments ONLY where Motorola Status is "CCI Send to CWH" (Code 2).
  // Once updated to "CWH Received" or further, a CCI has NO action to take!
  const pickupHandoverOrders = useMemo(() => {
    return stationOrders.filter((o) => {
      const moto = getMotorolaStatusInfo(o.motorola_status);
      // Strictly only Code 2 (CCI Send to CWH) is eligible for CCI handover!
      if (moto.code !== 2) return false;
      if (o.pickup_status === 'Pickup Done') return false;
      if (o.crm_status === 'Pending AWB Re-Issue' || o.pickup_status === 'Pickup Not Done') return false;
      if (
        o.crm_status === 'In Transit' || 
        o.crm_status === 'Delivered at CWH' || 
        o.crm_status === 'Pending Inward at CWH' || 
        o.crm_status === 'CWH to Create DC' || 
        o.crm_status === 'Pickup Pending for RC' || 
        o.crm_status === 'In Transit to RC' || 
        o.crm_status === 'Delivered to RC' || 
        o.crm_status === 'Discrepancies' || 
        o.crm_status === 'Delivered to RC (Discrepancies)'
      ) {
        return false;
      }
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

  // Filtered consignments based on search query
  const filteredOrders = useMemo(() => {
    let result = displayedOrders;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (o) =>
          o.so_code.toLowerCase().includes(q) ||
          (o.active_awb || '').toLowerCase().includes(q) ||
          (o.excel_ref_awb || '').toLowerCase().includes(q) ||
          (o.courier || '').toLowerCase().includes(q) ||
          (o.motorola_status || '').toLowerCase().includes(q) ||
          (o.crm_status || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [displayedOrders, searchQuery]);

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
      {/* Action Hub for CCI (Side-by-Side Action Cards) */}
      {(notReturnItems.length > 0 || pickupHandoverOrders.length > 0 || pendingReissueOrders.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {/* Action Card 1: Not Return -> Create DC */}
          {notReturnItems.length > 0 && (
            <div className="p-4 rounded-xl bg-gradient-to-br from-amber-50/90 to-amber-100/50 border border-amber-300 flex flex-col justify-between gap-3 shadow-xs">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-amber-200/70 text-amber-800 shrink-0 mt-0.5">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div className="text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-amber-950 text-sm">Action: Create Delivery Challan (DC)</span>
                    <span className="px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-900 font-mono font-bold text-[11px]">
                      {notReturnItems.length}
                    </span>
                  </div>
                  <p className="text-amber-900/80 mt-1 leading-relaxed">
                    {notReturnItems.length} defective part{notReturnItems.length > 1 ? 's are' : ' is'} at the station in <strong>&quot;Not Return&quot;</strong> status. Create an official DC in Motorola CRM to begin dispatch.
                  </p>
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <button
                  onClick={() => {
                    handleViewChange('items');
                    setItemStatusFilter('1');
                  }}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white transition-colors shadow-xs cursor-pointer"
                >
                  View Parts &amp; Create DC ({notReturnItems.length})
                </button>
              </div>
            </div>
          )}

          {/* Action Card 2: AWB Ready -> Handover to Courier */}
          {pickupHandoverOrders.length > 0 && (
            <div className="p-4 rounded-xl bg-gradient-to-br from-sky-50/90 to-blue-100/50 border border-sky-300 flex flex-col justify-between gap-3 shadow-xs">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-sky-200/70 text-sky-800 shrink-0 mt-0.5">
                  <Truck className="w-5 h-5" />
                </div>
                <div className="text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sky-950 text-sm">Action: Courier Pickup Handover</span>
                    <span className="px-1.5 py-0.5 rounded-full bg-sky-200 text-sky-900 font-mono font-bold text-[11px]">
                      {pickupHandoverOrders.length}
                    </span>
                  </div>
                  <p className="text-sky-900/80 mt-1 leading-relaxed">
                    AWB token assigned for {pickupHandoverOrders.length} consignment{pickupHandoverOrders.length > 1 ? 's' : ''}. Handover parcel to courier and record status (Pickup Done / Not Done).
                  </p>
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <button
                  onClick={() => {
                    handleViewChange('consignments');
                    setConsignmentFilter('action_pickup');
                  }}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#001489] hover:bg-[#08209e] text-white transition-colors shadow-xs cursor-pointer"
                >
                  Handover Parcels ({pickupHandoverOrders.length})
                </button>
              </div>
            </div>
          )}

          {/* Exception Card: Pickup Not Done */}
          {pendingReissueOrders.length > 0 && (
            <div className={`p-4 rounded-xl bg-rose-50 border-2 border-rose-400 shadow-xs flex flex-col justify-between gap-3 ${
              (notReturnItems.length > 0 && pickupHandoverOrders.length > 0) ? 'col-span-1 md:col-span-2' : ''
            }`}>
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-rose-100 text-rose-700 shrink-0 mt-0.5">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="text-xs">
                  <h4 className="font-bold text-rose-950">
                    Pickup Exception: {pendingReissueOrders.length} Consignment{pendingReissueOrders.length > 1 ? 's' : ''} Marked &quot;Pickup Not Done&quot;
                  </h4>
                  <p className="text-rose-900/90 mt-0.5">
                    Courier pickup failed. CWH logistics has been notified to cancel previous tokens and re-issue fresh AWBs for your station.
                  </p>
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <button
                  onClick={() => {
                    handleViewChange('consignments');
                    setConsignmentFilter('pending_reissue');
                  }}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-700 hover:bg-rose-800 text-white transition-colors shadow-xs cursor-pointer"
                >
                  View Exceptions ({pendingReissueOrders.length})
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5-Stage Station Pipeline Lifecycle Metrics (Interactive Primary Filters) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Total Consignments */}
        <div 
          onClick={() => { handleViewChange('consignments'); setConsignmentFilter('all'); }}
          className={`p-3.5 rounded-xl border-2 transition-all cursor-pointer ${
            consignmentFilter === 'all'
              ? 'border-[#001489] bg-blue-50/50 shadow-sm ring-2 ring-blue-100'
              : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between text-xs">
            <span className={`font-semibold ${consignmentFilter === 'all' ? 'text-[#001489]' : 'text-slate-600'}`}>
              Total Orders
            </span>
            <Store className={`w-4 h-4 ${consignmentFilter === 'all' ? 'text-[#001489]' : 'text-slate-400'}`} />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
            {stationOrders.length}
          </div>
          <span className="text-[10px] text-slate-500 block truncate font-mono">
            Pipeline: {formatINR(totalValue)}
          </span>
        </div>

        {/* Stage 1: Waiting CWH AWB */}
        <div 
          onClick={() => { handleViewChange('consignments'); setConsignmentFilter('waiting_awb'); }}
          className={`p-3.5 rounded-xl border-2 transition-all cursor-pointer ${
            consignmentFilter === 'waiting_awb'
              ? 'border-slate-700 bg-slate-100/90 shadow-sm ring-2 ring-slate-200'
              : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between text-xs">
            <span className={`font-semibold ${consignmentFilter === 'waiting_awb' ? 'text-slate-900' : 'text-slate-600'}`}>
              Awaiting AWB
            </span>
            <Clock className={`w-4 h-4 ${consignmentFilter === 'waiting_awb' ? 'text-slate-700' : 'text-slate-400'}`} />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-800 mt-1">
            {awaitingCwhAwbOrders.length}
          </div>
          <span className="text-[10px] text-slate-500 block truncate">DC created; pending AWB</span>
        </div>

        {/* Stage 2: Ready for Pickup (Action) */}
        <div 
          onClick={() => { handleViewChange('consignments'); setConsignmentFilter('action_pickup'); }}
          className={`p-3.5 rounded-xl border-2 transition-all cursor-pointer ${
            consignmentFilter === 'action_pickup'
              ? 'border-amber-500 bg-amber-50 shadow-sm ring-2 ring-amber-200'
              : pickupHandoverOrders.length > 0 
              ? 'border-amber-300 bg-amber-50/50 hover:bg-amber-50/80 hover:shadow-xs' 
              : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-amber-900">
            <span>Action: Pickup</span>
            <Truck className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-800 mt-1">
            {pickupHandoverOrders.length}
          </div>
          <span className="text-[10px] text-amber-700/80 block truncate">Handover to courier</span>
        </div>

        {/* Stage 3: In-Transit */}
        <div 
          onClick={() => { handleViewChange('consignments'); setConsignmentFilter('in_transit_monitor'); }}
          className={`p-3.5 rounded-xl border-2 transition-all cursor-pointer ${
            consignmentFilter === 'in_transit_monitor'
              ? 'border-sky-600 bg-sky-50 shadow-sm ring-2 ring-sky-200'
              : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between text-xs">
            <span className={`font-semibold ${consignmentFilter === 'in_transit_monitor' ? 'text-sky-900' : 'text-slate-600'}`}>
              In-Transit
            </span>
            <Send className={`w-4 h-4 ${consignmentFilter === 'in_transit_monitor' ? 'text-sky-600' : 'text-slate-400'}`} />
          </div>
          <div className="text-2xl font-bold font-mono text-sky-700 mt-1">
            {inTransitMonitorOrders.length}
          </div>
          <span className="text-[10px] text-slate-500 block truncate">En route to CWH</span>
        </div>

        {/* Stage 4: At CWH & RC (Delivered) */}
        <div 
          onClick={() => { handleViewChange('consignments'); setConsignmentFilter('cwh_received'); }}
          className={`p-3.5 rounded-xl border-2 transition-all cursor-pointer ${
            consignmentFilter === 'cwh_received' || consignmentFilter === 'delivered'
              ? 'border-purple-600 bg-purple-50 shadow-sm ring-2 ring-purple-200'
              : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between text-xs">
            <span className={`font-semibold ${consignmentFilter === 'cwh_received' || consignmentFilter === 'delivered' ? 'text-purple-900' : 'text-slate-600'}`}>
              At CWH &amp; RC
            </span>
            <PackageCheck className={`w-4 h-4 ${consignmentFilter === 'cwh_received' || consignmentFilter === 'delivered' ? 'text-purple-600' : 'text-slate-400'}`} />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-800 mt-1">
            {cwhStageOrders.length + deliveredOrders.length}
          </div>
          <span className="text-[10px] text-slate-500 block truncate">Delivered / No action</span>
        </div>
      </div>

      {/* Consignments Table & Search Toolbar */}
      {activeView === 'consignments' && (
        <div className="space-y-3">
          {/* Table Header / Toolbar (Search + Active Filter State) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1 pt-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                {consignmentFilter === 'all' && 'All Consignments'}
                {consignmentFilter === 'action_pickup' && 'Action Required: Pickup Handover Pending'}
                {consignmentFilter === 'waiting_awb' && 'DC Created — Awaiting CWH AWB'}
                {consignmentFilter === 'in_transit_monitor' && 'In-Transit to CWH'}
                {(consignmentFilter === 'cwh_received' || consignmentFilter === 'delivered') && 'At CWH / Delivered to RC'}
                {consignmentFilter === 'pending_reissue' && 'Pickup Exceptions — Waiting Re-Issue'}
              </span>
              <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                {filteredOrders.length}
              </span>
              {consignmentFilter !== 'all' && (
                <button
                  onClick={() => setConsignmentFilter('all')}
                  className="text-[11px] text-sky-700 hover:text-sky-900 hover:underline font-medium cursor-pointer ml-1"
                >
                  Show all ({stationOrders.length})
                </button>
              )}
            </div>

            {/* Quick Search Input */}
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search SO code, AWB, courier..."
                className="w-full pl-8 pr-7 py-1.5 rounded-lg text-xs bg-white border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#001489] focus:ring-1 focus:ring-[#001489] transition-all shadow-2xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
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
                  {filteredOrders.map((so) => {
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
                          {hasAwb ? (
                            <>
                              <div className="text-slate-800 font-medium text-xs">{so.courier || '-'}</div>
                              <div className="font-mono text-sky-800 text-[11px] mt-0.5 font-medium">
                                {so.active_awb || so.excel_ref_awb}
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="text-slate-400 font-medium text-xs">-</div>
                              <div className="text-amber-800 font-medium text-[11px] mt-0.5">
                                {motoInfo.isDelivered ? 'Delivered' : 'Pending CWH AWB'}
                              </div>
                            </>
                          )}
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
                          {motoInfo.code === 5 || motoInfo.code === 6 || (so.motorola_status || '').toLowerCase().includes('rc received') || cciAction.actionType === 'DELIVERED_RC' || so.crm_status === 'Delivered to RC' ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-800 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              Delivered to RC
                            </span>
                          ) : motoInfo.code === 4 || (so.motorola_status || '').toLowerCase().includes('send to rc') || cciAction.actionType === 'DISPATCHED_TO_RC' || so.crm_status === 'Pickup Pending for RC' || so.crm_status === 'In Transit to RC' ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-blue-800 font-medium">
                              <Send className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                              CWH Shipped to RC
                            </span>
                          ) : motoInfo.code === 3 || motoInfo.code === 35 || (so.motorola_status || '').toLowerCase().includes('cwh received') || cciAction.actionType === 'DELIVERED_CWH' || so.crm_status === 'Delivered at CWH' || so.crm_status === 'Pending Inward at CWH' || so.crm_status === 'CWH to Create DC' ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-purple-800 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5 text-purple-700 shrink-0" />
                              At CWH (Verified)
                            </span>
                          ) : so.crm_status === 'Pending AWB Re-Issue' || so.pickup_status === 'Pickup Not Done' || cciAction.actionType === 'AWAITING_REISSUE' ? (
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
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs text-amber-800 font-medium">
                              <Clock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                              CCI to Create DC
                            </span>
                          )}
                        </td>

                        {/* 7. Pickup Status */}
                        <td className="py-3 px-3.5 whitespace-nowrap align-middle">
                          {motoInfo.code >= 3 || motoInfo.code === 35 || motoInfo.isDelivered || (so.motorola_status || '').toLowerCase().includes('cwh received') || (so.motorola_status || '').toLowerCase().includes('rc received') || (so.motorola_status || '').toLowerCase().includes('send to rc') ? (
                            <span className="text-slate-400 font-mono text-sm px-2 font-semibold inline-block" title="No action required from CCI (Shipment is at CWH Received or further)">
                              -
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
                            {motoInfo.code === 2 && isPickupPending ? (
                              <button
                                onClick={() => onOpenPickupModal?.(so)}
                                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-colors cursor-pointer"
                                title="Motorola Status is 'CCI Send to CWH': Handover consignment to courier & record pickup status"
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
                            ) : (
                              <span className="text-slate-400 font-mono text-xs">-</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {filteredOrders.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        {searchQuery ? `No consignments match "${searchQuery}".` : `No consignments match this filter for Station ${stationCode}.`}
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

