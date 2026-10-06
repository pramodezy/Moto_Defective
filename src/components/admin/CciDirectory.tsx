import React, { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
  Store, 
  Search, 
  MapPin, 
  User, 
  Phone, 
  CheckCircle2, 
  XCircle,
  Download, 
  Upload,
  Plus,
  Edit2,
  ChevronLeft, 
  ChevronRight, 
  X,
  FileSpreadsheet,
  AlertCircle
} from 'lucide-react';
import { CCIMaster, UserProfile, OPERATIONAL_REGIONS } from '../../types/crm';
import { crmDb } from '../../lib/db';
import { parseRegionMappingFile, generateSampleRegionTemplateCSV } from '../../services/regionMappingIngestor';
import { toast } from 'sonner';

interface CciDirectoryProps {
  stations: CCIMaster[];
  currentUser?: UserProfile;
  onSelectStation?: (stationCode: string) => void;
}

const getRegionBadge = (region?: string) => {
  const r = (region || '').trim().toUpperCase().replace(/\s+/g, '-');
  switch (r) {
    case 'WEST':
      return 'bg-amber-50 text-amber-900 border-amber-300';
    case 'SOUTH-2':
      return 'bg-teal-50 text-teal-800 border-teal-300';
    case 'NORTH-2':
      return 'bg-indigo-50 text-indigo-800 border-indigo-300';
    case 'EAST':
      return 'bg-purple-50 text-purple-800 border-purple-300';
    case 'SOUTH-1':
    case 'SOUTH':
      return 'bg-emerald-50 text-emerald-800 border-emerald-300';
    case 'CENTRAL':
      return 'bg-cyan-50 text-cyan-800 border-cyan-300';
    case 'NORTH-1':
    case 'NORTH':
      return 'bg-blue-50 text-blue-800 border-blue-300';
    case 'SOUTH-3':
      return 'bg-green-50 text-green-800 border-green-300';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-300';
  }
};

