import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { 
  Truck, 
  Search, 
  Filter, 
  Download, 
  Eye, 
  Printer, 
  Barcode, 
  AlertTriangle, 
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  Trash2,
  CheckCircle2,
  Archive,
  PackageCheck,
  RefreshCw,
  Info,
  Layers
} from 'lucide-react';
import { ShippingOrder, DefectiveItem, CCIMaster, PriorityTier, CRMStatus, UserRole } from '../../types/crm';
import { formatINR, formatDate, getCrmStatusStyle } from '../../lib/utils';
import { SlaBadge } from '../layout/SlaBadge';
import { printConsignmentManifest } from '../../services/manifestGenerator';
import { getMotorolaStatusInfo, isAwbIssueRequired } from '../../lib/motorolaStatus';

interface ShippingOrdersTableProps {
  orders: ShippingOrder[];
  items: DefectiveItem[];
  stations: CCIMaster[];
  currentRole: UserRole;
  currentStation?: string;
  onSelectOrder: (order: ShippingOrder) => void;
  onOpenAwbModal?: (order: ShippingOrder) => void;
  onOpenInward?: (order: ShippingOrder) => void;
  onDeleteOrder?: (order: ShippingOrder) => void;
  onNavigateTab?: (tab: string) => void;
  isCompletedSessionLoaded?: boolean;
  isCompletedSessionLoading?: boolean;
  completedOrdersCount?: number;
  onLoadCompletedSession?: () => void;
  onUnloadCompletedSession?: () => void;
}

