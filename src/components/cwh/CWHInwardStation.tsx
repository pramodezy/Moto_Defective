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
  Archive,
  X,
  FileText,
  Layers,
  Sparkles,
  Upload
} from 'lucide-react';
import { ShippingOrder, DefectiveItem, CCIMaster, UserProfile } from '../../types/crm';
import { formatINR, formatDate, getCrmStatusStyle } from '../../lib/utils';
import { SlaBadge } from '../layout/SlaBadge';
import { 
  getMotorolaStatusInfo, 
  isAwbIssueRequired, 
  getCwhActionDetails 
} from '../../lib/motorolaStatus';
import { BulkAwbUploadModal } from './BulkAwbUploadModal';

interface CWHInwardStationProps {
  orders: ShippingOrder[];
  items: DefectiveItem[];
  stations: CCIMaster[];
  user: UserProfile;
  onOpenUnboxing: (order: ShippingOrder) => void;
  onOpenAwbModal: (order: ShippingOrder) => void;
  onSelectOrder: (order: ShippingOrder) => void;
  onDispatchToRc?: (
    soId: string,
    data: { dcNumber: string; courier?: string; remarks?: string }
  ) => void;
}

export const CWHInwardStation: React.FC<CWHInwardStationProps> = ({
  orders,
  items,
  stations,
  user,
  onOpenUnboxing,
  onOpenAwbModal,
  onSelectOrder,
  onDispatchToRc,
}) => {
  const [scanInput, setScanInput] = useState('');
  const [selectedStation, setSelectedStation] = useState<string>('ALL');
  const [selectedRegion, setSelectedRegion] = useState<string>('ALL');
  const [activeSubTab, setActiveSubTab] = useState<
    'needs_awb' | 'awb_reissue' | 'in_transit' | 'at_cwh' | 'discrepancies' | 'outbound_rc' | 'history'
  >('needs_awb');
  const [isBulkAwbModalOpen, setIsBulkAwbModalOpen] = useState(false);

  // Create DC to RC Modal State
  const [dcModalOrder, setDcModalOrder] = useState<ShippingOrder | null>(null);
  const [lenovoDcNumber, setLenovoDcNumber] = useState('');
  const [dcCourier, setDcCourier] = useState('Bluedart Surface');
  const [rcDestination, setRcDestination] = useState('Lenovo/Motorola Central RC (Mumbai)');
  const [dcDocket, setDcDocket] = useState('');
  const [dcRemarks, setDcRemarks] = useState('');

  const handleOpenDcModal = (so: ShippingOrder) => {
    setDcModalOrder(so);
    const suffix = so.so_code.replace(/[^0-9]/g, '').slice(-5) || '101';
    setLenovoDcNumber(`LEN-DC-${suffix}`);
    setDcCourier(so.courier || 'Bluedart Surface');
    setDcDocket('');
    setDcRemarks('');
  };

  const handleConfirmDcToRc = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dcModalOrder || !lenovoDcNumber.trim()) return;
    if (onDispatchToRc) {
      onDispatchToRc(dcModalOrder.id, {
        dcNumber: lenovoDcNumber.trim(),
        courier: dcCourier,
        remarks: [
          rcDestination ? `RC: ${rcDestination}` : '',
          dcDocket.trim() ? `Docket: ${dcDocket.trim()}` : '',
          dcRemarks.trim() ? dcRemarks.trim() : '',
        ].filter(Boolean).join(' | '),
      });
    }
    setDcModalOrder(null);
  };

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
        (o.asp_rc_shipping_order_code && o.asp_rc_shipping_order_code.toLowerCase() === term) ||
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

  // Categorize orders strictly according to the 13 canonical stages:
  // 1. Needs Initial AWB Issue: Active 'CCI send to CWH' awaiting token (excludes re-issues & delivered historical records)
  const needsAwbOrders = useMemo(() => {
    return stationScopedOrders.filter((o) => {
      if (o.crm_status === 'Pending AWB Re-Issue' || o.pickup_status === 'Pickup Not Done') {
        return false;
      }
      return o.crm_status === 'Pending AWB' || (isAwbIssueRequired(o) && !o.active_awb && !o.excel_ref_awb);
    });
  }, [stationScopedOrders]);

  // 2. Pending AWB Re-Issue: Exception state where CCI reported Pickup Not Done; CWH must cancel & re-issue
  const awbReissueOrders = useMemo(() => {
    return stationScopedOrders.filter((o) => {
      return o.crm_status === 'Pending AWB Re-Issue' || o.pickup_status === 'Pickup Not Done';
    });
  }, [stationScopedOrders]);

  // 3. In Transit / Pickup Pending: AWB token active, en route from CCI to CWH
  const inTransitOrders = useMemo(() => {
    return stationScopedOrders.filter((o) => {
      if (o.crm_status === 'Pending AWB Re-Issue' || o.pickup_status === 'Pickup Not Done') return false;
      if (isAwbIssueRequired(o)) return false;
      return o.crm_status === 'Pickup Pending' || o.crm_status === 'In Transit';
    });
  }, [stationScopedOrders]);

  // 4. At CWH -> CCTV Unboxing & Inward: Physical arrival at CWH bay, staging for warehouse entry
  const atCwhOrders = useMemo(() => {
    return stationScopedOrders.filter((o) => {
      return (
        o.crm_status === 'Delivered at CWH' ||
        o.crm_status === 'Pending Inward at CWH' ||
        o.crm_status === 'CWH to Create DC'
      );
    });
  }, [stationScopedOrders]);

  // 5. Flagged Discrepancies: Screening failed at CWH or discrepancy flagged at RC
  const discrepancyOrders = useMemo(() => {
    return stationScopedOrders.filter((o) => {
      return (
        o.crm_status === 'Discrepancies' ||
        o.crm_status === 'Delivered to RC (Discrepancies)'
      );
    });
  }, [stationScopedOrders]);

  // 6. Outbound Leg to RC (Leg 2): CWH created DC; awaits courier pickup or en route to RC
  const outboundRcOrders = useMemo(() => {
    return stationScopedOrders.filter((o) => {
      return (
        o.crm_status === 'Pickup Pending for RC' ||
        o.crm_status === 'In Transit to RC'
      );
    });
  }, [stationScopedOrders]);

  // 7. Delivered Archive & History: RC Received ASP
  const historyOrders = useMemo(() => {
    return stationScopedOrders.filter((o) => {
      const moto = (o.motorola_status || '').toLowerCase();
      return (
        o.crm_status === 'Delivered to RC' ||
        (moto.includes('rc received') && !moto.includes('negative'))
      );
    });
  }, [stationScopedOrders]);

  const currentDisplayOrders = useMemo(() => {
    switch (activeSubTab) {
      case 'needs_awb':
        return needsAwbOrders;
      case 'awb_reissue':
        return awbReissueOrders;
      case 'in_transit':
        return inTransitOrders;
      case 'at_cwh':
        return atCwhOrders;
      case 'discrepancies':
        return discrepancyOrders;
      case 'outbound_rc':
        return outboundRcOrders;
      case 'history':
        return historyOrders;
      default:
        return needsAwbOrders;
    }
  }, [activeSubTab, needsAwbOrders, awbReissueOrders, inTransitOrders, atCwhOrders, discrepancyOrders, outboundRcOrders, historyOrders]);

  return (
    <div className="space-y-6">
      {/* CWH Station Banner & Barcode Scanner Station */}
      <div className="rounded-2xl p-6 bg-white border border-slate-200 shadow-xs relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-1 max-w-xl">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-sky-50 text-[#001489] border border-sky-200">
                <Video className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-xl font-bold text-slate-900 font-['Outfit']">
                  CWH Inward Verification & Logistics Hub
                </h2>
                <p className="text-xs text-slate-500">
                  Bay 4 • Lead: <strong className="text-slate-900 font-semibold">{user.full_name}</strong> • Station-wise tracking & action dispatch
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-600 mt-2">
              Issue AWB tokens for pending service center dispatches, verify incoming parcels under CCTV surveillance, and create outbound delivery challans to Repair Centers (RC).
            </p>
          </div>

          {/* Quick Scanner Box */}
          <form onSubmit={handleQuickScan} className="w-full lg:max-w-md">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 shadow-xs">
              <label className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5 uppercase tracking-wider mb-2">
                <Barcode className="w-4 h-4 text-[#001489]" />
                Barcode Scanner / Rapid Inward Input
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  placeholder="Scan SO Code or Courier AWB..."
                  className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#001489] transition-colors"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#001489] hover:bg-[#08209e] text-white shadow-xs transition-colors cursor-pointer"
                >
                  Inspect
                </button>
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">
                Tip: Scan manifest barcode or SO Code (e.g. <code className="text-[#001489]">SORLC26051500115</code>)
              </span>
            </div>
          </form>
        </div>
      </div>

      {/* Station & Region Filter Bar for Complete Station-wise Data Exploration */}
      <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-sky-600" />
          <span className="text-xs font-semibold text-slate-700">Station Scope:</span>
          
          <select
            value={selectedStation}
            onChange={(e) => setSelectedStation(e.target.value)}
            aria-label="Filter by Station"
            className="bg-slate-50 border border-slate-300 text-slate-700 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#001489] max-w-xs transition-colors"
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
            className="bg-slate-50 border border-slate-300 text-slate-700 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#001489] transition-colors"
          >
            <option value="ALL">All Regions</option>
            {availableRegions.map((reg) => (
              <option key={reg} value={reg}>
                {reg} Region
              </option>
            ))}
          </select>
        </div>

        <div className="text-xs text-slate-500 flex items-center gap-3">
          <span>
            Total in scope: <strong className="text-slate-900 font-mono">{stationScopedOrders.length}</strong> consignments
          </span>
          {selectedStation !== 'ALL' && (
            <button
              onClick={() => { setSelectedStation('ALL'); setSelectedRegion('ALL'); }}
              className="text-[#001489] hover:underline text-xs cursor-pointer font-medium"
            >
              Reset Station Filter
            </button>
          )}
        </div>
      </div>

      {/* Action-Focused Subtabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        {/* Queue 1: Needs Initial AWB Issue */}
        <button
          onClick={() => setActiveSubTab('needs_awb')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeSubTab === 'needs_awb'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'bg-white text-amber-900 hover:bg-amber-50/60 border border-amber-300'
          }`}
        >
          <Barcode className="w-3.5 h-3.5" />
          ⚡ Action: Issue AWB ({needsAwbOrders.length})
        </button>

        {/* Queue 2: Pending AWB Re-Issue (Exception from CCI) */}
        <button
          onClick={() => setActiveSubTab('awb_reissue')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeSubTab === 'awb_reissue'
              ? 'bg-rose-700 text-white shadow-xs'
              : awbReissueOrders.length > 0
              ? 'bg-rose-50 text-rose-800 hover:bg-rose-100 border-2 border-rose-400 font-bold'
              : 'bg-white text-rose-800 hover:bg-rose-50 border border-rose-300'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
          ⚠️ Re-Issue AWB ({awbReissueOrders.length})
        </button>

        {/* Queue 3: In Transit / Pickup Pending */}
        <button
          onClick={() => setActiveSubTab('in_transit')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeSubTab === 'in_transit'
              ? 'bg-[#001489] text-white shadow-xs'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          🚚 In Transit &amp; Pickup Pending ({inTransitOrders.length})
        </button>

        {/* Queue 4: At CWH -> CCTV Unbox & Inward */}
        <button
          onClick={() => setActiveSubTab('at_cwh')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeSubTab === 'at_cwh'
              ? 'bg-purple-700 text-white shadow-xs'
              : 'bg-white text-purple-900 hover:bg-purple-50/60 border border-purple-300'
          }`}
        >
          <Video className="w-3.5 h-3.5" />
          🏢 At CWH / Unbox &amp; DC ({atCwhOrders.length})
        </button>

        {/* Queue 5: Flagged Discrepancies */}
        <button
          onClick={() => setActiveSubTab('discrepancies')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeSubTab === 'discrepancies'
              ? 'bg-rose-600 text-white shadow-xs'
              : 'bg-white text-rose-900 hover:bg-rose-50/60 border border-rose-300'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          ⚠️ Discrepancies ({discrepancyOrders.length})
        </button>

        {/* Queue 6: Outbound Leg to RC (Leg 2) */}
        <button
          onClick={() => setActiveSubTab('outbound_rc')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeSubTab === 'outbound_rc'
              ? 'bg-blue-700 text-white shadow-xs'
              : 'bg-white text-blue-900 hover:bg-blue-50/60 border border-blue-300'
          }`}
        >
          <Send className="w-3.5 h-3.5" />
          📦 Outbound to RC ({outboundRcOrders.length})
        </button>

        {/* Queue 7: Delivered Archive & History */}
        <button
          onClick={() => setActiveSubTab('history')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeSubTab === 'history'
              ? 'bg-emerald-700 text-white shadow-xs'
              : 'bg-white text-emerald-900 hover:bg-emerald-50/60 border border-emerald-300'
          }`}
        >
          <Archive className="w-3.5 h-3.5" />
          ✓ Delivered to RC ({historyOrders.length})
        </button>

        {/* Bulk AWB Update Button for CWH */}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setIsBulkAwbModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs border border-emerald-600 transition-all cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            Bulk AWB Update
          </button>
        </div>
      </div>

      {/* Needs AWB Info & Quick Bulk Action Callout */}
      {activeSubTab === 'needs_awb' && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 rounded-lg bg-amber-100 text-amber-800">
              <Barcode className="w-4 h-4" />
            </span>
            <div>
              <p className="text-xs font-semibold text-amber-900">
                Stage 2: Pending Initial AWB Generation (CWH Action)
              </p>
              <p className="text-[11px] text-amber-800/90">
                Service centers created shipping orders in Moto CRM. Generate AWB tokens on courier portal and issue here for pickup.
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsBulkAwbModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-colors whitespace-nowrap self-start sm:self-auto cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload Bulk AWB Sheet
          </button>
        </div>
      )}

      {/* AWB Re-Issue Callout */}
      {activeSubTab === 'awb_reissue' && (
        <div className="p-3.5 rounded-xl bg-rose-50 border-2 border-rose-400 flex items-center gap-3 shadow-xs">
          <span className="p-2 rounded-lg bg-rose-100 text-rose-800">
            <AlertTriangle className="w-5 h-5 text-rose-700" />
          </span>
          <div className="text-xs">
            <p className="font-bold text-rose-950">
              Stage 4: Pending AWB Re-Issue (Exception Queue)
            </p>
            <p className="text-rose-900/90 mt-0.5">
              Service centers flagged &quot;Pickup Not Done&quot; (courier delayed/missed slot). Please cancel the previous courier token and assign a fresh AWB token to re-attempt pickup.
            </p>
          </div>
        </div>
      )}

      {/* Clean Data Table for Consignments */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100/90 text-slate-600 border-b border-slate-200 font-mono text-[11px] tracking-wider uppercase">
              <tr>
                <th className="py-3 px-3.5 whitespace-nowrap">Shipping Order</th>
                <th className="py-3 px-3.5 whitespace-nowrap">Origin Station &amp; Location</th>
                <th className="py-3 px-3.5 whitespace-nowrap">Status (CRM &amp; Moto)</th>
                <th className="py-3 px-3.5 whitespace-nowrap">Courier &amp; AWB</th>
                <th className="py-3 px-3.5 text-center whitespace-nowrap">Items</th>
                <th className="py-3 px-3.5 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-700 bg-white">
              {currentDisplayOrders.map((so) => {
                const station = stationMap.get(so.station_code);
                const normalize = (s?: string) => (s || '').trim().toLowerCase();
                const orderItems = items.filter(
                  (i) =>
                    normalize(i.shipping_order_code) === normalize(so.so_code) ||
                    (i.shipping_order_id && i.shipping_order_id === so.id)
                );
                const motoInfo = getMotorolaStatusInfo(so.motorola_status);
                const isReissue = so.crm_status === 'Pending AWB Re-Issue' || so.pickup_status === 'Pickup Not Done';
                const isDiscrepancy = 
                  so.crm_status === 'Discrepancies' || 
                  so.crm_status === 'Delivered to RC (Discrepancies)' ||
                  activeSubTab === 'discrepancies';

                return (
                  <tr 
                    key={so.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      isReissue ? 'bg-amber-50/40' : isDiscrepancy ? 'bg-rose-50/50' : ''
                    }`}
                  >
                    {/* Column 1: SO Code & SLA Badge */}
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onSelectOrder(so)}
                          className="font-mono font-bold text-slate-900 hover:text-[#001489] hover:underline cursor-pointer"
                        >
                          {so.so_code}
                        </button>
                        <SlaBadge tier={so.priority_tier} ageDays={so.max_sr_age} />
                      </div>
                      {so.asp_rc_shipping_order_code && (
                        <div className="text-[10px] text-blue-700 font-mono mt-0.5">
                          RC SO: {so.asp_rc_shipping_order_code}
                        </div>
                      )}
                    </td>

                    {/* Column 2: Origin Station & Location */}
                    <td className="py-3 px-3.5">
                      <div className="font-semibold text-slate-900 whitespace-nowrap">
                        Station {so.station_code} - {station?.station_name || 'Service Center'}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 whitespace-nowrap">
                        {[station?.city || so.city, station?.state || so.state].filter(Boolean).join(', ')} 
                        <span className="text-sky-700 ml-1.5 font-medium">({station?.region || so.region || 'West'})</span>
                      </div>
                    </td>

                    {/* Column 3: Status (CRM & Motorola) */}
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      <div className="flex flex-col gap-1 items-start">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${motoInfo.badgeClass}`}>
                          {motoInfo.label}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${getCrmStatusStyle(so.crm_status)}`}>
                          {so.crm_status}
                        </span>
                        {isReissue && (
                          <span className="text-[9px] text-rose-700 font-bold bg-rose-50 px-1 py-0.2 rounded border border-rose-200">
                            Pickup Not Done (Re-Issue Required)
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Column 4: Courier & AWB */}
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      <div className="text-slate-800 font-medium">
                        {(so.active_awb || so.excel_ref_awb) ? (so.courier || '-') : '-'}
                      </div>
                      <div className="font-mono text-sky-800 text-[11px] mt-0.5 font-medium">
                        {so.active_awb || so.excel_ref_awb || (
                          so.crm_status === 'CWH to Create DC'
                            ? <span className="text-purple-800 font-sans font-medium">CWH Inward Done</span>
                            : motoInfo.isDelivered 
                              ? <span className="text-emerald-800 font-sans font-medium">Delivered</span> 
                              : <span className="text-amber-800 font-sans font-medium">Pending CWH AWB</span>
                        )}
                      </div>
                    </td>

                    {/* Column 5: Items Count */}
                    <td className="py-3 px-3.5 text-center font-mono font-bold text-slate-900 whitespace-nowrap">
                      {orderItems.length > 0
                        ? orderItems.reduce((s, i) => s + (parseInt(String(i.quantity || 1), 10) || 1), 0)
                        : (so.total_items || 1)}
                    </td>

                    {/* Column 6: Required Actions */}
                    <td className="py-3 px-3.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* 1. Re-Issue AWB Exception */}
                        {isReissue ? (
                          <button
                            onClick={() => onOpenAwbModal(so)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-700 hover:bg-rose-800 text-white shadow-xs transition-colors cursor-pointer"
                          >
                            <Barcode className="w-3 h-3" />
                            Re-Issue AWB
                          </button>
                        ) : so.crm_status === 'Pending AWB' ? (
                          /* 2. Initial AWB Issue */
                          <button
                            onClick={() => onOpenAwbModal(so)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-colors cursor-pointer"
                          >
                            <Barcode className="w-3 h-3" />
                            Issue AWB
                          </button>
                        ) : so.crm_status === 'CWH to Create DC' ? (
                          /* 3. At CWH: Create DC to RC */
                          <>
                            <button
                              onClick={() => handleOpenDcModal(so)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-purple-700 hover:bg-purple-800 text-white shadow-xs transition-colors cursor-pointer"
                            >
                              <Send className="w-3 h-3" />
                              Create DC to RC
                            </button>
                            <button
                              onClick={() => onOpenUnboxing(so)}
                              title="Review CCTV Inspection"
                              className="px-2 py-1.5 rounded-lg text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer"
                            >
                              <Video className="w-3 h-3" />
                            </button>
                          </>
                        ) : isDiscrepancy ? (
                          /* 4. Discrepancy Queue */
                          <>
                            <button
                              onClick={() => onOpenUnboxing(so)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-colors cursor-pointer"
                            >
                              <AlertTriangle className="w-3 h-3" />
                              Inspect Discrepancies
                            </button>
                            <button
                              onClick={() => onSelectOrder(so)}
                              className="px-2.5 py-1.5 rounded-lg text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer"
                            >
                              View
                            </button>
                          </>
                        ) : so.crm_status === 'Delivered at CWH' || so.crm_status === 'Pending Inward at CWH' || so.crm_status === 'In Transit' ? (
                          /* 5. Delivered at CWH / In Transit: CCTV Inward */
                          <>
                            <button
                              onClick={() => onOpenUnboxing(so)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#001489] hover:bg-[#08209e] text-white shadow-xs transition-colors cursor-pointer"
                            >
                              <Video className="w-3 h-3" />
                              {so.crm_status === 'Delivered at CWH' || so.crm_status === 'Pending Inward at CWH'
                                ? 'CCTV Inward & Unbox'
                                : 'Unbox Under CCTV'}
                            </button>
                            <button
                              onClick={() => onOpenAwbModal(so)}
                              title="Assign / Retoken AWB"
                              className="px-2 py-1.5 rounded-lg text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer"
                            >
                              AWB
                            </button>
                          </>
                        ) : (
                          /* 6. Outbound RC / History */
                          <button
                            onClick={() => onSelectOrder(so)}
                            className="px-3 py-1.5 rounded-lg text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer"
                          >
                            View Details
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {currentDisplayOrders.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-600 mb-1.5 opacity-80" />
                    <h4 className="text-sm font-semibold text-slate-900">All caught up!</h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {activeSubTab === 'needs_awb'
                        ? 'No active consignments currently require initial AWB issuance from CWH.'
                        : activeSubTab === 'awb_reissue'
                        ? 'No consignments currently in the AWB re-issue exception queue.'
                        : activeSubTab === 'in_transit'
                        ? 'No consignments currently in transit or awaiting courier pickup.'
                        : activeSubTab === 'at_cwh'
                        ? 'No consignments currently at CWH awaiting CCTV inward screening or DC creation.'
                        : activeSubTab === 'discrepancies'
                        ? 'No discrepancies flagged currently.'
                        : activeSubTab === 'outbound_rc'
                        ? 'No consignments currently dispatched outbound to RC.'
                        : 'No historical delivered records found matching the filter.'}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Create DC to RC in Lenovo CRM */}
      {dcModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="relative w-full max-w-xl rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-800">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 font-mono">Create DC to RC (Lenovo CRM)</h3>
                  <p className="text-xs text-slate-500">Outbound Dispatch from CWH to Repair Center</p>
                </div>
              </div>
              <button
                onClick={() => setDcModalOrder(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <form onSubmit={handleConfirmDcToRc} className="p-6 space-y-4">
              {/* Consignment Quick Summary */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 block text-[10px]">SO Code</span>
                  <span className="font-mono font-bold text-slate-900 text-xs">{dcModalOrder.so_code}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Origin Station</span>
                  <span className="font-mono font-bold text-sky-800 text-xs">{dcModalOrder.station_code}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Constituent Items</span>
                  <span className="font-bold text-slate-900 text-xs">
                    {items.filter((i) => (i.shipping_order_code || '').trim().toLowerCase() === dcModalOrder.so_code.trim().toLowerCase() || (i.shipping_order_id && i.shipping_order_id === dcModalOrder.id)).length} units
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Total Value</span>
                  <span className="font-mono font-bold text-emerald-700 text-xs">{formatINR(dcModalOrder.total_declared_value)}</span>
                </div>
              </div>

              {/* Lenovo DC Number */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
                  <span>Lenovo CRM Delivery Challan (DC) Number <span className="text-rose-500">*</span></span>
                  <span className="text-[10px] text-slate-500 font-normal">Generated in Lenovo CRM</span>
                </label>
                <input
                  type="text"
                  required
                  value={lenovoDcNumber}
                  onChange={(e) => setLenovoDcNumber(e.target.value)}
                  placeholder="e.g. LEN-DC-2026-98901"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#001489] focus:bg-white transition-colors"
                />
              </div>

              {/* Destination Repair Center & Courier */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Destination Repair Center (RC)
                  </label>
                  <select
                    value={rcDestination}
                    onChange={(e) => setRcDestination(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-[#001489] focus:bg-white transition-colors"
                  >
                    <option value="Lenovo/Motorola Central RC (Mumbai)">Lenovo/Motorola Central RC (Mumbai)</option>
                    <option value="Lenovo/Motorola North RC (Delhi/NCR)">Lenovo/Motorola North RC (Delhi/NCR)</option>
                    <option value="Lenovo/Motorola South RC (Bangalore)">Lenovo/Motorola South RC (Bangalore)</option>
                    <option value="Lenovo/Motorola East RC (Kolkata)">Lenovo/Motorola East RC (Kolkata)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Outbound Logistics Partner
                  </label>
                  <select
                    value={dcCourier}
                    onChange={(e) => setDcCourier(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-[#001489] focus:bg-white transition-colors"
                  >
                    <option value="Bluedart Surface">Bluedart Surface</option>
                    <option value="Safexpress Logistics">Safexpress Logistics</option>
                    <option value="Delhivery Freight">Delhivery Freight</option>
                    <option value="DTDC Express">DTDC Express</option>
                    <option value="Gati KWE">Gati KWE</option>
                  </select>
                </div>
              </div>

              {/* Outbound Docket / AWB */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Outbound Docket / Courier AWB No. (Optional)
                </label>
                <input
                  type="text"
                  value={dcDocket}
                  onChange={(e) => setDcDocket(e.target.value)}
                  placeholder="e.g. BD-RC-98327101"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#001489] focus:bg-white transition-colors"
                />
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Dispatch Remarks / Transit Memo
                </label>
                <textarea
                  rows={2}
                  value={dcRemarks}
                  onChange={(e) => setDcRemarks(e.target.value)}
                  placeholder="e.g. Inward verified clean under CCTV Bay 4. Handed over for RC repair batching."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#001489] focus:bg-white transition-colors"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDcModalOrder(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-[#001489] hover:bg-[#08209e] text-white shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  Confirm &amp; Dispatch to RC (Status: 4. ASP Send to RC)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk AWB Upload & Verification Modal */}
      <BulkAwbUploadModal
        isOpen={isBulkAwbModalOpen}
        onClose={() => setIsBulkAwbModalOpen(false)}
        orders={orders}
        stations={stations}
        user={user}
      />
    </div>
  );
};

