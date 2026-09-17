import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { 
  Store, 
  Search, 
  MapPin, 
  User, 
  Phone, 
  CheckCircle2, 
  Download, 
  ChevronLeft, 
  ChevronRight,
  Building2,
  X
} from 'lucide-react';
import { CCIMaster } from '../../types/crm';

interface CciDirectoryProps {
  stations: CCIMaster[];
  onSelectStation?: (stationCode: string) => void;
}

const getRegionBadge = (region?: string) => {
  const r = (region || '').trim().toLowerCase();
  switch (r) {
    case 'north':
      return 'bg-blue-50 text-blue-800 border-blue-300';
    case 'south':
      return 'bg-emerald-50 text-emerald-800 border-emerald-300';
    case 'west':
      return 'bg-amber-50 text-amber-900 border-amber-300';
    case 'east':
      return 'bg-purple-50 text-purple-800 border-purple-300';
    case 'central':
      return 'bg-cyan-50 text-cyan-800 border-cyan-300';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-300';
  }
};

export const CciDirectory: React.FC<CciDirectoryProps> = ({ stations, onSelectStation }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

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

  const filteredStations = useMemo(() => {
    return stations.filter((st) => {
      if (selectedRegion !== 'ALL' && st.region !== selectedRegion) {
        return false;
      }
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchCode = st.station_code.toLowerCase().includes(q);
        const matchName = st.station_name.toLowerCase().includes(q);
        const matchCity = (st.city || '').toLowerCase().includes(q);
        const matchState = (st.state || '').toLowerCase().includes(q);
        const matchUser = (st.username || '').toLowerCase().includes(q);
        const matchPerson = (st.contact_person || '').toLowerCase().includes(q);
        const matchPhone = (st.contact_phone || '').toLowerCase().includes(q);
        if (!matchCode && !matchName && !matchCity && !matchState && !matchUser && !matchPerson && !matchPhone) {
          return false;
        }
      }
      return true;
    });
  }, [stations, selectedRegion, searchTerm]);

  // Reset to page 1 when search or region filter changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedRegion, pageSize]);

  const totalPages = Math.ceil(filteredStations.length / pageSize) || 1;
  const paginatedStations = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredStations.slice(start, start + pageSize);
  }, [filteredStations, currentPage, pageSize]);

  const handleExportExcel = () => {
    const exportData = filteredStations.map((st) => ({
      'Station Code': st.station_code,
      'Portal Username': st.username || `cci_${st.station_code}`,
      'Service Center Name': st.station_name,
      'Region': st.region,
      'City': st.city || '',
      'State': st.state || '',
      'Contact Person': st.contact_person || '',
      'Contact Phone': st.contact_phone || '',
      'Status': 'Active Node',
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'CCI Stations');
    XLSX.writeFile(wb, `Motorola_CCI_Stations_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* Header & Filter Controls Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
          {/* Search Box with Clear Button */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search code, name, city, state, username..."
              className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-8 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#001489] focus:bg-white transition-colors"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Region Dropdown Filter */}
          <div className="flex items-center gap-2">
            <select
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
              className="bg-slate-50 border border-slate-300 text-slate-700 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#001489] focus:bg-white transition-colors"
            >
              <option value="ALL">All Regions ({stations.length})</option>
              {availableRegions.map((reg) => {
                const count = stations.filter((s) => s.region === reg).length;
                return (
                  <option key={reg} value={reg}>
                    {reg} Region ({count})
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {/* Right Controls: Export & Scope Count */}
        <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200">
          <span className="text-xs text-slate-500 font-mono">
            Showing <strong className="text-slate-900">{filteredStations.length}</strong> of {stations.length} stations
          </span>

          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 transition-colors shadow-xs cursor-pointer"
            title="Export filtered stations to Excel"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            Export Excel
          </button>
        </div>
      </div>

      {/* Stations Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100/90 text-slate-600 border-b border-slate-200 font-mono text-[11px] tracking-wider uppercase">
              <tr>
                <th className="py-3 px-3.5 uppercase tracking-wider text-[11px] font-semibold whitespace-nowrap">
                  Station Code
                </th>
                <th className="py-3 px-3.5 uppercase tracking-wider text-[11px] font-semibold whitespace-nowrap">
                  Portal Login
                </th>
                <th className="py-3 px-3.5 uppercase tracking-wider text-[11px] font-semibold whitespace-nowrap">
                  Service Center Name
                </th>
                <th className="py-3 px-3.5 uppercase tracking-wider text-[11px] font-semibold whitespace-nowrap">
                  Region
                </th>
                <th className="py-3 px-3.5 uppercase tracking-wider text-[11px] font-semibold whitespace-nowrap">
                  Location (City, State)
                </th>
                <th className="py-3 px-3.5 uppercase tracking-wider text-[11px] font-semibold whitespace-nowrap">
                  Contact Person
                </th>
                <th className="py-3 px-3.5 uppercase tracking-wider text-[11px] font-semibold whitespace-nowrap">
                  Contact Phone
                </th>
                <th className="py-3 px-3.5 text-center uppercase tracking-wider text-[11px] font-semibold whitespace-nowrap">
                  Status
                </th>
                {onSelectStation && (
                  <th className="py-3 px-3.5 text-right uppercase tracking-wider text-[11px] font-semibold whitespace-nowrap">
                    Action
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-700 bg-white">
              {paginatedStations.map((st) => (
                <tr 
                  key={st.station_code} 
                  className="hover:bg-slate-50/80 transition-colors"
                >
                  {/* Station Code */}
                  <td className="py-3 px-3.5 whitespace-nowrap align-middle">
                    <span className="font-mono font-bold text-slate-900 text-xs bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                      Station {st.station_code}
                    </span>
                  </td>

                  {/* Portal Login (@username) */}
                  <td className="py-3 px-3.5 whitespace-nowrap align-middle">
                    <span className="font-mono text-xs text-sky-800 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                      @{st.username || `cci_${st.station_code}`}
                    </span>
                  </td>

                  {/* Service Center Name */}
                  <td className="py-3 px-3.5 align-middle">
                    <div className="font-semibold text-slate-900 max-w-xs truncate" title={st.station_name}>
                      {st.station_name}
                    </div>
                  </td>

                  {/* Region */}
                  <td className="py-3 px-3.5 whitespace-nowrap align-middle">
                    <span className={`px-2.5 py-0.5 rounded text-[10px] font-semibold border ${getRegionBadge(st.region)}`}>
                      {st.region || 'West'}
                    </span>
                  </td>

                  {/* Location (City, State) */}
                  <td className="py-3 px-3.5 whitespace-nowrap align-middle">
                    <div className="flex items-center gap-1.5 text-slate-700">
                      <MapPin className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                      <span>
                        {[st.city, st.state].filter(Boolean).join(', ') || 'India'}
                      </span>
                    </div>
                  </td>

                  {/* Contact Person */}
                  <td className="py-3 px-3.5 whitespace-nowrap align-middle">
                    {st.contact_person ? (
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{st.contact_person}</span>
                      </div>
                    ) : (
                      <span className="text-slate-400 italic text-[11px]">—</span>
                    )}
                  </td>

                  {/* Contact Phone */}
                  <td className="py-3 px-3.5 whitespace-nowrap align-middle">
                    {st.contact_phone ? (
                      <div className="flex items-center gap-1.5 text-slate-700 font-mono text-xs">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{st.contact_phone}</span>
                      </div>
                    ) : (
                      <span className="text-slate-400 italic text-[11px]">—</span>
                    )}
                  </td>

                  {/* Status */}
                  <td className="py-3 px-3.5 text-center whitespace-nowrap align-middle">
                    <span className="inline-flex items-center gap-1 text-emerald-800 bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded-full text-[10px] font-medium">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      Active Node
                    </span>
                  </td>

                  {/* Action (if applicable) */}
                  {onSelectStation && (
                    <td className="py-3 px-3.5 text-right whitespace-nowrap align-middle">
                      <button
                        onClick={() => onSelectStation(st.station_code)}
                        className="text-xs text-[#001489] hover:underline cursor-pointer font-medium"
                      >
                        View as CCI →
                      </button>
                    </td>
                  )}
                </tr>
              ))}

              {filteredStations.length === 0 && (
                <tr>
                  <td colSpan={onSelectStation ? 9 : 8} className="py-12 text-center text-slate-500">
                    <Store className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    No service center stations match &quot;{searchTerm || selectedRegion}&quot;.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination & Page Size Footer */}
        {filteredStations.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 bg-slate-50/80 border-t border-slate-200 text-xs">
            <div className="flex items-center gap-2 text-slate-500">
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="bg-white border border-slate-300 text-slate-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-[#001489]"
              >
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="ml-2 font-mono">
                {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, filteredStations.length)} of {filteredStations.length}
              </span>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <span className="text-slate-500 font-mono mr-1">
                Page {currentPage} of {totalPages}
              </span>
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-1 rounded bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                title="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="p-1 rounded bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                title="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

