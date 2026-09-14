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
  Trash2
} from 'lucide-react';
import { DefectiveItem, CCIMaster, UserRole } from '../../types/crm';
import { formatINR, formatDate, getScreeningStatusStyle } from '../../lib/utils';

interface DefectiveMasterVaultProps {
  items: DefectiveItem[];
  stations: CCIMaster[];
  currentRole: UserRole;
  currentStation?: string;
  onDeleteItem?: (item: DefectiveItem) => void;
}

export const DefectiveMasterVault: React.FC<DefectiveMasterVaultProps> = ({
  items,
  stations,
  currentRole,
  currentStation,
  onDeleteItem,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('ALL');
  const [selectedScreening, setSelectedScreening] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

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
      if (currentRole === 'CCI' && currentStation && item.station_code !== currentStation) {
        return false;
      }
      if (selectedRegion !== 'ALL' && item.region !== selectedRegion) {
        return false;
      }
      if (selectedScreening !== 'ALL' && item.screening_status !== selectedScreening) {
        return false;
      }
      if (selectedCategory !== 'ALL' && item.part_category !== selectedCategory) {
        return false;
      }

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchSr = item.sr_number.toLowerCase().includes(q);
        const matchSrPart = item.sr_part_number.toLowerCase().includes(q);
        const matchNewPart = (item.new_part_number || '').toLowerCase().includes(q);
        const matchSo = item.shipping_order_code.toLowerCase().includes(q);
        const matchDesc = (item.part_description || '').toLowerCase().includes(q);
        const matchStation = item.station_code.toLowerCase().includes(q);
        if (!matchSr && !matchSrPart && !matchNewPart && !matchSo && !matchDesc && !matchStation) {
          return false;
        }
      }

      return true;
    });
  }, [items, currentRole, currentStation, selectedRegion, selectedScreening, selectedCategory, searchTerm]);

  const totalPages = Math.ceil(filteredItems.length / pageSize) || 1;
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  // Export to Excel
  const handleExport = () => {
    const exportData = filteredItems.map((item) => ({
      'Composite Key': item.composite_key,
      'SR Number': item.sr_number,
      'Defective Part Number': item.sr_part_number,
      'New Part Number': item.new_part_number,
      'Part Category': item.part_category,
      'Part Description': item.part_description,
      'Quantity': item.quantity,
      'Station Code': item.station_code,
      'Region': item.region,
      'Shipping Order Code': item.shipping_order_code,
      'Model Name': item.sr_model_name || '',
      'Fault Description': item.sr_fault_description || '',
      'Estimated Value (INR)': item.estimated_value,
      'Motorola Status': item.motorola_parts_status,
      'Screening Status': item.screening_status,
      'Item Remarks': item.item_remarks || '',
      'Last Synced': formatDate(item.last_synced_at),
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Defective Master');
    XLSX.writeFile(wb, `Motorola_Defective_Master_Vault_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-xl bg-[#101a35] border border-[#1c2b53]">
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
            className="w-full bg-[#0b1329] border border-[#1f2e5a] rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:border-cyan-500"
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
            className="bg-[#0b1329] border border-[#1f2e5a] text-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Regions</option>
            <option value="North">North</option>
            <option value="South">South</option>
            <option value="East">East</option>
            <option value="West">West</option>
            <option value="Central">Central</option>
          </select>

          {/* Screening Status */}
          <select
            value={selectedScreening}
            onChange={(e) => {
              setSelectedScreening(e.target.value);
              setCurrentPage(1);
            }}
            aria-label="Filter by Screening Status"
            className="bg-[#0b1329] border border-[#1f2e5a] text-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-cyan-500"
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
            className="bg-[#0b1329] border border-[#1f2e5a] text-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-cyan-500 max-w-[150px]"
          >
            <option value="ALL">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Export */}
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Export Vault ({filteredItems.length})
          </button>
        </div>
      </div>

      {/* Item Vault Table */}
      <div className="rounded-xl border border-[#1c2b53] overflow-hidden bg-[#101a35] shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0b1329] text-slate-400 border-b border-[#1c2b53] font-mono">
              <tr>
                <th className="py-3 px-3">SR Number</th>
                <th className="py-3 px-3">Defective Part No</th>
                <th className="py-3 px-3">Issued Part No</th>
                <th className="py-3 px-3">Category & Description</th>
                <th className="py-3 px-3">Model</th>
                <th className="py-3 px-3">Station</th>
                <th className="py-3 px-3">Parent SO Code</th>
                <th className="py-3 px-3 text-right">Est. Value</th>
                <th className="py-3 px-3 text-center">Screening</th>
                <th className="py-3 px-3">Motorola Status</th>
                {currentRole === 'ADMIN' && (
                  <th className="py-3 px-3 text-center">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1c2b53]/60 text-slate-300">
              {paginatedItems.map((item) => (
                <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-2.5 px-3 font-mono font-medium text-white">
                    {item.sr_number}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-cyan-300">
                    {item.sr_part_number}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-400">
                    {item.new_part_number || '-'}
                  </td>
                  <td className="py-2.5 px-3 max-w-xs">
                    <div className="font-semibold text-slate-200 truncate">{item.part_category}</div>
                    <div className="text-[11px] text-slate-400 truncate">{item.part_description}</div>
                  </td>
                  <td className="py-2.5 px-3 text-slate-300">
                    {item.sr_model_name || '-'}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-300">
                    {item.station_code} <span className="text-[10px] text-slate-500">({item.region})</span>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-400 truncate max-w-[130px]">
                    {item.shipping_order_code}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">
                    {formatINR((item.estimated_value || 8000) * (item.quantity || 1))}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${getScreeningStatusStyle(item.screening_status)}`}>
                      {item.screening_status}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-slate-400 text-[11px] truncate max-w-[120px]" title={item.motorola_parts_status}>
                    {item.motorola_parts_status}
                  </td>
                  {currentRole === 'ADMIN' && (
                    <td className="py-2.5 px-3 text-center">
                      {onDeleteItem && (
                        <button
                          onClick={() => onDeleteItem(item)}
                          title="Delete Item (Admin Only)"
                          className="p-1 rounded bg-[#1f2e5a]/60 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {paginatedItems.length === 0 && (
                <tr>
                  <td colSpan={currentRole === 'ADMIN' ? 11 : 10} className="py-12 text-center text-slate-500">
                    No defective items found matching your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-[#1c2b53] bg-[#0b1329] text-xs text-slate-400">
          <div>
            Showing <strong className="text-white">{filteredItems.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}</strong> to{' '}
            <strong className="text-white">{Math.min(currentPage * pageSize, filteredItems.length)}</strong> of{' '}
            <strong className="text-white">{filteredItems.length}</strong> defective line items
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
