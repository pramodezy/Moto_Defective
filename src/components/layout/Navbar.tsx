import React from 'react';
import { 
  ShieldCheck, 
  Warehouse, 
  Store, 
  Database, 
  RefreshCw, 
  Layers, 
  PackageCheck, 
  FileSpreadsheet, 
  History, 
  Truck,
  Sparkles,
  Search,
  LogOut,
  Upload
} from 'lucide-react';
import { UserRole, CCIMaster, UserProfile } from '../../types/crm';
import { isSupabaseConfigured } from '../../lib/supabase';

interface NavbarProps {
  currentUser: UserProfile;
  onLogout: () => void;
  currentRole: UserRole;
  onRoleChange: (role: UserRole) => void;
  currentStation: string;
  onStationChange: (stationCode: string) => void;
  stations: CCIMaster[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  searchTerm: string;
  onSearchChange: (q: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  onLogout,
  currentRole,
  onRoleChange,
  currentStation,
  onStationChange,
  stations,
  activeTab,
  onTabChange,
  searchTerm,
  onSearchChange,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-[#0b1329]/95 backdrop-blur-md border-b border-[#1f2e5a]">
      {/* Top tier brand and user identity */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Portal Branding */}
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/30 border border-cyan-500/40 shadow-sm shadow-cyan-500/10">
              <span className="font-extrabold text-cyan-400 text-lg tracking-wider font-['Outfit']">M</span>
              <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-cyan-400 rounded-full animate-ping" />
              <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-cyan-400 rounded-full" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-white text-lg tracking-tight font-['Outfit']">
                  motorola <span className="text-cyan-400 font-light font-sans text-sm tracking-normal">RETURNS CRM</span>
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono border border-blue-500/30">
                  v2.4
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">Reverse Supply Chain & Logistics Inward Engine</p>
            </div>
          </div>

          {/* Quick Search Bar */}
          <div className="hidden md:flex items-center flex-1 max-w-xs mx-6">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search SO, SR No, AWB..."
                className="w-full bg-[#101a35] border border-[#1c2b53] rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>
          </div>

          {/* Right Controls: Role Selector & System Status */}
          <div className="flex items-center gap-3">
            {/* Database mode pill */}
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono border bg-[#101a35] border-[#1c2b53] text-slate-300">
              <Database className="w-3.5 h-3.5 text-cyan-400" />
              <span>{isSupabaseConfigured ? 'Supabase Live' : 'Enterprise Store'}</span>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
            </div>

            {/* Role Badging & RBAC: Strictly scoped to authenticated profile */}
            {currentUser.role === 'CCI' && (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm">
                  <Store className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Station {currentUser.station_code || currentStation}</span>
                </span>
              </div>
            )}

            {currentUser.role === 'CWH' && (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-sm">
                  <Warehouse className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Central Warehouse (CWH)</span>
                </span>
              </div>
            )}

            {currentUser.role === 'ADMIN' && (
              <div className="flex items-center gap-1.5 bg-[#070e20] p-1 rounded-xl border border-[#1c2b53]">
                <button
                  onClick={() => onRoleChange('ADMIN')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    currentRole === 'ADMIN'
                      ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Admin Dashboard"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Admin Mode</span>
                </button>
                <button
                  onClick={() => onRoleChange('CWH')}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    currentRole === 'CWH'
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Simulate CWH View"
                >
                  <span>CWH View</span>
                </button>
                <button
                  onClick={() => onRoleChange('CCI')}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    currentRole === 'CCI'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Simulate CCI View"
                >
                  <span>CCI View</span>
                </button>
              </div>
            )}

            {currentUser.role === 'ADMIN' && (
              <button
                onClick={() => onTabChange('ingestion')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                  activeTab === 'ingestion'
                    ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white border-cyan-400 shadow-md shadow-cyan-500/20'
                    : 'bg-[#070e20] hover:bg-[#101a35] text-cyan-300 border-cyan-500/30'
                }`}
                title="Upload Defective Report & Ingest to Supabase"
              >
                <Upload className="w-3.5 h-3.5 text-cyan-300" />
                <span className="hidden sm:inline">Upload & Ingest</span>
              </button>
            )}


            {/* User Session & Logout */}
            <div className="flex items-center gap-2 pl-2 border-l border-[#1f2e5a]">
              <div className="hidden sm:block text-right">
                <div className="text-xs font-semibold text-white truncate max-w-[120px]">
                  {currentUser.username}
                </div>
                <div className="text-[10px] text-cyan-400 font-mono">
                  {currentUser.role}
                </div>
              </div>

              <button
                onClick={onLogout}
                title="Sign Out / Switch Account"
                className="flex items-center gap-1 p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/30 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Navigation Tabs based on role */}
        <div className="flex items-center gap-1 overflow-x-auto py-2 border-t border-[#1f2e5a]/60 text-xs">
          {currentRole === 'ADMIN' && (
            <>
              <button
                onClick={() => onTabChange('dashboard')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                  activeTab === 'dashboard'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Executive KPIs
              </button>

              <button
                onClick={() => onTabChange('orders')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                  activeTab === 'orders'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Truck className="w-3.5 h-3.5" />
                Shipping Orders
              </button>

              <button
                onClick={() => onTabChange('vault')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                  activeTab === 'vault'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Defective Master Vault
              </button>

              <button
                onClick={() => onTabChange('ingestion')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                  activeTab === 'ingestion'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Ingestion Engine (Excel / CSV)
              </button>

              <button
                onClick={() => onTabChange('cci_master')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                  activeTab === 'cci_master'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Store className="w-3.5 h-3.5" />
                CCI Stations & Regions
              </button>

              <button
                onClick={() => onTabChange('audit')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                  activeTab === 'audit'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                System Audit Trail
              </button>
            </>
          )}

          {currentRole === 'CWH' && (
            <>
              <button
                onClick={() => onTabChange('cwh_inward')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                  activeTab === 'cwh_inward'
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <PackageCheck className="w-3.5 h-3.5" />
                Inward & CCTV Verification Station
              </button>

              <button
                onClick={() => onTabChange('orders')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                  activeTab === 'orders'
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Truck className="w-3.5 h-3.5" />
                Consignment Queue & AWB Retokening
              </button>

              <button
                onClick={() => onTabChange('vault')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                  activeTab === 'vault'
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Inspection Screening Vault
              </button>

              <button
                onClick={() => onTabChange('audit')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                  activeTab === 'audit'
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                Unboxing & Dispatch Logs
              </button>
            </>
          )}

          {currentRole === 'CCI' && (
            <>
              <button
                onClick={() => onTabChange('cci_consignments')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                  activeTab === 'cci_consignments'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Truck className="w-3.5 h-3.5" />
                My Station Consignments (SO)
              </button>

              <button
                onClick={() => onTabChange('cci_items')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                  activeTab === 'cci_items'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Station Defective Items Vault
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