export const ShippingOrdersTable: React.FC<ShippingOrdersTableProps> = ({
  orders,
  items,
  stations,
  currentRole,
  currentStation,
  onSelectOrder,
  onOpenAwbModal,
  onOpenInward,
  onDeleteOrder,
  onNavigateTab,
  isCompletedSessionLoaded,
  isCompletedSessionLoading,
  completedOrdersCount = 1375,
  onLoadCompletedSession,
  onUnloadCompletedSession,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<string>('ALL');
  const [selectedTier, setSelectedTier] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedMotoStatus, setSelectedMotoStatus] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

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

  // Dynamic regions derived from CCI Master stations
  const availableRegions = useMemo(() => {
    const regSet = new Set<string>();
    stations.forEach((st) => {
      if (st.region?.trim()) regSet.add(st.region.trim());
    });
    orders.forEach((so) => {
      const st = stationMap.get(so.station_code);
      const reg = st?.region || so.region;
      if (reg?.trim()) regSet.add(reg.trim());
    });
    if (regSet.size === 0) {
      ['Central', 'East', 'North', 'South', 'West'].forEach((r) => regSet.add(r));
    }
    return Array.from(regSet).sort();
  }, [stations, orders, stationMap]);

  // Scoped filtering
  const filteredOrders = useMemo(() => {
    return orders.filter((so) => {
      // Role scoping: if CCI, only show own station
      if (currentRole === 'CCI' && currentStation && so.station_code !== currentStation) {
        return false;
      }

      // Strictly resolve region from CCI master station mapping
      const st = stationMap.get(so.station_code);
      const effectiveRegion = st?.region || so.region || 'West';

      if (selectedRegion !== 'ALL' && effectiveRegion !== selectedRegion) {
        return false;
      }

      if (selectedTier !== 'ALL' && so.priority_tier !== parseInt(selectedTier, 10)) {
        return false;
      }

      if (selectedStatus !== 'ALL' && so.crm_status !== selectedStatus) {
        return false;
      }

      if (selectedMotoStatus !== 'ALL') {
        const info = getMotorolaStatusInfo(so.motorola_status);
        if (String(info.code) !== selectedMotoStatus) {
          return false;
        }
      }

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchSo = so.so_code.toLowerCase().includes(q);
        const matchStation = so.station_code.toLowerCase().includes(q);
        const matchStationName = (st?.station_name || '').toLowerCase().includes(q);
        const matchCity = (st?.city || so.city || '').toLowerCase().includes(q);
        const matchAwb = (so.active_awb || so.excel_ref_awb || '').toLowerCase().includes(q);
        if (!matchSo && !matchStation && !matchStationName && !matchCity && !matchAwb) return false;
      }

      return true;
    });
  }, [orders, currentRole, currentStation, selectedRegion, selectedTier, selectedStatus, selectedMotoStatus, searchTerm, stationMap]);

  // Pagination
  const totalPages = Math.ceil(filteredOrders.length / pageSize) || 1;
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [filteredOrders, currentPage, pageSize]);

  // Export to Excel
  const handleExportExcel = () => {
    const exportData = filteredOrders.map((so) => {
      const st = stationMap.get(so.station_code);
      return {
        'SO Code': so.so_code,
        'Station Code': so.station_code,
        'Station Name': st?.station_name || '',
        'City': st?.city || so.city || '',
        'State': st?.state || so.state || '',
        'Region': st?.region || so.region || '',
        'Declared Value (INR)': so.total_declared_value,
        'Max Age (Days)': so.max_sr_age,
        'Priority Tier': so.priority_tier === 1 ? 'Critical' : so.priority_tier === 2 ? 'High' : 'Normal',
        'Motorola Status': so.motorola_status,
        'CRM Status': so.crm_status,
        'Active AWB': so.active_awb || '',
        'Excel Ref AWB': so.excel_ref_awb || '',
        'Courier': so.courier,
        'Pickup Status': so.pickup_status || 'Pickup Pending',
        'Pickup Date': so.pickup_date ? formatDate(so.pickup_date) : '',
        'Pickup Remarks': so.pickup_remarks || '',
        'E-Way Bill Required': so.eway_bill_required ? 'YES' : 'NO',
        'E-Way Bill Number': so.eway_bill_number || '',
        'Created Date': formatDate(so.created_at),
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Shipping Orders');
    XLSX.writeFile(wb, `Motorola_Shipping_Orders_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* Admin-only Session Banner: Fetch Completed Journey (RC Received ASP) */}
      {currentRole === 'ADMIN' && onLoadCompletedSession && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-[#0c1630] border border-[#1f2e5a] shadow-sm">
          <div className="flex items-center gap-3 text-xs">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-white">
                {isCompletedSessionLoaded
                  ? `Active & Completed Consignments in Session (${orders.length} Total)`
                  : `Active Operational Consignments (${orders.length} Active SOs)`}
              </span>
              <p className="text-slate-400 text-[11px] mt-0.5">
                {isCompletedSessionLoaded
                  ? `Completed journey orders (RC Received ASP) are populated for this active session only.`
                  : `Completed journey orders (Code 5: RC Received ASP) are kept in Supabase to keep operational views snappy.`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            {!isCompletedSessionLoaded ? (
              <button
                onClick={onLoadCompletedSession}
                disabled={isCompletedSessionLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 transition-colors cursor-pointer disabled:opacity-50"
                title="Fetch completed journey orders (RC Received ASP) from Supabase for this session"
              >
                {isCompletedSessionLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                    <span>Fetching Completed...</span>
                  </>
                ) : (
                  <>
                    <Archive className="w-3.5 h-3.5 text-amber-400" />
                    <span>Fetch Completed Journey ({completedOrdersCount})</span>
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={onUnloadCompletedSession}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1a274c] hover:bg-[#233566] text-slate-200 border border-[#1f2e5a] cursor-pointer"
                title="Unload completed orders and revert to active pipeline"
              >
                <span>Unload Completed Records</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Controls & Filter Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-xl bg-[#101a35] border border-[#1c2b53]">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search SO Code, Station Code, or AWB..."
            className="w-full bg-[#0b1329] border border-[#1f2e5a] rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:border-cyan-500 transition-colors"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Region */}
          <select
            value={selectedRegion}
            onChange={(e) => {
              setSelectedRegion(e.target.value);
              setCurrentPage(1);
            }}
            aria-label="Filter by Region"
            className="bg-[#0b1329] border border-[#1f2e5a] text-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Regions ({filteredOrders.length})</option>
            {availableRegions.map((reg) => (
              <option key={reg} value={reg}>
                {reg} Region
              </option>
            ))}
          </select>

          {/* Priority SLA Tier */}
          <select
            value={selectedTier}
            onChange={(e) => {
              setSelectedTier(e.target.value);
              setCurrentPage(1);
            }}
            aria-label="Filter by SLA Priority"
            className="bg-[#0b1329] border border-[#1f2e5a] text-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All SLA Tiers</option>
            <option value="1">Tier 1: Critical (≥15 Days)</option>
            <option value="2">Tier 2: High (8-14 Days)</option>
            <option value="3">Tier 3: Normal (&lt;8 Days)</option>
          </select>

          {/* CRM Status */}
          <select
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setCurrentPage(1);
            }}
            aria-label="Filter by CRM Status"
            className="bg-[#0b1329] border border-[#1f2e5a] text-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All CRM Statuses</option>
            <option value="AWB Pending">AWB Pending</option>
            <option value="In Transit">In Transit</option>
            <option value="CWH Received">CWH Received</option>
            <option value="Discrepancy Tagged">Discrepancy Tagged</option>
            <option value="Closed">Closed</option>
          </select>

          {/* Motorola Parts Status */}
          <select
            value={selectedMotoStatus}
            onChange={(e) => {
              setSelectedMotoStatus(e.target.value);
              setCurrentPage(1);
            }}
            aria-label="Filter by Motorola Status"
            className="bg-[#0b1329] border border-[#1f2e5a] text-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Motorola Statuses</option>
            <option value="1">1. Not Return - CCI to Create DC</option>
            <option value="2">2. CCI Send to CWH - Active Logistics</option>
            <option value="3">3. CWH Received - At Warehouse</option>
            <option value="4">4. ASP Send to RC - Outbound to RC</option>
            <option value="5">5. RC Received ASP - Completed</option>
            <option value="6">6. RC Received ASP(Negative) - Discrepancy</option>
          </select>

          {/* Export button */}
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Export Excel ({filteredOrders.length})
          </button>
        </div>
      </div>

      {/* Table Data Grid */}
      <div className="rounded-xl border border-[#1c2b53] overflow-hidden bg-[#101a35] shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0b1329] text-slate-400 border-b border-[#1c2b53] font-mono">
              <tr>
                <th className="py-3 px-4">SO Code</th>
                <th className="py-3 px-4">Station</th>
                <th className="py-3 px-4">Region</th>
                <th className="py-3 px-4 text-center">Units</th>
                <th className="py-3 px-4 text-right">Declared Value</th>
                <th className="py-3 px-4">SLA Priority</th>
                <th className="py-3 px-4">Motorola Status</th>
                <th className="py-3 px-4">CRM Status</th>
                <th className="py-3 px-4">Active AWB</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1c2b53]/60 text-slate-300">
              {paginatedOrders.map((so) => {
                const station = stationMap.get(so.station_code);
                const orderItems = items.filter((i) => i.shipping_order_code === so.so_code);
                const motoInfo = getMotorolaStatusInfo(so.motorola_status);

                return (
                  <tr key={so.id} className="hover:bg-slate-800/40 transition-colors group">
                    {/* SO Code */}
                    <td className="py-3 px-4 font-mono font-medium text-white">
                      <button
                        onClick={() => onSelectOrder(so)}
                        className="text-cyan-400 hover:underline flex items-center gap-1"
                      >
                        {so.so_code}
                      </button>
                      {so.eway_bill_required && (
                        <span className="inline-block mt-0.5 text-[9px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          E-Way Bill Req
                        </span>
                      )}
                    </td>

                    {/* Station & Location */}
                    <td className="py-3 px-4">
                      <div className="font-mono text-slate-200">{so.station_code}</div>
                      <div className="text-[11px] text-slate-300 max-w-[150px] truncate" title={station?.station_name}>
                        {station?.station_name || 'Service Station'}
                      </div>
                      {(station?.city || so.city || station?.state || so.state) && (
                        <div className="text-[10px] text-cyan-400/80 truncate max-w-[150px]">
                          {[station?.city || so.city, station?.state || so.state].filter(Boolean).join(', ')}
                        </div>
                      )}
                    </td>

                    {/* Region */}
                    <td className="py-3 px-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="px-2 py-0.5 rounded text-[11px] bg-slate-800/80 border border-slate-700 text-slate-300 w-fit">
                          {station?.region || so.region || 'West'}
                        </span>
                        {(station?.state || so.state) && (
                          <span className="text-[10px] text-slate-400 truncate max-w-[90px]" title={station?.state || so.state}>
                            {station?.state || so.state}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Units */}
                    <td className="py-3 px-4 text-center font-mono font-medium text-slate-200">
                      {so.total_items || orderItems.reduce((s, i) => s + (i.quantity || 1), 0) || 1}
                    </td>

                    {/* Declared Value */}
                    <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-400">
                      {formatINR(so.total_declared_value)}
                    </td>

                    {/* SLA Priority */}
                    <td className="py-3 px-4">
                      <SlaBadge tier={so.priority_tier} ageDays={so.max_sr_age} />
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

                    {/* CRM Status */}
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${getCrmStatusStyle(so.crm_status)}`}>
                        {so.crm_status}
                      </span>
                    </td>

                    {/* Active AWB & Pickup */}
                    <td className="py-3 px-4 font-mono text-slate-300">
                      {so.active_awb || so.excel_ref_awb ? (
                        <div>
                          <div className="text-cyan-300 flex items-center gap-1 font-semibold">
                            <Barcode className="w-3.5 h-3.5 text-cyan-400" />
                            <span>{so.active_awb || so.excel_ref_awb}</span>
                          </div>
                          {so.pickup_status === 'Pickup Done' ? (
                            <span className="inline-flex items-center gap-0.5 text-[9px] text-emerald-400 font-sans mt-0.5">
                              <CheckCircle2 className="w-2.5 h-2.5" /> Pickup Done
                            </span>
                          ) : so.pickup_status === 'Pickup Not Done' ? (
                            <span className="inline-flex items-center gap-0.5 text-[9px] text-rose-400 font-sans mt-0.5" title={so.pickup_remarks}>
                              <AlertTriangle className="w-2.5 h-2.5" /> Pickup Failed
                            </span>
                          ) : null}
                        </div>
                      ) : motoInfo.isDelivered ? (
                        <span className="text-emerald-400/80 text-[11px] font-sans font-medium">Delivered (Closed)</span>
                      ) : (
                        <span className="text-slate-500 italic">Unassigned</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => onSelectOrder(so)}
                          title="View Line Items"
                          className="p-1 rounded bg-[#1f2e5a]/60 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => printConsignmentManifest(so, orderItems, station)}
                          title="Print Manifest"
                          className="p-1 rounded bg-[#1f2e5a]/60 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 transition-colors"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>

                        {onOpenAwbModal && !motoInfo.isDelivered && (
                          <button
                            onClick={() => onOpenAwbModal(so)}
                            title="Assign or Retoken AWB"
                            className="p-1 rounded bg-[#1f2e5a]/60 hover:bg-blue-500/20 text-slate-300 hover:text-blue-300 transition-colors"
                          >
                            <Barcode className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {currentRole === 'ADMIN' && onDeleteOrder && (
                          <button
                            onClick={() => onDeleteOrder(so)}
                            title="Delete Consignment (Admin Only)"
                            className="p-1 rounded bg-[#1f2e5a]/60 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {paginatedOrders.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <Truck className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                    <p className="text-sm">No shipping orders match your filter criteria.</p>
                    {selectedMotoStatus === '5' && !isCompletedSessionLoaded && onLoadCompletedSession && (
                      <div className="mt-3">
                        <p className="text-xs text-amber-300/80 mb-2">
                          Completed journey orders (RC Received ASP) are archived safely in Supabase.
                        </p>
                        <button
                          onClick={onLoadCompletedSession}
                          disabled={isCompletedSessionLoading}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 cursor-pointer"
                        >
                          <Archive className="w-3.5 h-3.5" />
                          <span>Fetch Completed Journey for Active Session</span>
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-[#1c2b53] bg-[#0b1329] text-xs text-slate-400">
          <div>
            Showing <strong className="text-white">{filteredOrders.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}</strong> to{' '}
            <strong className="text-white">{Math.min(currentPage * pageSize, filteredOrders.length)}</strong> of{' '}
            <strong className="text-white">{filteredOrders.length}</strong> consignments
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-[#1f2e5a] text-slate-400 disabled:opacity-40 hover:bg-slate-800 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 py-1 font-mono text-slate-300">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-[#1f2e5a] text-slate-400 disabled:opacity-40 hover:bg-slate-800 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
