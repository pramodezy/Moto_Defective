import React, { useState, useRef } from 'react';
import { 
  FileSpreadsheet, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  Download, 
  Layers, 
  RefreshCw, 
  MapPin, 
  Sparkles,
  FileCheck,
  Database,
  CloudUpload,
  CloudDownload
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { UserProfile, IngestionResult } from '../../types/crm';
import { parseDefectiveReportFile } from '../../services/defectiveReportIngestor';
import { parseRegionMappingFile, generateSampleRegionTemplateCSV } from '../../services/regionMappingIngestor';
import { crmDb } from '../../lib/db';
import { isSupabaseConfigured } from '../../lib/supabase';
import { checkSupabaseStatus, pushUploadedDataToSupabase, SupabaseSyncStatus } from '../../services/supabaseSync';

interface IngestionHubProps {
  user: UserProfile;
}

export const IngestionHub: React.FC<IngestionHubProps> = ({ user }) => {
  // Defective report state
  const [isProcessingReport, setIsProcessingReport] = useState(false);
  const [reportResult, setReportResult] = useState<IngestionResult | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Region mapping state
  const [isProcessingRegion, setIsProcessingRegion] = useState(false);
  const [regionResult, setRegionResult] = useState<{ inserted: number; updated: number; stationsAffected: number } | null>(null);
  const [regionError, setRegionError] = useState<string | null>(null);
  const regionInputRef = useRef<HTMLInputElement>(null);

  // Supabase sync state
  const [supabaseStatus, setSupabaseStatus] = useState<SupabaseSyncStatus | null>(null);
  const [isSyncingSupabase, setIsSyncingSupabase] = useState(false);
  const [syncProgress, setSyncProgress] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null);

  const refreshSupabase = async () => {
    if (isSupabaseConfigured) {
      const status = await checkSupabaseStatus();
      setSupabaseStatus(status);
    }
  };

  React.useEffect(() => {
    refreshSupabase();
  }, []);

  // Ingest all uploaded data to Supabase
  const handleIngestAllToSupabase = async () => {
    setIsSyncingSupabase(true);
    setSyncProgress('Preparing uploaded data to push to Supabase Cloud...');
    setSyncResult(null);

    try {
      const orders = crmDb.getShippingOrders();
      const items = crmDb.getDefectiveItems();
      const stations = crmDb.getStations();

      const res = await pushUploadedDataToSupabase(orders, items, stations, (msg) => {
        setSyncProgress(msg);
      });

      setSyncResult({
        success: res.success,
        message: res.message,
      });

      if (res.success) {
        confetti({ particleCount: 70, spread: 70, origin: { y: 0.6 } });
        refreshSupabase();
      }
    } catch (e: any) {
      setSyncResult({ success: false, message: e.message || 'Failed to ingest data to Supabase' });
    } finally {
      setIsSyncingSupabase(false);
      setSyncProgress(null);
    }
  };

  // Handle Defective Report File
  const handleProcessDefectiveFile = async (file: File) => {
    setIsProcessingReport(true);
    setReportError(null);
    setReportResult(null);

    try {
      const parsed = await parseDefectiveReportFile(file);
      const result = crmDb.batchUpsertDefectiveItems(parsed.items, user);
      
      // Auto-ingest directly to Supabase cloud if configured
      let cloudFeedback = '';
      if (isSupabaseConfigured) {
        setSyncProgress('Ingesting uploaded rows directly into Supabase Cloud PostgreSQL...');
        const ordersToPush = crmDb.getShippingOrders().filter((o) => 
          parsed.items.some((i) => i.shipping_order_code === o.so_code)
        );
        const itemsToPush = crmDb.getDefectiveItems().filter((it) => 
          parsed.items.some((i) => i.shipping_order_code === it.shipping_order_code)
        );
        const pushRes = await pushUploadedDataToSupabase(
          ordersToPush,
          itemsToPush,
          crmDb.getStations(),
          (msg) => setSyncProgress(msg)
        );
        if (pushRes.success) {
          cloudFeedback = ` | Direct Cloud Push: ${pushRes.ordersCount} SOs, ${pushRes.itemsCount} Items Ingested to Supabase!`;
          refreshSupabase();
        } else {
          cloudFeedback = ` | Local store updated, but Supabase reported: ${pushRes.message}`;
        }
      }

      setReportResult(result);
      if (cloudFeedback) {
        setSyncResult({
          success: true,
          message: `Defective Report Processed: ${result.inserted} new, ${result.updated} updated.` + cloudFeedback,
        });
      }
      confetti({ particleCount: 60, spread: 60, origin: { y: 0.7 } });
    } catch (err: any) {
      setReportError(err.message || 'Failed to process defective report file');
    } finally {
      setIsProcessingReport(false);
      setSyncProgress(null);
    }
  };

  // Handle Region Mapping File
  const handleProcessRegionFile = async (file: File) => {
    setIsProcessingRegion(true);
    setRegionError(null);
    setRegionResult(null);

    try {
      const parsed = await parseRegionMappingFile(file);
      const result = crmDb.batchUpsertStations(parsed.stations, user);

      let cloudFeedback = '';
      if (isSupabaseConfigured) {
        setSyncProgress('Ingesting stations directly into Supabase cci_master...');
        const pushRes = await pushUploadedDataToSupabase(
          [],
          [],
          crmDb.getStations(),
          (msg) => setSyncProgress(msg)
        );
        if (pushRes.success) {
          cloudFeedback = ` | Ingested ${result.stationsAffected} stations to Supabase cci_master.`;
          refreshSupabase();
        }
      }

      setRegionResult(result);
      if (cloudFeedback) {
        setSyncResult({
          success: true,
          message: `Region Mapping Updated: ${result.inserted} new stations, ${result.updated} updated.` + cloudFeedback,
        });
      }
      confetti({ particleCount: 50, spread: 50, origin: { y: 0.7 } });
    } catch (err: any) {
      setRegionError(err.message || 'Failed to process region mapping file');
    } finally {
      setIsProcessingRegion(false);
      setSyncProgress(null);
    }
  };

  // Download Region Mapping Template
  const handleDownloadTemplate = () => {
    const csv = generateSampleRegionTemplateCSV();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'Motorola_Region_Mapping_Template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSyncAllFromSupabase = async () => {
    setIsSyncingSupabase(true);
    setSyncProgress('Synchronizing live data directly from Supabase tables...');
    setSyncResult(null);

    try {
      const counts = await crmDb.syncAllFromSupabase();
      setSyncResult({
        success: true,
        message: `Synced with Supabase: ${counts.stations} stations, ${counts.orders} shipping orders, ${counts.items} defective items.`,
      });
      confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
      refreshSupabase();
    } catch (e: any) {
      setSyncResult({ success: false, message: e.message || 'Failed to sync with Supabase' });
    } finally {
      setIsSyncingSupabase(false);
      setSyncProgress(null);
    }
  };

  const handleClearLocalCache = async () => {
    if (!window.confirm('Clear all local browser cache and reload live data from Supabase?')) return;
    try {
      ['moto_crm_stations_v1', 'moto_crm_shipping_orders_v1', 'moto_crm_defective_items_v1', 'moto_crm_audit_logs_v1', 'moto_crm_awb_history_v1',
       'moto_crm_stations_v2', 'moto_crm_shipping_orders_v2', 'moto_crm_defective_items_v2', 'moto_crm_audit_logs_v2', 'moto_crm_awb_history_v2'
      ].forEach((k) => localStorage.removeItem(k));
      await crmDb.syncAllFromSupabase();
      refreshSupabase();
      setSyncResult({
        success: true,
        message: 'Browser cache cleared. Live data refreshed from Supabase.',
      });
    } catch (e: any) {
      setSyncResult({ success: false, message: e.message || 'Failed to clear cache' });
    }
  };

  return (
    <div className="space-y-8">
      {/* Overview Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-[#101a35] via-[#122047] to-[#172754] border border-cyan-500/30 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white font-['Outfit']">
                Enterprise File Ingestion & Supabase Cloud
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Dual-status defective master synchronization and dynamic region-to-station mapping
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-mono border flex items-center gap-1.5 ${
              isSupabaseConfigured ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}>
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              {isSupabaseConfigured ? 'Supabase Connected' : 'Enterprise Store'}
            </span>
          </div>
        </div>
      </div>

      {/* Supabase Cloud Connection & Seeder Card */}
      {isSupabaseConfigured && (
        <div className="p-6 rounded-2xl bg-[#0e1730] border border-emerald-500/30 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Supabase Cloud PostgreSQL Database</h3>
                <p className="text-xs text-slate-400">
                  Project: <code className="text-cyan-300 font-mono">rippjixfknqwptbcruux.supabase.co</code> (Live Single Source of Truth)
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleIngestAllToSupabase}
                disabled={isSyncingSupabase}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
                title="Push all uploaded Shipping Orders and Defective Items to Supabase Cloud"
              >
                <CloudUpload className="w-4 h-4" />
                {isSyncingSupabase ? 'Ingesting...' : 'Ingest Uploaded Data to Supabase'}
              </button>

              <button
                type="button"
                onClick={handleSyncAllFromSupabase}
                disabled={isSyncingSupabase}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-cyan-600/80 hover:bg-cyan-500 text-white shadow transition-all cursor-pointer"
                title="Fetch live records directly from Supabase tables"
              >
                <CloudDownload className="w-4 h-4" />
                {isSyncingSupabase ? 'Syncing...' : 'Sync Live Data from Supabase'}
              </button>

              <button
                type="button"
                onClick={handleClearLocalCache}
                disabled={isSyncingSupabase}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 shadow transition-all cursor-pointer"
                title="Clear residual browser localStorage cache"
              >
                <RefreshCw className="w-4 h-4" />
                Clear Local Cache
              </button>
            </div>
          </div>

          {/* Cloud Counts */}
          {supabaseStatus && (
            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="p-3 rounded-xl bg-[#070e20] border border-[#1f2e5a] text-center">
                <span className="text-[11px] text-slate-400">Stations in Cloud</span>
                <div className="text-lg font-bold font-mono text-emerald-400 mt-0.5">
                  {supabaseStatus.stationCount}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[#070e20] border border-[#1f2e5a] text-center">
                <span className="text-[11px] text-slate-400">Shipping Orders in Cloud</span>
                <div className="text-lg font-bold font-mono text-cyan-400 mt-0.5">
                  {supabaseStatus.orderCount}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[#070e20] border border-[#1f2e5a] text-center">
                <span className="text-[11px] text-slate-400">Defective Vault Items</span>
                <div className="text-lg font-bold font-mono text-indigo-400 mt-0.5">
                  {supabaseStatus.itemCount}
                </div>
              </div>
            </div>
          )}

          {isSyncingSupabase && syncProgress && (
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center gap-2 text-xs text-blue-300 animate-pulse">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>{syncProgress}</span>
            </div>
          )}

          {syncResult && (
            <div className={`p-3 rounded-lg text-xs flex items-center gap-2 border ${
              syncResult.success 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
            }`}>
              {syncResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
              )}
              <div>
                <span>{syncResult.message}</span>
                {!syncResult.success && (
                  <p className="mt-1 text-[11px] text-slate-300">
                    Tip: If Supabase reports an RLS violation for the anon key, run the script <code>supabase/migrations/20260914_enable_anon_access.sql</code> in the Supabase SQL Editor.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Engine 1: Defective Report Ingestion */}
        <div className="p-6 rounded-2xl bg-[#101a35] border border-[#1c2b53] flex flex-col justify-between shadow-lg">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-[#1f2e5a]">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <Layers className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-white">1. Motorola Defective Report Sync</h3>
                  <p className="text-[11px] text-slate-400">Updates Defective Master & Recalculates SO SLA</p>
                </div>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono">
                XLSX / CSV
              </span>
            </div>

            <div className="mt-4 text-xs text-slate-300 space-y-2">
              <p>
                Upload regular Motorola Defective Reports (like <code>Dump.xlsx</code>). The engine:
              </p>
              <ul className="list-disc list-inside space-y-1 text-slate-400 text-[11px]">
                <li>Matches composite key: <code className="text-cyan-400">sr_number + sr_part_number + new_part_number</code></li>
                <li>Preserves internal CRM status & unboxing notes while updating external Motorola status</li>
                <li>Automatically computes parent Consignment Declared Value, SLA Age, and E-Way bill threshold</li>
              </ul>
            </div>

            {/* Dropzone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="mt-5 p-8 rounded-xl border-2 border-dashed border-cyan-500/30 hover:border-cyan-500/60 bg-[#0b1329]/60 hover:bg-[#0b1329] transition-all cursor-pointer text-center group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleProcessDefectiveFile(file);
                }}
              />
              <Upload className="w-8 h-8 mx-auto text-cyan-400 group-hover:scale-110 transition-transform mb-2" />
              <p className="text-xs font-semibold text-slate-200">
                Click or drag & drop Motorola Defective Report
              </p>
              <p className="text-[10px] text-slate-400 mt-1">
                Supports Excel (.xlsx, .xls) and CSV files
              </p>
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessingReport}
              className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white shadow-md shadow-cyan-500/20 transition-all cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              {isProcessingReport ? 'Ingesting to Supabase...' : 'Upload Defective Dump & Ingest to Supabase'}
            </button>

            {isProcessingReport && (
              <div className="mt-4 p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center gap-3 text-xs text-blue-300 animate-pulse">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Reading sheet, executing composite key deduplication, and ingesting to Supabase...</span>
              </div>
            )}

            {reportError && (
              <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
                <span>{reportError}</span>
              </div>
            )}

            {reportResult && (
              <div className="mt-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Synchronization Complete!</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs pt-1 font-mono">
                  <div className="p-2 rounded bg-[#0b1329] border border-emerald-500/20">
                    <span className="text-slate-400 text-[10px]">Inserted</span>
                    <div className="text-emerald-400 font-bold text-sm">{reportResult.inserted}</div>
                  </div>
                  <div className="p-2 rounded bg-[#0b1329] border border-emerald-500/20">
                    <span className="text-slate-400 text-[10px]">Updated</span>
                    <div className="text-cyan-400 font-bold text-sm">{reportResult.updated}</div>
                  </div>
                  <div className="p-2 rounded bg-[#0b1329] border border-emerald-500/20">
                    <span className="text-slate-400 text-[10px]">SO Synced</span>
                    <div className="text-indigo-400 font-bold text-sm">{reportResult.shippingOrdersUpdated}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Engine 2: Region Mapping Ingestion */}
        <div className="p-6 rounded-2xl bg-[#101a35] border border-[#1c2b53] flex flex-col justify-between shadow-lg">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-[#1f2e5a]">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20">
                  <MapPin className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-white">2. Region Mapping & Station Ingestion</h3>
                  <p className="text-[11px] text-slate-400">Assigns Regions & Generates Dynamic CCI Users</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-[#1a274c] hover:bg-[#233566] text-cyan-300 border border-cyan-500/30 transition-colors"
              >
                <Download className="w-3 h-3" />
                Template CSV
              </button>
            </div>

            <div className="mt-4 text-xs text-slate-300 space-y-2">
              <p>
                Upload station-to-region mapping file. The engine:
              </p>
              <ul className="list-disc list-inside space-y-1 text-slate-400 text-[11px]">
                <li>Generates dynamic username: <code className="text-teal-400">cci_{'{station_code}'}</code> (e.g. <code>cci_65</code>)</li>
                <li>Populates regional classification (North, South, East, West, Central)</li>
                <li>Cascades region inheritance down to all defective items and shipping orders</li>
              </ul>
            </div>

            {/* Dropzone */}
            <div
              onClick={() => regionInputRef.current?.click()}
              className="mt-5 p-8 rounded-xl border-2 border-dashed border-teal-500/30 hover:border-teal-500/60 bg-[#0b1329]/60 hover:bg-[#0b1329] transition-all cursor-pointer text-center group"
            >
              <input
                ref={regionInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleProcessRegionFile(file);
                }}
              />
              <Upload className="w-8 h-8 mx-auto text-teal-400 group-hover:scale-110 transition-transform mb-2" />
              <p className="text-xs font-semibold text-slate-200">
                Click or drag & drop Region Mapping File
              </p>
              <p className="text-[10px] text-slate-400 mt-1">
                CSV or Excel with Station Code, Name, Region, State, City
              </p>
            </div>

            <button
              type="button"
              onClick={() => regionInputRef.current?.click()}
              disabled={isProcessingRegion}
              className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white shadow-md shadow-teal-500/20 transition-all cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              {isProcessingRegion ? 'Ingesting Stations...' : 'Upload Region Mapping & Ingest to Supabase'}
            </button>

            {isProcessingRegion && (
              <div className="mt-4 p-4 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center gap-3 text-xs text-teal-300 animate-pulse">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Parsing region definitions and updating station master...</span>
              </div>
            )}

            {regionError && (
              <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
                <span>{regionError}</span>
              </div>
            )}

            {regionResult && (
              <div className="mt-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Region Mapping Updated!</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs pt-1 font-mono">
                  <div className="p-2 rounded bg-[#0b1329] border border-emerald-500/20">
                    <span className="text-slate-400 text-[10px]">New Stations</span>
                    <div className="text-teal-400 font-bold text-sm">{regionResult.inserted}</div>
                  </div>
                  <div className="p-2 rounded bg-[#0b1329] border border-emerald-500/20">
                    <span className="text-slate-400 text-[10px]">Updated</span>
                    <div className="text-cyan-400 font-bold text-sm">{regionResult.updated}</div>
                  </div>
                  <div className="p-2 rounded bg-[#0b1329] border border-emerald-500/20">
                    <span className="text-slate-400 text-[10px]">Total Synced</span>
                    <div className="text-emerald-400 font-bold text-sm">{regionResult.stationsAffected}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
