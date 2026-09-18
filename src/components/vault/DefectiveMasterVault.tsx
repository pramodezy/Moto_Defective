import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { 
  Layers, 
  Search, 
  Filter, 
  Download, 
  FileSpreadsheet, 
  ChevronLeft, 
  ChevronRight,
  ShieldCheck,
  Trash2,
  Archive,
  RefreshCw
} from 'lucide-react';
import { DefectiveItem, CCIMaster, UserRole } from '../../types/crm';
import { formatINR, formatDate, getScreeningStatusStyle } from '../../lib/utils';
import { getMotorolaStatusInfo, isCompletedJourneyStatus } from '../../lib/motorolaStatus';

interface DefectiveMasterVaultProps {
  items: DefectiveItem[];
  stations: CCIMaster[];
  currentRole: UserRole;
  currentStation?: string;
  onDeleteItem?: (item: DefectiveItem) => void;
  isCompletedSessionLoaded?: boolean;
  isCompletedSessionLoading?: boolean;
  onLoadCompletedSession?: () => void;
  onUnloadCompletedSession?: () => void;
}

export const DefectiveMasterVault: React.FC<DefectiveMasterVaultProps> = ({
  items,
  stations,
  currentRole,
  currentStation,
  onDeleteItem,
  isCompletedSessionLoaded,
  isCompletedSessionLoading,
  onLoadCompletedSession,
  onUnloadCompletedSession,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('ALL');
  const [selectedScreening, setSelectedScreening] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedMotoStatus, setSelectedMotoStatus] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  // Station map lookup with normalization
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

  // Dynamic regions derived from CCI Master
  const availableRegions = useMemo(() => {
    const regSet = new Set<string>();
    stations.forEach((st) => {
      if (st.region?.trim()) regSet.add(st.region.trim());
    });
    items.forEach((item) => {
      const st = stationMap.get(item.station_code);
      const reg = st?.region || item.region;
      if (reg?.trim()) regSet.add(reg.trim());
    });
    if (regSet.size === 0) {
      ['Central', 'East', 'North', 'South', 'West'].forEach((r) => regSet.add(r));
    }
    return Array.from(regSet).sort();
  }, [stations, items, stationMap]);

  // Distinct categories for dropdown
  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.part_category) set.add(i.part_category);
    });
    return Array.from(set).sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Exclude Code 5 (RC Received ASP) unless explicitly loaded by Admin for active session
      if (!isCompletedSessionLoaded && isCompletedJourneyStatus(item.motorola_parts_status)) {
        return false;
      }

      if (currentRole === 'CCI' && currentStation && item.station_code !== currentStation) {
        return false;
      }

      // Strictly resolve region from CCI master station mapping
      const st = stationMap.get(item.station_code);
      const effectiveRegion = st?.region || item.region || 'West';

      if (selectedRegion !== 'ALL' && effectiveRegion !== selectedRegion) {
        return false;
      }
      if (selectedScreening !== 'ALL' && item.screening_status !== selectedScreening) {
        return false;
      }
      if (selectedCategory !== 'ALL' && item.part_category !== selectedCategory) {
        return false;
      }
      if (selectedMotoStatus !== 'ALL') {
        const info = getMotorolaStatusInfo(item.motorola_parts_status);
        if (String(info.code) !== selectedMotoStatus) {
          return false;
        }
      }

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchSr = item.sr_number.toLowerCase().includes(q);
        const matchSrPart = item.sr_part_number.toLowerCase().includes(q);
        const matchNewPart = (item.new_part_number || '').toLowerCase().includes(q);
        const matchSo = item.shipping_order_code.toLowerCase().includes(q);
        const matchDesc = (item.part_description || '').toLowerCase().includes(q);
        const matchStation = item.station_code.toLowerCase().includes(q);
        const matchStationName = (st?.station_name || '').toLowerCase().includes(q);
        const matchCity = (st?.city || item.city || '').toLowerCase().includes(q);
        if (!matchSr && !matchSrPart && !matchNewPart && !matchSo && !matchDesc && !matchStation && !matchStationName && !matchCity) {
          return false;
        }
      }

      return true;
    });
  }, [items, currentRole, currentStation, selectedRegion, selectedScreening, selectedCategory, selectedMotoStatus, searchTerm, stationMap]);

  const totalPages = Math.ceil(filteredItems.length / pageSize) || 1;
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  // Export to Excel
  const handleExport = () => {
    const exportData = filteredItems.map((item) => {
      const st = stationMap.get(item.station_code);
      return {
        'Composite Key': item.composite_key,
        'SR Number': item.sr_number,
        'Defective Part Number': item.sr_part_number,
        'New Part Number': item.new_part_number,
        'Part Category': item.part_category,
        'Part Description': item.part_description,
        'Quantity': item.quantity,
        'Station Code': item.station_code,
        'Station Name': st?.station_name || '',
        'City': st?.city || item.city || '',
        'State': st?.state || item.state || '',
        'Region': st?.region || item.region || '',
        'CCI-ASP Shipping Order (Leg 1)': item.shipping_order_code,
        'Delivery Challan Code': item.delivery_challan_code || '',
        'Deliver QTY': item.deliver_qty || item.quantity || 1,
        'Value (INR)': item.value !== undefined && item.value !== null ? item.value : item.estimated_value,
        'ASP-RC Shipping Order (Leg 2)': item.asp_rc_shipping_order_code || '',
        'Model Name': item.sr_model_name || '',
        'Fault Description': item.sr_fault_description || '',
        'Estimated Value (INR)': item.estimated_value,
        'Motorola Status': item.motorola_parts_status,
        'Screening Status': item.screening_status,
        'Item Remarks': item.item_remarks || '',
        'Last Synced': formatDate(item.last_synced_at),
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Defective Master');
    XLSX.writeFile(wb, `Motorola_Defective_Master_Vault_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* Admin-only Session Banner: Fetch Completed Journey (RC Received ASP) */}
      {currentRole === 'ADMIN' && onLoadCompletedSession && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-white border border-slate-200 shadow-xs">
          <div className="flex items-center gap-3 text-xs">
            <div className="p-2 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-slate-900">
                {isCompletedSessionLoaded
                  ? `Active & Completed Line Items in Session (${items.length} Items)`
                  : `Active Defective Line Items Vault (${items.length} Items)`}
              </span>
              <p className="text-slate-500 text-[11px] mt-0.5">
                {isCompletedSessionLoaded
                  ? `Completed journey defective items (RC Received ASP) are loaded for this session.`
                  : `Completed journey items (Code 5: RC Received ASP) are safely kept in Supabase.`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            {!isCompletedSessionLoaded ? (
              <button
                onClick={onLoadCompletedSession}
                disabled={isCompletedSessionLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 transition-colors cursor-pointer disabled:opacity-50"
                title="Fetch completed journey items from Supabase for this session"
              >
                {isCompletedSessionLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-700" />
                    <span>Fetching Completed...</span>
                  </>
                ) : (
                  <>
                    <Archive className="w-3.5 h-3.5 text-amber-700" />
                    <span>Fetch Completed Items (Session Only)</span>
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={onUnloadCompletedSession}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 cursor-pointer"
              >
                <span>Unload Completed Records</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search SR#, Part#, SO#, Model, or Description..."
            className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#001489] focus:bg-white transition-colors"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Region */}
          <select
            value={selectedRegion}
            onChange={(e) => {
              setSelectedRegion(e.target.value);
              setCurrentPage(1);
            }}
            aria-label="Filter by Region"
            className="bg-slate-50 border border-slate-300 text-slate-700 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#001489] focus:bg-white transition-colors"
          >
            <option value="ALL">All Regions ({filteredItems.length})</option>
            {availableRegions.map((reg) => (
              <option key={reg} value={reg}>
                {reg} Region
              </option>
            ))}
          </select>

          {/* Screening Status */}
          <select
            value={selectedScreening}
            onChange={(e) => {
              setSelectedScreening(e.target.value);
              setCurrentPage(1);
            }}
            aria-label="Filter by Screening Status"
            className="bg-slate-50 border border-slate-300 text-slate-700 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#001489] focus:bg-white transition-colors"
          >
            <option value="ALL">All Screening Statuses</option>
            <option value="Passed">Passed</option>
            <option value="Damaged">Damaged</option>
            <option value="Missing">Missing</option>
            <option value="Failed">Failed</option>
            <option value="Pending">Pending</option>
          </select>

          {/* Category */}
          <select
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              setCurrentPage(1);
            }}
            aria-label="Filter by Part Category"
            className="bg-slate-50 border border-slate-300 text-slate-700 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#001489] focus:bg-white max-w-[150px] transition-colors"
          >
            <option value="ALL">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Motorola Status */}
          <select
            value={selectedMotoStatus}
            onChange={(e) => {
              setSelectedMotoStatus(e.target.value);
              setCurrentPage(1);
            }}
            aria-label="Filter by Motorola Status"
            className="bg-slate-50 border border-slate-300 text-slate-700 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#001489] focus:bg-white transition-colors"
          >
            <option value="ALL">All Motorola Statuses</option>
            <option value="1">1. Not Return - Action: Create DC in Moto CRM</option>
            <option value="2">2. CCI Send to CWH - Active Logistics</option>
            <option value="3">3. CWH Received - At Warehouse</option>
            <option value="4">4. ASP Send to RC - Outbound to RC</option>
            <option value="5">5. RC Received ASP - Completed</option>
            <option value="6">6. RC Received ASP(Negative) - Discrepancy</option>
          </select>

          {/* Export */}
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 shadow-xs transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Export Vault ({filteredItems.length})
          </button>
        </div>
      </div>

      {/* Item Vault Table */}
      <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100/90 text-slate-600 border-b border-slate-200 font-mono text-[11px] tracking-wider uppercase">
              <tr>
                <th className="py-3 px-3">SR Number</th>
                <th className="py-3 px-3">Defective Part No</th>
                <th className="py-3 px-3">Issued Part No</th>
                <th className="py-3 px-3">Category & Description</th>
                <th className="py-3 px-3">Model</th>
                <th className="py-3 px-3">Station</th>
                <th className="py-3 px-3">SO Codes (Leg 1 / 2)</th>
                <th className="py-3 px-3 text-right">Est. Value</th>
                <th className="py-3 px-3 text-center">Screening</th>
                <th className="py-3 px-3">Motorola Status</th>
                {currentRole === 'ADMIN' && (
                  <th className="py-3 px-3 text-center">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-700">
              {paginatedItems.map((item) => {
                const motoInfo = getMotorolaStatusInfo(item.motorola_parts_status);
                const isNotReturn = motoInfo.code === 1;

                return (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-3 font-mono font-medium text-slate-900">
                      {item.sr_number}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-sky-700 font-medium">
                      {item.sr_part_number}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-500">
                      {item.new_part_number || '-'}
                    </td>
                    <td className="py-2.5 px-3 max-w-xs">
                      <div className="font-semibold text-slate-800 truncate">{item.part_category}</div>
                      <div className="text-[11px] text-slate-500 truncate">{item.part_description}</div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">
                      {item.sr_model_name || '-'}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-700">
                      <div className="font-semibold text-slate-900">{item.station_code}</div>
                      <div className="text-[10px] text-sky-700 font-medium truncate max-w-[130px]" title={[stationMap.get(item.station_code)?.city || item.city, stationMap.get(item.station_code)?.state || item.state, stationMap.get(item.station_code)?.region || item.region].filter(Boolean).join(', ')}>
                        {[stationMap.get(item.station_code)?.city || item.city, stationMap.get(item.station_code)?.state || item.state].filter(Boolean).join(', ') || stationMap.get(item.station_code)?.region || item.region}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-600 truncate max-w-[150px]">
                      <div className="font-semibold text-slate-900">{item.shipping_order_code}</div>
                      {item.delivery_challan_code && (
                        <div className="text-[10px] text-blue-700 font-semibold truncate" title={`Delivery Challan: ${item.delivery_challan_code}`}>
                          DC: {item.delivery_challan_code}
                        </div>
                      )}
                      {item.asp_rc_shipping_order_code && (
                        <div className="text-[10px] text-purple-700 font-medium truncate">
                          RC: {item.asp_rc_shipping_order_code}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      <div className="font-bold text-emerald-700">
                        {formatINR((item.value !== undefined && item.value !== null && item.value > 0 ? item.value : (item.estimated_value || 8000)) * (item.deliver_qty || item.quantity || 1))}
                      </div>
                      <div className="text-[10px] text-slate-500 font-sans">
                        Qty: {item.deliver_qty || item.quantity || 1}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${getScreeningStatusStyle(item.screening_status)}`}>
                        {item.screening_status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${motoInfo.badgeClass}`}
                        title={motoInfo.meaning}
                      >
                        {motoInfo.label}
                      </span>
                      {isNotReturn && (
                        <div className="text-[9px] text-amber-700 font-semibold mt-0.5">
                          Action: Create DC
                        </div>
                      )}
                    </td>
                    {currentRole === 'ADMIN' && (
                      <td className="py-2.5 px-3 text-center">
                        {onDeleteItem && (
                          <button
                            onClick={() => onDeleteItem(item)}
                            title="Delete Item (Admin Only)"
                            className="p-1 rounded bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
              {paginatedItems.length === 0 && (
                <tr>
                  <td colSpan={currentRole === 'ADMIN' ? 11 : 10} className="py-12 text-center text-slate-400">
                    No defective items found matching your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50/80 text-xs text-slate-600">
          <div>
            Showing <strong className="text-slate-900">{filteredItems.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}</strong> to{' '}
            <strong className="text-slate-900">{Math.min(currentPage * pageSize, filteredItems.length)}</strong> of{' '}
            <strong className="text-slate-900">{filteredItems.length}</strong> defective line items
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-slate-300 text-slate-600 disabled:opacity-40 hover:bg-slate-200 bg-white transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 py-1 font-mono text-slate-700">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-slate-300 text-slate-600 disabled:opacity-40 hover:bg-slate-200 bg-white transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
