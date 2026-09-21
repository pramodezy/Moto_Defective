import React, { useState } from 'react';
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
  Archive
} from 'lucide-react';
import { UserRole, CCIMaster, UserProfile } from '../../types/crm';
import { isSupabaseConfigured } from '../../lib/supabase';
import { crmDb } from '../../lib/db';
import { toast } from 'sonner';

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
  isCompletedSessionLoaded?: boolean;
  isCompletedSessionLoading?: boolean;
  completedOrdersCount?: number;
  onLoadCompletedSession?: () => void;
  onUnloadCompletedSession?: () => void;
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
  isCompletedSessionLoaded,
  isCompletedSessionLoading,
  completedOrdersCount = 1375,
  onLoadCompletedSession,
  onUnloadCompletedSession,
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const currentStationObj = stations?.find(
    (s) => s.station_code === (currentUser.station_code || currentStation)
  );

  const handleQuickSync = async () => {
    setIsSyncing(true);
    try {
      const count = await crmDb.syncShippingOrdersQuickly();
      toast.success(`Synchronized ${count} active consignments live from cloud.`);
    } catch {
      toast.error('Sync failed. Please check internet connection.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-gradient-to-r from-[#001489] via-[#08209e] to-[#001489] text-white shadow-md border-b border-blue-900/40">
      {/* Top tier brand and user identity */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Portal Branding */}
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-white/10 border border-white/20 shadow-inner">
              <span className="font-extrabold text-white text-lg tracking-wider font-['Outfit']">M</span>
              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-sky-300 rounded-full" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-white text-lg tracking-tight font-['Outfit']">
                  motorola <span className="text-sky-300 font-light font-sans text-sm tracking-normal">RETURNS CRM</span>
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/15 text-white font-mono border border-white/20" title="Motorola CRM Build v2.5.2">
                  v2.5.2
                </span>
              </div>
              <p className="text-xs text-blue-100/80 hidden sm:block">Reverse Supply Chain & Logistics Inward Engine</p>
            </div>
          </div>

          {/* Right Controls: Role Selector & System Status */}
          <div className="flex items-center gap-3">
            {/* Database mode pill & Quick Sync Button */}
            <button
              type="button"
              onClick={handleQuickSync}
              disabled={isSyncing}
              title="Click to instantly re-sync live updates from other users & cloud"
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono border bg-white/10 hover:bg-white/20 border-white/20 text-blue-100 transition-all cursor-pointer shadow-2xs disabled:opacity-60"
            >
              <RefreshCw className={`w-3 h-3 text-sky-300 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : isSupabaseConfigured ? 'Live Cloud' : 'Local Store'}</span>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
            </button>

            {/* Role Badging */}
            {currentUser.role === 'CCI' && (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 shadow-xs" title={`Station ${currentUser.station_code || currentStation}: ${currentStationObj?.station_name || ''}`}>
                  <Store className="w-3.5 h-3.5 text-emerald-300" />
                  <span>
                    Station {currentUser.station_code || currentStation}
                    {currentStationObj?.station_name ? ` • ${currentStationObj.station_name}` : ''}
                  </span>
                </span>
              </div>
            )}

            {currentUser.role === 'CWH' && (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/15 text-white border border-white/25 shadow-xs">
                  <Warehouse className="w-3.5 h-3.5 text-sky-200" />
                  <span>Central Warehouse (CWH)</span>
                </span>
              </div>
            )}

            {currentUser.role === 'ADMIN' && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/15 text-white border border-white/25 shadow-xs">
                <ShieldCheck className="w-3.5 h-3.5 text-sky-300" />
                <span>Admin Portal</span>
              </span>
            )}

            {/* Admin-only Link Button: Load Completed Journey (RC Received ASP) for Active Session */}
            {currentUser.role === 'ADMIN' && onLoadCompletedSession && (
              !isCompletedSessionLoaded ? (
                <button
                  onClick={onLoadCompletedSession}
                  disabled={isCompletedSessionLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border bg-amber-400/20 hover:bg-amber-400/30 text-amber-200 border-amber-300/40 shadow-xs cursor-pointer disabled:opacity-50"
                  title="Fetch archived completed shipping orders (RC Received ASP) from Supabase for this session"
                >
                  {isCompletedSessionLoading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 text-amber-300 animate-spin" />
                      <span className="hidden md:inline">Fetching Completed...</span>
                    </>
                  ) : (
                    <>
                      <Archive className="w-3.5 h-3.5 text-amber-300" />
                      <span className="hidden md:inline">Fetch Completed Journey</span>
                      <span className="md:hidden">Completed ({completedOrdersCount})</span>
                    </>
                  )}
                </button>
              ) : (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border bg-emerald-500/20 text-emerald-200 border-emerald-400/30">
                  <PackageCheck className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                  <span className="hidden md:inline">Completed Journey Loaded ({completedOrdersCount})</span>
                  <span className="md:hidden">Loaded ({completedOrdersCount})</span>
                  {onUnloadCompletedSession && (
                    <button
                      onClick={onUnloadCompletedSession}
                      className="ml-1 text-[10px] text-blue-100 hover:text-white underline cursor-pointer font-normal"
                      title="Unload completed orders and revert to active pipeline"
                    >
                      Unload
                    </button>
                  )}
                </div>
              )
            )}

            {/* User Session & Logout */}
            <div className="flex items-center gap-2 pl-2 border-l border-white/20">
              <div className="hidden sm:block text-right">
                <div className="text-xs font-semibold text-white truncate max-w-[120px]">
                  {currentUser.username}
                </div>
                <div className="text-[10px] text-blue-200 font-mono">
                  {currentUser.role}
                </div>
              </div>

              <button
                onClick={onLogout}
                title="Sign Out / Switch Account"
                className="flex items-center gap-1 p-1.5 rounded-lg text-blue-200 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/20 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Navigation Tabs based on role */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-2.5 border-t border-white/15 text-xs">
          {currentRole === 'ADMIN' && (
            <>
              <button
                onClick={() => onTabChange('dashboard')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  activeTab === 'dashboard'
                    ? 'bg-white text-[#001489] shadow-sm font-semibold'
                    : 'text-blue-100 hover:text-white hover:bg-white/10'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Executive KPIs
              </button>

              <button
                onClick={() => onTabChange('orders')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  activeTab === 'orders'
                    ? 'bg-white text-[#001489] shadow-sm font-semibold'
                    : 'text-blue-100 hover:text-white hover:bg-white/10'
                }`}
              >
                <Truck className="w-3.5 h-3.5" />
                Shipping Orders
              </button>

              <button
                onClick={() => onTabChange('vault')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  activeTab === 'vault'
                    ? 'bg-white text-[#001489] shadow-sm font-semibold'
                    : 'text-blue-100 hover:text-white hover:bg-white/10'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Defective Master Vault
              </button>

              <button
                onClick={() => onTabChange('ingestion')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  activeTab === 'ingestion'
                    ? 'bg-white text-[#001489] shadow-sm font-semibold'
                    : 'text-blue-100 hover:text-white hover:bg-white/10'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Ingestion Engine (Excel / CSV)
              </button>

              <button
                onClick={() => onTabChange('cci_master')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  activeTab === 'cci_master'
                    ? 'bg-white text-[#001489] shadow-sm font-semibold'
                    : 'text-blue-100 hover:text-white hover:bg-white/10'
                }`}
              >
                <Store className="w-3.5 h-3.5" />
                CCI Stations & Regions
              </button>

              <button
                onClick={() => onTabChange('audit')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  activeTab === 'audit'
                    ? 'bg-white text-[#001489] shadow-sm font-semibold'
                    : 'text-blue-100 hover:text-white hover:bg-white/10'
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
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  activeTab === 'cwh_inward'
                    ? 'bg-white text-[#001489] shadow-sm font-semibold'
                    : 'text-blue-100 hover:text-white hover:bg-white/10'
                }`}
              >
                <PackageCheck className="w-3.5 h-3.5" />
                Inward & CCTV Verification Station
              </button>

              <button
                onClick={() => onTabChange('orders')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  activeTab === 'orders'
                    ? 'bg-white text-[#001489] shadow-sm font-semibold'
                    : 'text-blue-100 hover:text-white hover:bg-white/10'
                }`}
              >
                <Truck className="w-3.5 h-3.5" />
                Consignment Queue & AWB Retokening
              </button>

              <button
                onClick={() => onTabChange('vault')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  activeTab === 'vault'
                    ? 'bg-white text-[#001489] shadow-sm font-semibold'
                    : 'text-blue-100 hover:text-white hover:bg-white/10'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Inspection Screening Vault
              </button>

              <button
                onClick={() => onTabChange('audit')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  activeTab === 'audit'
                    ? 'bg-white text-[#001489] shadow-sm font-semibold'
                    : 'text-blue-100 hover:text-white hover:bg-white/10'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                Unboxing & Dispatch Logs
              </button>

              <button
                onClick={() => onTabChange('cwh_reports')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  activeTab === 'cwh_reports'
                    ? 'bg-white text-[#001489] shadow-sm font-semibold'
                    : 'text-blue-100 hover:text-white hover:bg-white/10'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Reports & MIS
              </button>
            </>
          )}

          {currentRole === 'CCI' && (
            <>
              <button
                onClick={() => onTabChange('cci_consignments')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  activeTab === 'cci_consignments'
                    ? 'bg-white text-[#001489] shadow-sm font-semibold'
                    : 'text-blue-100 hover:text-white hover:bg-white/10'
                }`}
              >
                <Truck className="w-3.5 h-3.5" />
                My Station Consignments (SO)
              </button>

              <button
                onClick={() => onTabChange('cci_items')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  activeTab === 'cci_items'
                    ? 'bg-white text-[#001489] shadow-sm font-semibold'
                    : 'text-blue-100 hover:text-white hover:bg-white/10'
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
