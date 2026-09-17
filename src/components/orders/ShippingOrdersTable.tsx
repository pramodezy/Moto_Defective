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
  Layers,
  Clock
} from 'lucide-react';
import { ShippingOrder, DefectiveItem, CCIMaster, PriorityTier, CRMStatus, UserRole } from '../../types/crm';
import { formatINR, formatDate, getCrmStatusStyle } from '../../lib/utils';
import { SlaBadge } from '../layout/SlaBadge';
import { printConsignmentManifest } from '../../services/manifestGenerator';
import { 
  getMotorolaStatusInfo, 
  isAwbIssueRequired, 
  isCompletedJourneyStatus, 
  normalizeMotoStatusKey,
  getUnifiedStageDetails,
  getUnifiedPickupStatus
} from '../../lib/motorolaStatus';

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
      // Exclude Code 5 (RC Received ASP) unless explicitly loaded by Admin for active session
      if (!isCompletedSessionLoaded && isCompletedJourneyStatus(so.motorola_status)) {
        return false;
      }

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

      const effectiveStatus: CRMStatus = normalizeMotoStatusKey(so.motorola_status) === 'not return'
        ? 'CCI to Create DC'
        : ((so.crm_status as string) === 'AWB Pending' ? 'Pending AWB' : so.crm_status);

      if (selectedStatus !== 'ALL' && effectiveStatus !== selectedStatus) {
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
        'CCI-ASP Shipping Order (Leg 1)': so.so_code,
        'ASP-RC Shipping Order (Leg 2)': so.asp_rc_shipping_order_code || '',
        'Station Code': so.station_code,
        'Station Name': st?.station_name || '',
        'City': st?.city || so.city || '',
        'State': st?.state || so.state || '',
        'Region': st?.region || so.region || '',
        'Declared Value (INR)': so.total_declared_value,
        'Max Age (Days)': so.max_sr_age,
        'Priority Tier': so.priority_tier === 1 ? 'Critical' : so.priority_tier === 2 ? 'High' : 'Normal',
        'Motorola Status': so.motorola_status,
        'CRM Status': normalizeMotoStatusKey(so.motorola_status) === 'not return'
          ? 'CCI to Create DC'
          : ((so.crm_status as string) === 'AWB Pending' ? 'Pending AWB' : so.crm_status),
        'Active AWB': so.active_awb || '',
        'Excel Ref AWB': so.excel_ref_awb || '',
        'Courier': so.courier,
        'Pickup Status': so.pickup_status || 'Pickup Pending',
        'Pickup Date': so.pickup_date ? formatDate(so.pickup_date) : '',
        'Pickup Remarks': so.pickup_remarks || '',
        'Leg 2 Ship Date': so.asp_rc_ship_date ? formatDate(so.asp_rc_ship_date) : '',
        'Leg 2 Delivered Date': so.asp_rc_delivered_date ? formatDate(so.asp_rc_delivered_date) : '',
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
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
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
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white transition-colors"
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
            className="bg-slate-50 border border-slate-200 text-slate-700 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-600"
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
            className="bg-slate-50 border border-slate-200 text-slate-700 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-600"
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
            className="bg-slate-50 border border-slate-200 text-slate-700 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-600"
          >
            <option value="ALL">All CRM Statuses</option>
            <option value="CCI to Create DC">1. CCI to Create DC</option>
            <option value="Pending AWB">2. Pending AWB</option>
            <option value="Pickup Pending">3. Pickup Pending</option>
            <option value="Pending AWB Re-Issue">4. Pending AWB Re-Issue</option>
            <option value="In Transit">5. In Transit</option>
            <option value="Delivered at CWH">6. Delivered at CWH</option>
            <option value="Discrepancies">7. Discrepancies</option>
            <option value="Pending Inward at CWH">8. Pending Inward at CWH</option>
            <option value="CWH to Create DC">9. CWH to Create DC</option>
            <option value="Pickup Pending for RC">10. Pickup Pending for RC</option>
            <option value="In Transit to RC">11. In Transit to RC</option>
            <option value="Delivered to RC">12. Delivered to RC</option>
            <option value="Delivered to RC (Discrepancies)">13. Delivered to RC (Discrepancies)</option>
          </select>

          {/* Motorola Parts Status */}
          <select
            value={selectedMotoStatus}
            onChange={(e) => {
              setSelectedMotoStatus(e.target.value);
              setCurrentPage(1);
            }}
            aria-label="Filter by Motorola Status"
            className="bg-slate-50 border border-slate-200 text-slate-700 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-600"
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
            Export Excel ({filteredOrders.length})
          </button>
        </div>
      </div>

      {/* Table Data Grid */}
      <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-600 border-b border-slate-200 font-mono">
              <tr>
                <th className="py-3 px-4 uppercase text-[11px]">SO Code</th>
                <th className="py-3 px-4 uppercase text-[11px]">Station</th>
                <th className="py-3 px-4 uppercase text-[11px]">Region</th>
                <th className="py-3 px-4 text-center uppercase text-[11px]">Units</th>
                <th className="py-3 px-4 uppercase text-[11px]">SLA Priority</th>
                <th className="py-3 px-4 uppercase text-[11px]">Motorola Status</th>
                <th className="py-3 px-4 uppercase text-[11px]">CRM Status</th>
                <th className="py-3 px-4 uppercase text-[11px]">Active AWB</th>
                <th className="py-3 px-4 text-center uppercase text-[11px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {paginatedOrders.map((so) => {
                const station = stationMap.get(so.station_code);
                const orderItems = items.filter((i) => i.shipping_order_code === so.so_code);
                const motoInfo = getMotorolaStatusInfo(so.motorola_status);

                return (
                  <tr key={so.id} className="hover:bg-slate-50 transition-colors group">
                    {/* SO Code */}
                    <td className="py-3 px-4 font-mono font-medium text-slate-900">
                      <button
                        onClick={() => onSelectOrder(so)}
                        className="text-blue-700 hover:text-blue-900 hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                      >
                        {so.so_code}
                      </button>
                      {so.asp_rc_shipping_order_code && (
                        <span className="block text-[10px] text-purple-700 font-mono font-medium mt-0.5" title="Leg 2: Outbound to RC">
                          RC: {so.asp_rc_shipping_order_code}
                        </span>
                      )}
                      {so.eway_bill_required && (
                        <span className="inline-block mt-0.5 text-[9px] px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-300 font-sans font-medium">
                          E-Way Bill Req
                        </span>
                      )}
                    </td>

                    {/* Station & Location */}
                    <td className="py-3 px-4">
                      <div className="font-mono text-slate-900 font-semibold">{so.station_code}</div>
                      <div className="text-[11px] text-slate-600 max-w-[150px] truncate" title={station?.station_name}>
                        {station?.station_name || 'Service Station'}
                      </div>
                      {(station?.city || so.city || station?.state || so.state) && (
                        <div className="text-[10px] text-slate-500 truncate max-w-[150px]">
                          {[station?.city || so.city, station?.state || so.state].filter(Boolean).join(', ')}
                        </div>
                      )}
                    </td>

                    {/* Region */}
                    <td className="py-3 px-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="px-2 py-0.5 rounded text-[11px] bg-slate-100 border border-slate-200 text-slate-700 font-medium w-fit">
                          {station?.region || so.region || 'West'}
                        </span>
                        {(station?.state || so.state) && (
                          <span className="text-[10px] text-slate-500 truncate max-w-[90px]" title={station?.state || so.state}>
                            {station?.state || so.state}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Units */}
                    <td className="py-3 px-4 text-center font-mono font-semibold text-slate-900">
                      {orderItems.length > 0
                        ? orderItems.reduce((s, i) => s + (parseInt(String(i.quantity || 1), 10) || 1), 0)
                        : (so.total_items || 1)}
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
                    <td className="py-3 px-4 whitespace-nowrap">
                      {(() => {
                        const stage = getUnifiedStageDetails(so);
                        return (
                          <span 
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${stage.badgeClass}`}
                            title={stage.meaning}
                          >
                            {stage.stageName}
                          </span>
                        );
                      })()}
                    </td>

                    {/* Active AWB & Pickup */}
                    <td className="py-3 px-4 font-mono text-slate-700 whitespace-nowrap">
                      {so.active_awb || so.excel_ref_awb ? (
                        <div>
                          <div className="text-blue-800 flex items-center gap-1 font-semibold">
                            <Barcode className="w-3.5 h-3.5 text-blue-700" />
                            <span>{so.active_awb || so.excel_ref_awb}</span>
                          </div>
                          {(() => {
                            const pickup = getUnifiedPickupStatus(so);
                            if (pickup === 'Pickup Done') {
                              return (
                                <span className="inline-flex items-center gap-0.5 text-[9px] text-emerald-700 font-sans font-medium mt-0.5">
                                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> Pickup Done
                                </span>
                              );
                            }
                            if (pickup === 'Pickup Not Done') {
                              return (
                                <span className="inline-flex items-center gap-0.5 text-[9px] text-rose-700 font-sans font-medium mt-0.5" title={so.pickup_remarks}>
                                  <AlertTriangle className="w-2.5 h-2.5 text-rose-600" /> Pickup Failed
                                </span>
                              );
                            }
                            if (pickup === 'Pickup Pending') {
                              return (
                                <span className="inline-flex items-center gap-0.5 text-[9px] text-amber-700 font-sans font-medium mt-0.5">
                                  <Clock className="w-2.5 h-2.5 text-amber-600" /> Pickup Pending
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      ) : (
                        <span className="text-amber-800 text-[11px] font-sans font-medium">Pending CWH AWB</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => onSelectOrder(so)}
                          title="View Line Items"
                          className="p-1 rounded bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-blue-800 border border-slate-200 transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => printConsignmentManifest(so, orderItems, station)}
                          title="Print Manifest"
                          className="p-1 rounded bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-blue-800 border border-slate-200 transition-colors cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>

                        {onOpenAwbModal && !motoInfo.isDelivered && (() => {
                          const isNotReturnOrder = normalizeMotoStatusKey(so.motorola_status) === 'not return';
                          return (
                            <button
                              onClick={() => onOpenAwbModal(so)}
                              disabled={isNotReturnOrder}
                              title={isNotReturnOrder ? 'DC not yet created in Motorola CRM (Action required by CCI)' : 'Assign or Retoken AWB'}
                              className={`p-1 rounded border transition-colors ${
                                isNotReturnOrder
                                  ? 'bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed'
                                  : 'bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-blue-800 border-slate-200 cursor-pointer'
                              }`}
                            >
                              <Barcode className="w-3.5 h-3.5" />
                            </button>
                          );
                        })()}

                        {currentRole === 'ADMIN' && onDeleteOrder && (
                          <button
                            onClick={() => onDeleteOrder(so)}
                            title="Delete Consignment (Admin Only)"
                            className="p-1 rounded bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-700 border border-slate-200 transition-colors cursor-pointer"
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
                  <td colSpan={10} className="py-12 text-center text-slate-500">
                    <Truck className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                    <p className="text-sm">No shipping orders match your filter criteria.</p>
                    {selectedMotoStatus === '5' && !isCompletedSessionLoaded && onLoadCompletedSession && (
                      <div className="mt-3">
                        <p className="text-xs text-amber-800 mb-2">
                          Completed journey orders (RC Received ASP) are archived safely in Supabase.
                        </p>
                        <button
                          onClick={onLoadCompletedSession}
                          disabled={isCompletedSessionLoading}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100 cursor-pointer"
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
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50 text-xs text-slate-600">
          <div>
            Showing <strong className="text-slate-900">{filteredOrders.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}</strong> to{' '}
            <strong className="text-slate-900">{Math.min(currentPage * pageSize, filteredOrders.length)}</strong> of{' '}
            <strong className="text-slate-900">{filteredOrders.length}</strong> consignments
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-slate-300 text-slate-600 disabled:opacity-40 hover:bg-white transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 py-1 font-mono text-slate-800 font-semibold">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-slate-300 text-slate-600 disabled:opacity-40 hover:bg-white transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
