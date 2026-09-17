import React, { useMemo } from 'react';
import { 
  Truck, 
  Layers, 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  FileSpreadsheet, 
  ShieldCheck, 
  Sparkles, 
  DollarSign, 
  Barcode, 
  ArrowUpRight,
  TrendingUp,
  Archive,
  PackageCheck,
  RefreshCw
} from 'lucide-react';
import { ShippingOrder, DefectiveItem, CCIMaster } from '../../types/crm';
import { formatINR } from '../../lib/utils';
import { StatCard } from '../ui/StatCard';
import { SlaBadge } from '../layout/SlaBadge';

interface AdminDashboardProps {
  orders: ShippingOrder[];
  items: DefectiveItem[];
  stations: CCIMaster[];
  onNavigateTab: (tab: string) => void;
  onSelectOrder: (order: ShippingOrder) => void;
  isCompletedSessionLoaded?: boolean;
  isCompletedSessionLoading?: boolean;
  completedOrdersCount?: number;
  onLoadCompletedSession?: () => void;
  onUnloadCompletedSession?: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  orders,
  items,
  stations,
  onNavigateTab,
  onSelectOrder,
  isCompletedSessionLoaded,
  isCompletedSessionLoading,
  completedOrdersCount = 1375,
  onLoadCompletedSession,
  onUnloadCompletedSession,
}) => {
  // Aggregate KPI metrics
  const totalValue = useMemo(() => {
    return orders.reduce((sum, so) => sum + (so.total_declared_value || 0), 0);
  }, [orders]);

  const criticalOrders = useMemo(() => {
    return orders.filter((so) => so.priority_tier === 1);
  }, [orders]);

  const highOrders = useMemo(() => {
    return orders.filter((so) => so.priority_tier === 2);
  }, [orders]);

  const awbPending = useMemo(() => {
    return orders.filter((so) => so.crm_status === 'Pending AWB');
  }, [orders]);

  const ewayRequiredCount = useMemo(() => {
    return orders.filter((so) => so.eway_bill_required);
  }, [orders]);

  // Regional Aggregations mapped dynamically from CCI Master stations
  const regionalMetrics = useMemo(() => {
    const normalizeCode = (c: string) => String(c || '').trim().replace(/^0+/, '') || String(c || '').trim();
    const stationMap = new Map<string, CCIMaster>();
    stations.forEach((st) => {
      stationMap.set(st.station_code, st);
      stationMap.set(st.station_code.padStart(3, '0'), st);
      stationMap.set(normalizeCode(st.station_code), st);
    });

    const regSet = new Set<string>();
    stations.forEach((s) => {
      if (s.region?.trim()) regSet.add(s.region.trim());
    });
    if (regSet.size === 0) {
      ['Central', 'East', 'North', 'South', 'West'].forEach((r) => regSet.add(r));
    }
    const regions = Array.from(regSet).sort();

    return regions.map((region) => {
      const regionOrders = orders.filter((o) => {
        const st = stationMap.get(o.station_code) || 
                   stationMap.get(o.station_code.padStart(3, '0')) || 
                   stationMap.get(normalizeCode(o.station_code));
        const effectiveRegion = st?.region || o.region || 'West';
        return effectiveRegion === region;
      });
      const val = regionOrders.reduce((sum, o) => sum + (o.total_declared_value || 0), 0);
      const critical = regionOrders.filter((o) => o.priority_tier === 1).length;
      return {
        region,
        consignments: regionOrders.length,
        value: val,
        critical,
      };
    });
  }, [orders, stations]);

  return (
    <div className="space-y-8">
      {/* Executive Header Banner */}
      <div className="relative overflow-hidden rounded-2xl p-6 sm:p-8 bg-gradient-to-r from-[#001489] via-[#09239e] to-[#001489] text-white shadow-lg">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white/15 text-sky-200 border border-white/20 flex items-center gap-1.5 shadow-xs">
                <Sparkles className="w-3.5 h-3.5 text-sky-300" />
                Live Reverse Logistics Operations
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-['Outfit'] mt-3 tracking-tight">
              Motorola Defective Returns Command Center
            </h1>
            <p className="text-xs sm:text-sm text-blue-100 max-w-2xl mt-1.5 leading-relaxed">
              Real-time synchronization across {stations.length} Service Centers, Central Warehouse Inward, and SLA breach mitigation.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Completed Journey session fetch button */}
            {onLoadCompletedSession && (
              !isCompletedSessionLoaded ? (
                <button
                  onClick={onLoadCompletedSession}
                  disabled={isCompletedSessionLoading}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-amber-400/20 hover:bg-amber-400/30 text-amber-200 border border-amber-300/40 shadow-xs transition-all hover:scale-[1.02] cursor-pointer disabled:opacity-50"
                  title="Fetch completed journey shipping orders (RC Received ASP) from Supabase for this session"
                >
                  {isCompletedSessionLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 text-amber-300 animate-spin" />
                      <span>Fetching Completed...</span>
                    </>
                  ) : (
                    <>
                      <Archive className="w-4 h-4 text-amber-300" />
                      <span>Fetch Completed Journey ({completedOrdersCount})</span>
                    </>
                  )}
                </button>
              ) : (
                <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 shadow-xs">
                  <PackageCheck className="w-4 h-4 text-emerald-300" />
                  <span>Completed Loaded ({completedOrdersCount} SOs)</span>
                  {onUnloadCompletedSession && (
                    <button
                      onClick={onUnloadCompletedSession}
                      className="ml-1.5 text-[11px] text-blue-100 hover:text-white underline cursor-pointer font-normal"
                      title="Unload completed orders and revert to active pipeline"
                    >
                      Unload
                    </button>
                  )}
                </div>
              )
            )}

            <button
              onClick={() => onNavigateTab('ingestion')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-white text-[#001489] hover:bg-blue-50 shadow-md transition-all hover:scale-[1.02] cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-[#001489]" />
              Upload Latest Dump
            </button>

            <button
              onClick={() => onNavigateTab('orders')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-white/15 hover:bg-white/25 text-white border border-white/20 transition-colors cursor-pointer"
            >
              <Truck className="w-4 h-4 text-sky-200" />
              Consignments ({orders.length})
            </button>
          </div>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Consignments"
          value={orders.length}
          subtitle={`${items.length} defective line items`}
          icon={<Truck className="w-5 h-5 text-blue-700" />}
          variant="cyan"
          onClick={() => onNavigateTab('orders')}
        />

        <StatCard
          title="Total Declared Value"
          value={formatINR(totalValue)}
          subtitle="Active pipeline valuation"
          icon={<TrendingUp className="w-5 h-5 text-emerald-700" />}
          variant="emerald"
        />

        <StatCard
          title="Critical SLA Breaches (≥15D)"
          value={criticalOrders.length}
          subtitle={`+ ${highOrders.length} in High Priority (8-14D)`}
          icon={<AlertTriangle className="w-5 h-5 text-rose-700" />}
          variant="red"
          onClick={() => onNavigateTab('orders')}
        />

        <StatCard
          title="E-Way Bill Alerts (≥ ₹50K)"
          value={ewayRequiredCount.length}
          subtitle={`${awbPending.length} AWB Pending staging`}
          icon={<Barcode className="w-5 h-5 text-amber-700" />}
          variant="amber"
          onClick={() => onNavigateTab('orders')}
        />
      </div>

      {/* Regional Distribution & Critical SLA Monitor */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Regional Distribution breakdown */}
        <div className="p-6 rounded-xl bg-white border border-slate-200 space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-['Outfit']">
              Regional Defective Volume
            </h3>
            <span className="text-[11px] text-blue-700 font-semibold font-mono bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
              {stations.length} Station Nodes
            </span>
          </div>

          <div className="space-y-3">
            {regionalMetrics.map((rm) => (
              <div
                key={rm.region}
                className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/80 hover:border-blue-300 transition-colors"
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-600" />
                    <span className="font-semibold text-slate-900">{rm.region} Region</span>
                  </div>
                  <span className="font-mono text-slate-900 font-bold">
                    {formatINR(rm.value)}
                  </span>
                </div>

                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                  <span>{rm.consignments} Consignments</span>
                  {rm.critical > 0 ? (
                    <span className="text-rose-700 font-semibold font-mono bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                      {rm.critical} Critical SLA
                    </span>
                  ) : (
                    <span className="text-emerald-700 font-medium font-mono">SLA Clean</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Critical SLA Consignments Queue */}
        <div className="lg:col-span-2 p-6 rounded-xl bg-white border border-slate-200 space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200">
                <AlertTriangle className="w-4 h-4" />
              </span>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-['Outfit']">
                Priority Tier 1: Critical SLA Breaches (≥ 15 Days)
              </h3>
            </div>
            <button
              onClick={() => onNavigateTab('orders')}
              className="text-xs text-blue-700 hover:text-blue-900 font-semibold flex items-center gap-1 cursor-pointer"
            >
              View All Consignments <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-600 border-b border-slate-200 font-mono">
                <tr>
                  <th className="py-2.5 px-3 uppercase text-[11px]">SO Code</th>
                  <th className="py-2.5 px-3 uppercase text-[11px]">Station</th>
                  <th className="py-2.5 px-3 uppercase text-[11px]">Region</th>
                  <th className="py-2.5 px-3 text-right uppercase text-[11px]">Value</th>
                  <th className="py-2.5 px-3 uppercase text-[11px]">SLA Age</th>
                  <th className="py-2.5 px-3 uppercase text-[11px]">CRM Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 bg-white">
                {criticalOrders.slice(0, 6).map((so) => (
                  <tr
                    key={so.id}
                    onClick={() => onSelectOrder(so)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 px-3 font-mono font-semibold text-blue-700">
                      {so.so_code}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-800">
                      {so.station_code}
                    </td>
                    <td className="py-2.5 px-3">{so.region}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                      {formatINR(so.total_declared_value)}
                    </td>
                    <td className="py-2.5 px-3">
                      <SlaBadge tier={so.priority_tier} ageDays={so.max_sr_age} />
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-medium">
                        {so.crm_status}
                      </span>
                    </td>
                  </tr>
                ))}
                {criticalOrders.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-emerald-700 bg-emerald-50/50">
                      <CheckCircle2 className="w-6 h-6 mx-auto mb-1 text-emerald-600" />
                      No critical SLA breaches! All consignments are within SLA parameters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
