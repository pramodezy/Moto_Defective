import React, { useState, useMemo } from 'react';
import { 
  Store, 
  Search, 
  MapPin, 
  User, 
  Phone, 
  CheckCircle2, 
  XCircle,
  Download,
  Filter
} from 'lucide-react';
import { CCIMaster } from '../../types/crm';
import { generateSampleRegionTemplateCSV } from '../../services/regionMappingIngestor';

interface CciDirectoryProps {
  stations: CCIMaster[];
  onSelectStation?: (stationCode: string) => void;
}

export const CciDirectory: React.FC<CciDirectoryProps> = ({ stations, onSelectStation }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('ALL');

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
        const matchUser = (st.username || '').toLowerCase().includes(q);
        if (!matchCode && !matchName && !matchCity && !matchUser) return false;
      }
      return true;
    });
  }, [stations, selectedRegion, searchTerm]);

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl bg-[#101a35] border border-[#1c2b53]">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search station code, username (e.g. cci_65), name..."
            className="w-full bg-[#0b1329] border border-[#1f2e5a] rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
            className="bg-[#0b1329] border border-[#1f2e5a] text-slate-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Regions</option>
            <option value="North">North</option>
            <option value="South">South</option>
            <option value="East">East</option>
            <option value="West">West</option>
            <option value="Central">Central</option>
          </select>

          <span className="text-xs text-slate-400 font-mono">
            {filteredStations.length} of {stations.length} stations
          </span>
        </div>
      </div>

      {/* Stations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredStations.map((st) => (
          <div
            key={st.station_code}
            className="p-4 rounded-xl border border-[#1c2b53] bg-[#101a35] hover:border-cyan-500/40 transition-colors flex flex-col justify-between shadow"
          >
            <div>
              {/* Station Code & Dynamic Username */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-white">
                      Station {st.station_code}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                      @{st.username || `cci_${st.station_code}`}
                    </span>
                  </div>
                  <h4 className="text-xs font-semibold text-slate-300 mt-1" title={st.station_name}>
                    {st.station_name}
                  </h4>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 border border-slate-700 text-slate-300">
                  {st.region}
                </span>
              </div>

              {/* Location & Details */}
              <div className="mt-3 space-y-1.5 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                  <span>
                    {st.city ? `${st.city}, ` : ''}{st.state || 'India'}
                  </span>
                </div>
                {st.contact_person && (
                  <div className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                    <span className="text-slate-300">{st.contact_person}</span>
                  </div>
                )}
                {st.contact_phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                    <span className="font-mono text-slate-300">{st.contact_phone}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom active pill */}
            <div className="mt-4 pt-2.5 border-t border-[#1c2b53] flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-emerald-400 text-[11px]">
                <CheckCircle2 className="w-3 h-3" />
                Active Node
              </span>
              {onSelectStation && (
                <button
                  onClick={() => onSelectStation(st.station_code)}
                  className="text-xs text-cyan-400 hover:underline"
                >
                  View as CCI →
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
