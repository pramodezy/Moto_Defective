import React, { useState } from 'react';
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
  ShieldAlert
} from 'lucide-react';
import { ShippingOrder, DefectiveItem, CCIMaster, UserProfile } from '../../types/crm';
import { formatINR, formatDate, getCrmStatusStyle } from '../../lib/utils';
import { SlaBadge } from '../layout/SlaBadge';

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
  const [activeSubTab, setActiveSubTab] = useState<'pending' | 'verified' | 'discrepancies'>('pending');

  const stationMap = new Map<string, CCIMaster>();
  stations.forEach((s) => stationMap.set(s.station_code, s));

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

  const pendingInwardOrders = orders.filter((o) => ['In Transit', 'AWB Pending'].includes(o.crm_status));
  const verifiedOrders = orders.filter((o) => o.crm_status === 'CWH Received');
  const discrepancyOrders = orders.filter((o) => o.crm_status === 'Discrepancy Tagged');

  const currentDisplayOrders =
    activeSubTab === 'pending'
      ? pendingInwardOrders
      : activeSubTab === 'verified'
      ? verifiedOrders
      : discrepancyOrders;

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
                  CWH Inward Verification & CCTV Unboxing Station
                </h2>
                <p className="text-xs text-indigo-200">
                  Bay 4 • Technician: <strong className="text-white">{user.full_name}</strong> • Dual-status integrity preserved
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-300 mt-2">
              Scan inbound shipping manifest barcodes or consignment AWB tokens to initiate unboxing inspection under CCTV surveillance and record discrepancy logs.
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
                Tip: Type or scan any SO Code (e.g. <code>SORLC26051500115</code>) and hit Enter
              </span>
            </div>
          </form>
        </div>
      </div>

      {/* Sub tabs: Pending vs Verified vs Discrepancies */}
      <div className="flex items-center gap-2 border-b border-[#1f2e5a] pb-3">
        <button
          onClick={() => setActiveSubTab('pending')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeSubTab === 'pending'
              ? 'bg-indigo-600 text-white shadow-lg'
              : 'bg-[#101a35] text-slate-400 hover:text-slate-200 border border-[#1c2b53]'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          Awaiting Inward Verification ({pendingInwardOrders.length})
        </button>

        <button
          onClick={() => setActiveSubTab('discrepancies')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeSubTab === 'discrepancies'
              ? 'bg-rose-600 text-white shadow-lg'
              : 'bg-[#101a35] text-slate-400 hover:text-slate-200 border border-[#1c2b53]'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          Flagged Discrepancies ({discrepancyOrders.length})
        </button>

        <button
          onClick={() => setActiveSubTab('verified')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeSubTab === 'verified'
              ? 'bg-emerald-600 text-white shadow-lg'
              : 'bg-[#101a35] text-slate-400 hover:text-slate-200 border border-[#1c2b53]'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          Successfully Inwarded ({verifiedOrders.length})
        </button>
      </div>

      {/* Cards Grid for Consignments */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {currentDisplayOrders.map((so) => {
          const station = stationMap.get(so.station_code);
          const orderItems = items.filter((i) => i.shipping_order_code === so.so_code);
          const isCritical = so.priority_tier === 1;

          return (
            <div
              key={so.id}
              className={`rounded-xl border p-4 bg-[#101a35] transition-all hover:border-indigo-500/50 hover:shadow-lg flex flex-col justify-between ${
                isCritical ? 'border-red-500/40 bg-gradient-to-b from-red-950/20 to-[#101a35]' : 'border-[#1c2b53]'
              }`}
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      Shipping Order
                    </span>
                    <h3 className="text-sm font-bold text-white font-mono">{so.so_code}</h3>
                  </div>
                  <SlaBadge tier={so.priority_tier} ageDays={so.max_sr_age} />
                </div>

                {/* Station & Region */}
                <div className="mt-2.5 p-2 rounded-lg bg-[#0b1329] border border-[#1f2e5a] text-xs">
                  <div className="flex justify-between items-center text-slate-300">
                    <span>
                      Station: <strong className="text-white font-mono">{so.station_code}</strong>
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-cyan-300 font-medium">
                      {so.region}
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

                {/* Active AWB */}
                <div className="mt-3 pt-2.5 border-t border-[#1c2b53] flex items-center justify-between text-xs">
                  <span className="text-slate-400">Courier AWB:</span>
                  <span className="font-mono font-medium text-cyan-400">
                    {so.active_awb || so.excel_ref_awb || 'None'}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-4 pt-3 border-t border-[#1c2b53] flex items-center gap-2">
                <button
                  onClick={() => onOpenUnboxing(so)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow transition-colors"
                >
                  <Video className="w-3.5 h-3.5" />
                  {so.crm_status === 'CWH Received' ? 'Review Unboxing' : 'Unbox Under CCTV'}
                </button>

                <button
                  onClick={() => onOpenAwbModal(so)}
                  title="Assign / Retoken AWB"
                  className="px-3 py-2 rounded-lg text-xs font-medium bg-[#1a274c] hover:bg-[#233566] text-slate-200 border border-[#1f2e5a] transition-colors"
                >
                  AWB
                </button>
              </div>
            </div>
          );
        })}

        {currentDisplayOrders.length === 0 && (
          <div className="col-span-full py-16 text-center text-slate-400">
            <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500 mb-2 opacity-80" />
            <h4 className="text-base font-semibold text-white">All caught up!</h4>
            <p className="text-xs text-slate-400 mt-1">
              {activeSubTab === 'pending'
                ? 'No consignments are currently pending inward verification.'
                : activeSubTab === 'discrepancies'
                ? 'No discrepancies flagged currently.'
                : 'No consignments have been inwarded yet.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
