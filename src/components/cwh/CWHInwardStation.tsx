import React, { useState, useMemo } from 'react';
import { 
  PackageCheck, 
  Search, 
  Barcode, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Truck, 
  Video, 
  ArrowRight,
  ShieldAlert,
  Building2,
  Filter,
  Send,
  Archive
} from 'lucide-react';
import { ShippingOrder, DefectiveItem, CCIMaster, UserProfile } from '../../types/crm';
import { formatINR, formatDate, getCrmStatusStyle } from '../../lib/utils';
import { SlaBadge } from '../layout/SlaBadge';
import { 
  getMotorolaStatusInfo, 
  isAwbIssueRequired, 
  getCwhActionDetails 
} from '../../lib/motorolaStatus';

interface CWHInwardStationProps {
  orders: ShippingOrder[];
  items: DefectiveItem[];
  stations: CCIMaster[];
  user: UserProfile;
  onOpenUnboxing: (order: ShippingOrder) => void;
  onOpenAwbModal: (order: ShippingOrder) => void;
  onSelectOrder: (order: ShippingOrder) => void;
}

export const CWHInwardStation: React.FC<CWHInwardStationProps> = ({
  orders,
  items,
  stations,
  user,
  onOpenUnboxing,
  onOpenAwbModal,
  onSelectOrder,
}) => {
  const [scanInput, setScanInput] = useState('');
  const [selectedStation, setSelectedStation] = useState<string>('ALL');
  const [selectedRegion, setSelectedRegion] = useState<string>('ALL');
  const [activeSubTab, setActiveSubTab] = useState<'needs_awb' | 'in_transit' | 'at_cwh' | 'discrepancies' | 'history'>('needs_awb');

  // Station name lookup with code normalization
  const stationMap = useMemo(() => {
    const normalizeCode = (c: string) => String(c || '').trim().replace(/^0+/, '') || String(c || '').trim();
    const map = new Map<string, CCIMaster>();
    stations.forEach((st) => {
      map.set(st.station_code, st);
      map.set(st.station_code.padStart(3, '0'), st);
      map.set(normalizeCode(st.station_code), st);
    });
    return map;
  }, [stations]);

  // Unique list of regions
  const availableRegions = useMemo(() => {
    const regSet = new Set<string>();
    stations.forEach((st) => {
      if (st.region?.trim()) regSet.add(st.region.trim());
    });
    if (regSet.size === 0) {
      ['Central', 'East', 'North', 'South', 'West'].forEach((r) => regSet.add(r));
    }
    return Array.from(regSet).sort();
  }, [stations]);

  // Quick scanner handler
  const handleQuickScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanInput.trim()) return;

    const term = scanInput.trim().toLowerCase();
    const matchedOrder = orders.find(
      (o) =>
        o.so_code.toLowerCase() === term ||
        (o.active_awb && o.active_awb.toLowerCase() === term) ||
        (o.excel_ref_awb && o.excel_ref_awb.toLowerCase() === term)
    );

    if (matchedOrder) {
      onOpenUnboxing(matchedOrder);
      setScanInput('');
    } else {
      alert(`No active consignment found matching barcode "${scanInput}". Please verify the SO or AWB number.`);
    }
  };

  // Station and Region filtered orders
  const stationScopedOrders = useMemo(() => {
    return orders.filter((o) => {
      if (selectedStation !== 'ALL' && o.station_code !== selectedStation) {
        return false;
      }
      const st = stationMap.get(o.station_code);
      const effectiveRegion = st?.region || o.region || 'West';
      if (selectedRegion !== 'ALL' && effectiveRegion !== selectedRegion) {
        return false;
      }
      return true;
    });
  }, [orders, selectedStation, selectedRegion, stationMap]);

  // Categorize orders strictly according to Motorola parts statuses and actionable requirements
  // 1. Needs AWB Issue: Only active 'CCI send to CWH' lacking AWB token (strictly excludes delivered cases)
  const needsAwbOrders = useMemo(() => {
    return stationScopedOrders.filter((o) => isAwbIssueRequired(o));
  }, [stationScopedOrders]);

  // 2. Pending Inward / CCTV: In transit to CWH with AWB, awaiting CCTV verification
  const inTransitOrders = useMemo(() => {
    return stationScopedOrders.filter((o) => {
      if (isAwbIssueRequired(o)) return false;
      if (o.crm_status === 'Closed' || o.crm_status === 'CWH Received' || o.crm_status === 'Discrepancy Tagged') return false;
      const moto = (o.motorola_status || '').toLowerCase();
      if (moto.includes('rc received') || moto.includes('cwh received') || moto.includes('send to rc')) return false;
      return o.crm_status === 'In Transit' || !!(o.active_awb || o.excel_ref_awb);
    });
  }, [stationScopedOrders]);

  // 3. At CWH -> Dispatch to RC: Arrived at CWH in Moto CRM (actionable: verify and create DC to RC in Lenovo CRM)
  const atCwhOrders = useMemo(() => {
    return stationScopedOrders.filter((o) => {
      const moto = (o.motorola_status || '').toLowerCase();
      return o.crm_status === 'CWH Received' || (moto.includes('cwh received') && o.crm_status !== 'Closed');
    });
  }, [stationScopedOrders]);

  // 4. Flagged Discrepancies: Shortage / damage detected
  const discrepancyOrders = useMemo(() => {
    return stationScopedOrders.filter((o) => {
      const moto = (o.motorola_status || '').toLowerCase();
      return o.crm_status === 'Discrepancy Tagged' || moto.includes('negative');
    });
  }, [stationScopedOrders]);

  // 5. Delivered Archive & History: RC Received ASP, ASP Send to RC, Closed (No AWB needed)
  const historyOrders = useMemo(() => {
    return stationScopedOrders.filter((o) => {
      const moto = (o.motorola_status || '').toLowerCase();
      return (
        o.crm_status === 'Closed' ||
        o.crm_status === 'Dispatched to RC' ||
        moto.includes('rc received') ||
        moto.includes('send to rc')
      );
    });
  }, [stationScopedOrders]);

  const currentDisplayOrders = useMemo(() => {
    switch (activeSubTab) {
      case 'needs_awb':
        return needsAwbOrders;
      case 'in_transit':
        return inTransitOrders;
      case 'at_cwh':
        return atCwhOrders;
      case 'discrepancies':
        return discrepancyOrders;
      case 'history':
        return historyOrders;
      default:
        return needsAwbOrders;
    }
  }, [activeSubTab, needsAwbOrders, inTransitOrders, atCwhOrders, discrepancyOrders, historyOrders]);

  return (
    <div className="space-y-6">
      {/* CWH Station Banner & Barcode Scanner Station */}
      <div className="rounded-2xl p-6 bg-gradient-to-r from-[#101a35] via-[#141f42] to-[#1a2046] border border-indigo-500/40 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-1 max-w-xl">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                <Video className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-xl font-bold text-white font-['Outfit']">
                  CWH Inward Verification & Logistics Hub
                </h2>
                <p className="text-xs text-indigo-200">
                  Bay 4 • Lead: <strong className="text-white">{user.full_name}</strong> • Station-wise tracking & action dispatch
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-300 mt-2">
              Issue AWB tokens for pending service center dispatches, verify incoming parcels under CCTV surveillance, and create outbound delivery challans to Repair Centers (RC).
            </p>
          </div>

          {/* Quick Scanner Box */}
          <form onSubmit={handleQuickScan} className="w-full lg:max-w-md">
            <div className="p-3.5 rounded-xl bg-[#0b1329] border-2 border-indigo-500/50 shadow-inner">
              <label className="text-[11px] font-semibold text-indigo-300 flex items-center gap-1.5 uppercase tracking-wider mb-2">
                <Barcode className="w-4 h-4 text-indigo-400 animate-pulse" />
                Barcode Scanner / Rapid Inward Input
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  placeholder="Scan SO Code or Courier AWB..."
                  className="flex-1 bg-[#101a35] border border-[#1f2e5a] rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-indigo-400"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition-colors"
                >
                  Inspect
                </button>
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">
                Tip: Scan manifest barcode or SO Code (e.g. <code>SORLC26051500115</code>)
              </span>
            </div>
          </form>
        </div>
      </div>

      {/* Station & Region Filter Bar for Complete Station-wise Data Exploration */}
      <div className="p-4 rounded-xl bg-[#101a35] border border-[#1c2b53] flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-semibold text-slate-200">Station Scope:</span>
          
          <select
            value={selectedStation}
            onChange={(e) => setSelectedStation(e.target.value)}
            aria-label="Filter by Station"
            className="bg-[#0b1329] border border-[#1f2e5a] text-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-cyan-500 max-w-xs"
          >
            <option value="ALL">All Stations ({orders.length} total consignments)</option>
            {stations.map((st) => (
              <option key={st.station_code} value={st.station_code}>
                {st.station_code} - {st.station_name} {st.city ? `(${st.city})` : ''}
              </option>
            ))}
          </select>

          <select
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
            aria-label="Filter by Region"
            className="bg-[#0b1329] border border-[#1f2e5a] text-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Regions</option>
            {availableRegions.map((reg) => (
              <option key={reg} value={reg}>
                {reg} Region
              </option>
            ))}
          </select>
        </div>

        <div className="text-xs text-slate-400 flex items-center gap-3">
          <span>
            Total in scope: <strong className="text-white font-mono">{stationScopedOrders.length}</strong> consignments
          </span>
          {selectedStation !== 'ALL' && (
            <button
              onClick={() => { setSelectedStation('ALL'); setSelectedRegion('ALL'); }}
              className="text-cyan-400 hover:underline text-xs"
            >
              Reset Station Filter
            </button>
          )}
        </div>
      </div>

      {/* Action-Focused Subtabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#1f2e5a] pb-3">
        {/* Queue 1: Needs AWB Issue */}
        <button
          onClick={() => setActiveSubTab('needs_awb')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeSubTab === 'needs_awb'
              ? 'bg-amber-600 text-white shadow-lg'
              : 'bg-[#101a35] text-amber-300 hover:text-white border border-amber-500/30'
          }`}
        >
          <Barcode className="w-3.5 h-3.5" />
          ⚡ Action: Issue AWB Token ({needsAwbOrders.length})
        </button>

        {/* Queue 2: Awaiting CCTV Unboxing */}
        <button
          onClick={() => setActiveSubTab('in_transit')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeSubTab === 'in_transit'
              ? 'bg-indigo-600 text-white shadow-lg'
              : 'bg-[#101a35] text-slate-400 hover:text-slate-200 border border-[#1c2b53]'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          📹 In Transit / Awaiting Inward ({inTransitOrders.length})
        </button>

        {/* Queue 3: At CWH -> Dispatch to RC */}
        <button
          onClick={() => setActiveSubTab('at_cwh')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeSubTab === 'at_cwh'
              ? 'bg-blue-600 text-white shadow-lg'
              : 'bg-[#101a35] text-blue-300 hover:text-white border border-blue-500/30'
          }`}
        >
          <Send className="w-3.5 h-3.5" />
          🏢 At CWH → Create DC to RC ({atCwhOrders.length})
        </button>

        {/* Queue 4: Flagged Discrepancies */}
        <button
          onClick={() => setActiveSubTab('discrepancies')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeSubTab === 'discrepancies'
              ? 'bg-rose-600 text-white shadow-lg'
              : 'bg-[#101a35] text-slate-400 hover:text-slate-200 border border-[#1c2b53]'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          ⚠️ Discrepancies ({discrepancyOrders.length})
        </button>

        {/* Queue 5: Delivered Archive & History */}
        <button
          onClick={() => setActiveSubTab('history')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeSubTab === 'history'
              ? 'bg-emerald-700 text-white shadow-lg'
              : 'bg-[#101a35] text-slate-400 hover:text-slate-200 border border-[#1c2b53]'
          }`}
        >
          <Archive className="w-3.5 h-3.5" />
          ✓ Delivered to RC / Archive ({historyOrders.length})
        </button>
      </div>

      {/* Cards Grid for Consignments */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {currentDisplayOrders.map((so) => {
          const station = stationMap.get(so.station_code);
          const orderItems = items.filter((i) => i.shipping_order_code === so.so_code);
          const isCritical = so.priority_tier === 1;
          const motoInfo = getMotorolaStatusInfo(so.motorola_status);
          const cwhAction = getCwhActionDetails(so);
          const needsAwb = isAwbIssueRequired(so);

          return (
            <div
              key={so.id}
              className={`rounded-xl border p-4 bg-[#101a35] transition-all hover:border-indigo-500/50 hover:shadow-lg flex flex-col justify-between ${
                needsAwb
                  ? 'border-amber-500/40 bg-gradient-to-b from-amber-950/20 to-[#101a35]'
                  : isCritical
                  ? 'border-red-500/40 bg-gradient-to-b from-red-950/20 to-[#101a35]'
                  : 'border-[#1c2b53]'
              }`}
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      Shipping Order
                    </span>
                    <button
                      onClick={() => onSelectOrder(so)}
                      className="block text-sm font-bold text-white font-mono hover:text-cyan-400 hover:underline text-left"
                    >
                      {so.so_code}
                    </button>
                  </div>
                  <SlaBadge tier={so.priority_tier} ageDays={so.max_sr_age} />
                </div>

                {/* Motorola Status Badge & Action Prompt */}
                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${motoInfo.badgeClass}`}
                    title={motoInfo.meaning}
                  >
                    {motoInfo.label}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${getCrmStatusStyle(so.crm_status)}`}>
                    {so.crm_status}
                  </span>
                </div>

                {/* CWH Action Banner */}
                {cwhAction.isActionable && (
                  <div className={`mt-2 p-2 rounded-lg text-[11px] border ${
                    cwhAction.actionType === 'ISSUE_AWB'
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                      : cwhAction.actionType === 'DISPATCH_TO_RC'
                      ? 'bg-blue-500/15 border-blue-500/40 text-blue-200'
                      : 'bg-indigo-500/15 border-indigo-500/40 text-indigo-200'
                  }`}>
                    <div className="font-semibold flex items-center gap-1">
                      {cwhAction.actionType === 'ISSUE_AWB' && <Barcode className="w-3 h-3 text-amber-400" />}
                      {cwhAction.actionType === 'DISPATCH_TO_RC' && <Send className="w-3 h-3 text-blue-400" />}
                      {cwhAction.actionType === 'INWARD_VERIFY' && <Video className="w-3 h-3 text-indigo-400" />}
                      {cwhAction.title}
                    </div>
                    <div className="text-[10px] text-slate-300 mt-0.5">{cwhAction.description}</div>
                  </div>
                )}

                {/* Station & Region */}
                <div className="mt-2.5 p-2 rounded-lg bg-[#0b1329] border border-[#1f2e5a] text-xs">
                  <div className="flex justify-between items-center text-slate-300">
                    <span>
                      Station: <strong className="text-white font-mono">{so.station_code}</strong>
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-cyan-300 font-medium">
                      {station?.region || so.region || 'West'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 truncate mt-0.5">
                    {station?.station_name || 'Service Center'}
                    {(station?.city || so.city) && (
                      <span className="text-cyan-400/80"> • {[station?.city || so.city, station?.state || so.state].filter(Boolean).join(', ')}</span>
                    )}
                  </div>
                </div>

                {/* Metrics */}
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400 text-[11px]">Declared Value</span>
                    <div className="font-mono font-bold text-emerald-400 mt-0.5">
                      {formatINR(so.total_declared_value)}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[11px]">Constituent Items</span>
                    <div className="font-mono font-bold text-white mt-0.5">
                      {orderItems.length} items
                    </div>
                  </div>
                </div>

                {/* Active AWB & Pickup Status */}
                <div className="mt-3 pt-2.5 border-t border-[#1c2b53] flex items-center justify-between text-xs">
                  <span className="text-slate-400">Courier AWB:</span>
                  <span className="font-mono font-medium text-cyan-400">
                    {so.active_awb || so.excel_ref_awb || (motoInfo.isDelivered ? 'Delivered (Direct)' : 'None')}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-4 pt-3 border-t border-[#1c2b53] flex items-center gap-2">
                {/* Unbox Under CCTV Button */}
                {!motoInfo.isDelivered && (
                  <button
                    onClick={() => onOpenUnboxing(so)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow transition-colors"
                  >
                    <Video className="w-3.5 h-3.5" />
                    {so.crm_status === 'CWH Received' ? 'Review Inspection' : 'Unbox Under CCTV'}
                  </button>
                )}

                {/* Issue AWB Button (Only if AWB is needed or actively retokenable; NOT on delivered) */}
                {needsAwb ? (
                  <button
                    onClick={() => onOpenAwbModal(so)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow transition-all"
                  >
                    <Barcode className="w-3.5 h-3.5" />
                    Issue AWB
                  </button>
                ) : !motoInfo.isDelivered && (
                  <button
                    onClick={() => onOpenAwbModal(so)}
                    title="Assign / Retoken AWB"
                    className="px-3 py-2 rounded-lg text-xs font-medium bg-[#1a274c] hover:bg-[#233566] text-slate-200 border border-[#1f2e5a] transition-colors"
                  >
                    AWB
                  </button>
                )}

                {/* If already delivered, show Review Manifest / View button */}
                {motoInfo.isDelivered && (
                  <button
                    onClick={() => onSelectOrder(so)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[#102a20] hover:bg-[#14382c] text-emerald-300 border border-emerald-500/30 transition-colors"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    Delivered to RC (View Details)
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {currentDisplayOrders.length === 0 && (
          <div className="col-span-full py-16 text-center text-slate-400">
            <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500 mb-2 opacity-80" />
            <h4 className="text-base font-semibold text-white">All caught up!</h4>
            <p className="text-xs text-slate-400 mt-1">
              {activeSubTab === 'needs_awb'
                ? 'No active consignments currently require AWB issuance from CWH.'
                : activeSubTab === 'in_transit'
                ? 'No consignments currently in transit awaiting inward verification.'
                : activeSubTab === 'at_cwh'
                ? 'No consignments currently at CWH awaiting DC creation to RC.'
                : activeSubTab === 'discrepancies'
                ? 'No discrepancies flagged currently.'
                : 'No historical delivered records found matching the filter.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