export const CciDirectory: React.FC<CciDirectoryProps> = ({ 
  stations, 
  currentUser, 
  onSelectStation 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStation, setEditingStation] = useState<CCIMaster | null>(null);
  const [statusToggleStation, setStatusToggleStation] = useState<CCIMaster | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Form states - Add / Edit
  const [formStationCode, setFormStationCode] = useState('');
  const [formStationName, setFormStationName] = useState('');
  const [formRegion, setFormRegion] = useState('WEST');
  const [formState, setFormState] = useState('');
  const [formCity, setFormCity] = useState('');
  const [formContactPerson, setFormContactPerson] = useState('');
  const [formContactPhone, setFormContactPhone] = useState('');
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);

  // Upload Excel states
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isParsingExcel, setIsParsingExcel] = useState(false);
  const [parsedPreview, setParsedPreview] = useState<{ stations: CCIMaster[]; totalRows: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Available regions from dataset: WEST, SOUTH-2, NORTH-2, EAST, SOUTH-1, CENTRAL, NORTH-1, SOUTH-3
  const availableRegions = useMemo(() => {
    const ordered = [...OPERATIONAL_REGIONS];
    stations.forEach((st) => {
      const reg = (st.region || '').trim().toUpperCase();
      if (reg && !ordered.includes(reg as any)) {
        ordered.push(reg as any);
      }
    });
    return ordered;
  }, [stations]);

  // Filtering
  const filteredStations = useMemo(() => {
    return stations.filter((st) => {
      if (selectedRegion !== 'ALL') {
        const stationReg = (st.region || '').trim().toUpperCase();
        const filterReg = selectedRegion.trim().toUpperCase();
        if (stationReg !== filterReg && !(filterReg === 'SOUTH' && stationReg.startsWith('SOUTH')) && !(filterReg === 'NORTH' && stationReg.startsWith('NORTH'))) {
          return false;
        }
      }
      if (statusFilter === 'ACTIVE' && st.is_active === false) return false;
      if (statusFilter === 'INACTIVE' && st.is_active !== false) return false;

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
  }, [stations, selectedRegion, statusFilter, searchTerm]);

  // Reset to page 1 when search or region filter changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedRegion, statusFilter, pageSize]);

  const totalPages = Math.ceil(filteredStations.length / pageSize) || 1;
  const paginatedStations = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredStations.slice(start, start + pageSize);
  }, [filteredStations, currentPage, pageSize]);

  // Stats calculation
  const stats = useMemo(() => {
    const total = stations.length;
    const active = stations.filter((s) => s.is_active !== false).length;
    const inactive = stations.filter((s) => s.is_active === false).length;
    return { total, active, inactive };
  }, [stations]);

  // Handle Export to Excel
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
      'Status': st.is_active !== false ? 'Active' : 'Inactive',
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'CCI Stations');
    XLSX.writeFile(wb, `Motorola_CCI_Centers_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success(`Exported ${filteredStations.length} CCI center records to Excel.`);
  };

  // Open Add Modal
  const handleOpenAddModal = () => {
    setFormStationCode('');
    setFormStationName('');
    setFormRegion('WEST');
    setFormState('');
    setFormCity('');
    setFormContactPerson('');
    setFormContactPhone('');
    setShowAddModal(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (st: CCIMaster) => {
    setEditingStation(st);
    setFormStationCode(st.station_code);
    setFormStationName(st.station_name);
    setFormRegion(st.region || 'WEST');
    setFormState(st.state || '');
    setFormCity(st.city || '');
    setFormContactPerson(st.contact_person || '');
    setFormContactPhone(st.contact_phone || '');
  };

  // Save Station (Add or Edit)
  const handleSaveStation = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = formStationCode.trim();
    const name = formStationName.trim();
    if (!code) {
      toast.error('Station Code is required.');
      return;
    }
    if (!name) {
      toast.error('Service Center Name is required.');
      return;
    }

    setIsSubmittingForm(true);
    try {
      const isEditing = !!editingStation;
      const targetStation: CCIMaster = {
        station_code: code,
        username: isEditing ? (editingStation.username || `cci_${code}`) : `cci_${code}`,
        station_name: name,
        region: formRegion,
        state: formState.trim() || undefined,
        city: formCity.trim() || undefined,
        contact_person: formContactPerson.trim() || undefined,
        contact_phone: formContactPhone.trim() || undefined,
        is_active: isEditing ? editingStation.is_active : true,
      };

      const result = await crmDb.upsertSingleStation(targetStation, currentUser);
      if (result.cloudSynced) {
        toast.success(
          isEditing
            ? `Updated CCI Center ${code} successfully in cloud database.`
            : `Added new CCI Center ${code} successfully in cloud database.`
        );
      } else if (result.error) {
        toast.warning(
          `Saved locally, but Supabase sync failed: ${result.error}. Please execute migration in Supabase SQL editor.`
        );
      } else {
        toast.success(
          isEditing
            ? `Updated CCI Center ${code} successfully.`
            : `Added new CCI Center ${code} successfully.`
        );
      }

      setShowAddModal(false);
      setEditingStation(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save CCI center.');
    } finally {
      setIsSubmittingForm(false);
    }
  };

  // Confirm Status Toggle
  const handleConfirmToggleStatus = async () => {
    if (!statusToggleStation) return;
    const currentIsActive = statusToggleStation.is_active !== false;
    const newStatus = !currentIsActive;

    try {
      const result = await crmDb.toggleStationStatus(statusToggleStation.station_code, newStatus, currentUser);
      if (result.cloudSynced) {
        toast.success(
          `CCI Center ${statusToggleStation.station_code} marked as ${newStatus ? 'ACTIVE' : 'INACTIVE'} (synced to cloud).`
        );
      } else if (result.error) {
        toast.warning(
          `Status changed locally, but Supabase sync failed: ${result.error}`
        );
      } else {
        toast.success(
          `CCI Center ${statusToggleStation.station_code} marked as ${newStatus ? 'ACTIVE' : 'INACTIVE'}.`
        );
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to update CCI status.');
    } finally {
      setStatusToggleStation(null);
    }
  };

  // Handle Excel Upload Selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFile(file);
    setIsParsingExcel(true);
    setParsedPreview(null);

    try {
      const result = await parseRegionMappingFile(file);
      setParsedPreview({
        stations: result.stations,
        totalRows: result.totalRows,
      });
      toast.info(`Parsed ${result.stations.length} stations from "${file.name}".`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to parse Excel file.');
      setUploadedFile(null);
    } finally {
      setIsParsingExcel(false);
    }
  };

  // Submit Bulk Upload
  const handleConfirmBulkUpload = () => {
    if (!parsedPreview || parsedPreview.stations.length === 0) return;

    try {
      const res = crmDb.batchUpsertStations(
        parsedPreview.stations,
        currentUser || {
          id: 'admin',
          username: 'Admin',
          full_name: 'Administrator',
          role: 'ADMIN',
        }
      );

      toast.success(
        `Region mapping imported: ${res.inserted} new centers added, ${res.updated} centers updated.`
      );
      setShowUploadModal(false);
      setUploadedFile(null);
      setParsedPreview(null);
    } catch (err: any) {
      toast.error(err.message || 'Bulk upload failed.');
    }
  };

  // Download Sample Template
  const handleDownloadTemplate = () => {
    const csvContent = generateSampleRegionTemplateCSV();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'CCI_Region_Mapping_Template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      {/* Top Banner / Actions Header */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-blue-50 text-[#001489] rounded-xl border border-blue-100">
              <Store className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2 font-['Outfit']">
                CCI Master Management
                <span className="text-xs font-normal font-sans px-2.5 py-0.5 rounded-full bg-blue-50 text-[#001489] border border-blue-200/60 font-semibold">
                  Admin Console
                </span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Manage Motorola authorized service centers (CCIs), regional coverage, and active operation status.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => {
                setUploadedFile(null);
                setParsedPreview(null);
                setShowUploadModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition shadow-xs cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-slate-600" />
              Upload Region Mapping (Excel)
            </button>

            <button
              onClick={handleOpenAddModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#001489] hover:bg-[#08209e] rounded-xl shadow-md shadow-blue-900/15 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add New CCI
            </button>
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-11 gap-2 mt-4 pt-4 border-t border-slate-100 text-xs">
          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200/60">
            <div className="text-[11px] text-slate-500 uppercase font-medium">Total CCIs</div>
            <div className="text-base font-bold text-slate-900 mt-0.5">{stats.total}</div>
          </div>
          <div className="bg-emerald-50/60 rounded-lg p-2.5 border border-emerald-200/60">
            <div className="text-[11px] text-emerald-700 uppercase font-medium">Active</div>
            <div className="text-base font-bold text-emerald-700 mt-0.5">{stats.active}</div>
          </div>
          <div className="bg-red-50/60 rounded-lg p-2.5 border border-red-200/60">
            <div className="text-[11px] text-red-700 uppercase font-medium">Inactive</div>
            <div className="text-base font-bold text-red-700 mt-0.5">{stats.inactive}</div>
          </div>
          {OPERATIONAL_REGIONS.map((r) => {
            const count = stations.filter((s) => {
              const stReg = (s.region || '').trim().toUpperCase();
              return stReg === r;
            }).length;
            return (
              <div key={r} className="bg-slate-50/80 rounded-lg p-2.5 border border-slate-200/60">
                <div className="text-[10px] text-slate-500 uppercase font-bold truncate" title={r}>{r}</div>
                <div className="text-base font-bold text-slate-800 mt-0.5">{count}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search station code, center name, city, state, username..."
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
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-medium whitespace-nowrap">Region:</span>
            <select
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
              className="bg-slate-50 border border-slate-300 text-slate-700 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:border-[#001489]"
            >
              <option value="ALL">All Regions ({stations.length})</option>
              {availableRegions.map((reg) => {
                const count = stations.filter((s) => s.region === reg).length;
                return (
                  <option key={reg} value={reg}>
                    {reg} ({count})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Status Dropdown Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-medium whitespace-nowrap">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-slate-50 border border-slate-300 text-slate-700 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:border-[#001489]"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active Nodes</option>
              <option value="INACTIVE">Inactive Nodes</option>
            </select>
          </div>
        </div>

        {/* Right Controls: Export & Count */}
        <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200">
          <span className="text-xs text-slate-500 font-mono">
            Showing <strong className="text-slate-900">{filteredStations.length}</strong> of {stations.length}
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
                <th className="py-3 px-3.5 text-right uppercase tracking-wider text-[11px] font-semibold whitespace-nowrap">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-700 bg-white">
              {paginatedStations.map((st) => {
                const isActive = st.is_active !== false;

                return (
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
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                          isActive
                            ? 'text-emerald-800 bg-emerald-50 border-emerald-300'
                            : 'text-red-800 bg-red-50 border-red-300'
                        }`}
                      >
                        {isActive ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Active Node
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3 text-red-600" />
                            Inactive Node
                          </>
                        )}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-3.5 text-right whitespace-nowrap align-middle">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => handleOpenEditModal(st)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition cursor-pointer"
                          title="Edit Center Details"
                        >
                          <Edit2 className="w-3 h-3 text-slate-500" />
                          Edit
                        </button>

                        <button
                          onClick={() => setStatusToggleStation(st)}
                          className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-lg border transition cursor-pointer ${
                            isActive
                              ? 'text-red-700 bg-red-50 hover:bg-red-100 border-red-200'
                              : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200'
                          }`}
                          title={isActive ? 'Deactivate Center' : 'Activate Center'}
                        >
                          {isActive ? 'Deactivate' : 'Activate'}
                        </button>

                        {onSelectStation && (
                          <button
                            onClick={() => onSelectStation(st.station_code)}
                            className="text-xs text-[#001489] hover:underline font-medium cursor-pointer ml-1"
                          >
                            Preview →
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredStations.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
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

      {/* MODAL 1: Add New CCI Center / Edit Center */}
      {(showAddModal || editingStation) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-100/70 text-[#001489] rounded-xl">
                  <Store className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 font-['Outfit'] text-base">
                    {editingStation ? `Edit CCI Center: ${editingStation.station_code}` : 'Add New CCI Center'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {editingStation
                      ? 'Update service center profile and regional coverage'
                      : 'Register an authorized Motorola customer care center'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingStation(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveStation} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {/* Station Code */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Station Code *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!!editingStation}
                    value={formStationCode}
                    onChange={(e) => setFormStationCode(e.target.value)}
                    placeholder="e.g. 068 or DEL01"
                    className="w-full px-3.5 py-2.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-[#001489] focus:bg-white transition disabled:opacity-50"
                  />
                </div>

                {/* Region */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Region *
                  </label>
                  <select
                    value={formRegion}
                    onChange={(e) => setFormRegion(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-[#001489] focus:bg-white transition"
                  >
                    {OPERATIONAL_REGIONS.map((r) => (
                      <option key={r} value={r}>
                        {r} Region
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Center Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Service Center Name *
                </label>
                <input
                  type="text"
                  required
                  value={formStationName}
                  onChange={(e) => setFormStationName(e.target.value)}
                  placeholder="e.g. RRLC-068-Noble Sales And Services"
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-[#001489] focus:bg-white transition"
                />
              </div>

              {/* City and State */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    City / Location
                  </label>
                  <input
                    type="text"
                    value={formCity}
                    onChange={(e) => setFormCity(e.target.value)}
                    placeholder="e.g. Mumbai"
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-[#001489] focus:bg-white transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    State
                  </label>
                  <input
                    type="text"
                    value={formState}
                    onChange={(e) => setFormState(e.target.value)}
                    placeholder="e.g. Maharashtra"
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-[#001489] focus:bg-white transition"
                  />
                </div>
              </div>

              {/* Contact Person & Phone */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Contact Person
                  </label>
                  <input
                    type="text"
                    value={formContactPerson}
                    onChange={(e) => setFormContactPerson(e.target.value)}
                    placeholder="e.g. Pravin Jadhav"
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-[#001489] focus:bg-white transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Contact Phone
                  </label>
                  <input
                    type="text"
                    value={formContactPhone}
                    onChange={(e) => setFormContactPhone(e.target.value)}
                    placeholder="e.g. +91 98201 12345"
                    className="w-full px-3.5 py-2.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-[#001489] focus:bg-white transition"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingStation(null);
                  }}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingForm}
                  className="px-5 py-2 text-xs font-bold text-white bg-[#001489] hover:bg-[#08209e] rounded-xl shadow-md transition disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingForm
                    ? 'Saving...'
                    : editingStation
                    ? 'Update Center'
                    : 'Add CCI Center'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Activate / Deactivate Confirmation */}
      {statusToggleStation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div
                className={`p-3 rounded-2xl ${
                  statusToggleStation.is_active === false
                    ? 'bg-emerald-50 text-emerald-600'
                    : 'bg-red-50 text-red-600'
                }`}
              >
                {statusToggleStation.is_active === false ? (
                  <CheckCircle2 className="w-6 h-6" />
                ) : (
                  <AlertCircle className="w-6 h-6" />
                )}
              </div>
              <div>
                <h3 className="font-bold text-slate-900 font-['Outfit'] text-base">
                  {statusToggleStation.is_active === false
                    ? 'Activate CCI Center?'
                    : 'Deactivate CCI Center?'}
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  Station {statusToggleStation.station_code} ({statusToggleStation.station_name})
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {statusToggleStation.is_active === false ? (
                <>
                  Are you sure you want to reactivate CCI Center{' '}
                  <strong>{statusToggleStation.station_name}</strong>? Associated station user login accounts will also be reactivated.
                </>
              ) : (
                <>
                  Are you sure you want to mark this center as <strong>INACTIVE</strong>? All user login accounts assigned to this center will also be deactivated immediately, preventing portal access.
                </>
              )}
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setStatusToggleStation(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmToggleStatus}
                className={`px-5 py-2 text-xs font-bold text-white rounded-xl shadow-md transition cursor-pointer ${
                  statusToggleStation.is_active === false
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {statusToggleStation.is_active === false ? 'Yes, Reactivate Center' : 'Yes, Deactivate Center'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Upload Region Mapping (Excel) */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-100/70 text-emerald-800 rounded-xl">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 font-['Outfit'] text-base">
                    Upload Region Mapping (Excel)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Bulk import or synchronize CCI centers, states, cities, and regional zones
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Template download link */}
              <div className="flex items-center justify-between p-3 bg-blue-50/60 rounded-xl border border-blue-200/60 text-xs">
                <span className="text-blue-900">Need the official format for bulk mapping?</span>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="font-bold text-[#001489] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Sample CSV
                </button>
              </div>

              {/* Upload Dropzone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-[#001489] rounded-2xl p-6 text-center cursor-pointer transition-colors bg-slate-50/50 hover:bg-blue-50/20"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <div className="text-xs font-bold text-slate-700">
                  {uploadedFile ? uploadedFile.name : 'Click to select or drag & drop Region Mapping file'}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Supports .xlsx, .xls, and .csv with Station Code, Name, Region, State, City
                </div>
              </div>

              {isParsingExcel && (
                <div className="text-center py-3 text-xs text-slate-500 animate-pulse">
                  Parsing spreadsheet columns and normalizing station codes...
                </div>
              )}

              {/* Parsed Preview */}
              {parsedPreview && (
                <div className="p-3.5 bg-emerald-50/50 rounded-xl border border-emerald-200/60 text-xs space-y-2">
                  <div className="flex items-center justify-between font-semibold text-emerald-900">
                    <span>Parsed {parsedPreview.stations.length} valid stations from {parsedPreview.totalRows} rows.</span>
                    <span className="text-emerald-700 font-mono">Ready to Sync</span>
                  </div>
                  <div className="max-h-36 overflow-y-auto divide-y divide-emerald-100 text-[11px] text-emerald-800">
                    {parsedPreview.stations.slice(0, 5).map((st) => (
                      <div key={st.station_code} className="py-1 flex justify-between">
                        <span><strong>{st.station_code}</strong>: {st.station_name}</span>
                        <span className="font-mono">{st.region} ({st.city || 'N/A'})</span>
                      </div>
                    ))}
                    {parsedPreview.stations.length > 5 && (
                      <div className="pt-1 text-center text-emerald-600 font-medium">
                        ... and {parsedPreview.stations.length - 5} more stations
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!parsedPreview || parsedPreview.stations.length === 0}
                  onClick={handleConfirmBulkUpload}
                  className="px-5 py-2 text-xs font-bold text-white bg-[#001489] hover:bg-[#08209e] rounded-xl shadow-md transition disabled:opacity-40 cursor-pointer"
                >
                  Import &amp; Synchronize Mappings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
