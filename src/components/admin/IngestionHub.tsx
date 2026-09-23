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
import { parseShippingOrderFile } from '../../services/shippingOrderIngestor';
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

  // Shipping Order & DC Ingestion state
  const [isProcessingShippingOrder, setIsProcessingShippingOrder] = useState(false);
  const [shippingOrderResult, setShippingOrderResult] = useState<{
    totalRows: number;
    updatedItemsCount: number;
    updatedOrdersCount: number;
    skippedNotReturnCount: number;
    unmatchedRowsCount: number;
  } | null>(null);
  const [shippingOrderError, setShippingOrderError] = useState<string | null>(null);
  const shippingOrderInputRef = useRef<HTMLInputElement>(null);

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
          (msg) => setSyncProgress(msg),
          result.deletedCompositeKeys || [],
          result.deletedSoCodes || []
        );
        if (pushRes.success) {
          const promoMsg = result.promotedCount ? ` Auto-promoted ${result.promotedCount} parts from pending to official SOs.` : '';
          cloudFeedback = ` | Direct Cloud Push: ${pushRes.ordersCount} SOs, ${pushRes.itemsCount} Items Ingested to Supabase!${promoMsg}`;
          await crmDb.syncAllFromSupabase();
          refreshSupabase();
        } else {
          cloudFeedback = ` | Local store updated, but Supabase reported: ${pushRes.message}`;
        }
      }

      setReportResult(result);
      if (cloudFeedback) {
        const promoMsg = result.promotedCount ? ` Auto-promoted ${result.promotedCount} parts to official SOs.` : '';
        setSyncResult({
          success: true,
          message: `Defective Report Processed: ${result.inserted} new, ${result.updated} updated.${promoMsg}` + cloudFeedback,
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

  // Handle Shipping Order Master & Delivery Challan File
  const handleProcessShippingOrderFile = async (file: File) => {
    setIsProcessingShippingOrder(true);
    setShippingOrderError(null);
    setShippingOrderResult(null);

    try {
      const parsed = await parseShippingOrderFile(file);
      const result = await crmDb.batchUpdateFromShippingOrderFile(parsed.rows, user);
      setShippingOrderResult(result);
      setSyncResult({
        success: true,
        message: `Shipping Order & DC Ingestion Complete! Updated ${result.updatedItemsCount} parts across ${result.updatedOrdersCount} Shipping Orders. Preserved ${result.skippedNotReturnCount} 'Not Return' parts.`,
      });
      confetti({ particleCount: 70, spread: 70, origin: { y: 0.7 } });
      refreshSupabase();
    } catch (err: any) {
      setShippingOrderError(err.message || 'Failed to process shipping order file');
    } finally {
      setIsProcessingShippingOrder(false);
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
      crmDb.clearAllLocalData();
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
      <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-50 text-[#001489] border border-sky-200">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 font-['Outfit']">
                Enterprise File Ingestion &amp; Supabase Cloud
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Dual-status defective master synchronization and dynamic region-to-station mapping
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-mono border flex items-center gap-1.5 ${
              isSupabaseConfigured ? 'bg-emerald-50 text-emerald-800 border-emerald-300 font-medium' : 'bg-slate-100 text-slate-600 border-slate-300'
            }`}>
              <Database className="w-3.5 h-3.5 text-emerald-600" />
              {isSupabaseConfigured ? 'Supabase Connected' : 'Enterprise Store'}
            </span>
          </div>
        </div>
      </div>

      {/* Supabase Cloud Connection & Seeder Card */}
      {isSupabaseConfigured && (
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Supabase Cloud PostgreSQL Database</h3>
                <p className="text-xs text-slate-500">
                  Project: <code className="text-[#001489] font-mono">rippjixfknqwptbcruux.supabase.co</code> (Live Single Source of Truth)
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleIngestAllToSupabase}
                disabled={isSyncingSupabase}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors cursor-pointer"
                title="Push all uploaded Shipping Orders and Defective Items to Supabase Cloud"
              >
                <CloudUpload className="w-4 h-4" />
                {isSyncingSupabase ? 'Ingesting...' : 'Ingest Uploaded Data to Supabase'}
              </button>

              <button
                type="button"
                onClick={handleSyncAllFromSupabase}
                disabled={isSyncingSupabase}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#001489] hover:bg-[#08209e] text-white shadow-xs transition-colors cursor-pointer"
                title="Fetch live records directly from Supabase tables"
              >
                <CloudDownload className="w-4 h-4" />
                {isSyncingSupabase ? 'Syncing...' : 'Sync Live Data from Supabase'}
              </button>

              <button
                type="button"
                onClick={handleClearLocalCache}
                disabled={isSyncingSupabase}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 shadow-xs transition-colors cursor-pointer"
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
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-center">
                <span className="text-[11px] text-slate-500">Stations in Cloud</span>
                <div className="text-lg font-bold font-mono text-emerald-700 mt-0.5">
                  {supabaseStatus.stationCount}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-center">
                <span className="text-[11px] text-slate-500">Shipping Orders in Cloud</span>
                <div className="text-lg font-bold font-mono text-sky-800 mt-0.5">
                  {supabaseStatus.orderCount}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-center">
                <span className="text-[11px] text-slate-500">Defective Vault Items</span>
                <div className="text-lg font-bold font-mono text-slate-900 mt-0.5">
                  {supabaseStatus.itemCount}
                </div>
              </div>
            </div>
          )}

          {isSyncingSupabase && syncProgress && (
            <div className="p-3 rounded-lg bg-sky-50 border border-sky-200 flex items-center gap-2 text-xs text-sky-800">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>{syncProgress}</span>
            </div>
          )}

          {syncResult && (
            <div className={`p-3 rounded-lg text-xs flex items-center gap-2 border ${
              syncResult.success 
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800' 
                : 'bg-amber-50 border-amber-300 text-amber-900'
            }`}>
              {syncResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-700 flex-shrink-0" />
              )}
              <div>
                <span>{syncResult.message}</span>
                {!syncResult.success && (
                  <p className="mt-1 text-[11px] text-slate-600">
                    Tip: If Supabase reports an RLS violation for the anon key, run the script <code>supabase/migrations/20260914_enable_anon_access.sql</code> in the Supabase SQL Editor.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Engine 1: Defective Report Ingestion */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200 flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-lg bg-sky-50 text-[#001489] border border-sky-200">
                  <Layers className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">1. Motorola Defective Report Sync</h3>
                  <p className="text-[11px] text-slate-500">Updates Defective Master &amp; Recalculates SO SLA</p>
                </div>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-sky-50 text-[#001489] font-mono border border-sky-200 font-semibold">
                XLSX / CSV
              </span>
            </div>

            <div className="mt-4 text-xs text-slate-700 space-y-2">
              <p>
                Upload regular Motorola Defective Reports (like <code>Dump.xlsx</code>). The engine:
              </p>
              <ul className="list-disc list-inside space-y-1 text-slate-500 text-[11px]">
                <li>Matches composite key: <code className="text-[#001489]">sr_number + sr_part_number + new_part_number</code></li>
                <li>Preserves internal CRM status &amp; unboxing notes while updating external Motorola status</li>
                <li>Automatically computes parent Consignment Declared Value, SLA Age, and E-Way bill threshold</li>
              </ul>
            </div>

            {/* Dropzone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="mt-5 p-8 rounded-xl border-2 border-dashed border-slate-300 hover:border-[#001489] bg-slate-50/70 hover:bg-slate-50 transition-all cursor-pointer text-center group"
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
              <Upload className="w-8 h-8 mx-auto text-[#001489] group-hover:scale-110 transition-transform mb-2" />
              <p className="text-xs font-semibold text-slate-800">
                Click or drag &amp; drop Motorola Defective Report
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                Supports Excel (.xlsx, .xls) and CSV files
              </p>
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessingReport}
              className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-[#001489] hover:bg-[#08209e] text-white shadow-xs transition-colors cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              {isProcessingReport ? 'Ingesting to Supabase...' : 'Upload Defective Dump & Ingest to Supabase'}
            </button>

            {isProcessingReport && (
              <div className="mt-4 p-4 rounded-xl bg-sky-50 border border-sky-200 flex items-center gap-3 text-xs text-sky-800">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Reading sheet, executing composite key deduplication, and ingesting to Supabase...</span>
              </div>
            )}

            {reportError && (
              <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
                <span>{reportError}</span>
              </div>
            )}

            {reportResult && (
              <div className="mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Synchronization Complete!</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs pt-1 font-mono">
                  <div className="p-2 rounded bg-white border border-emerald-200">
                    <span className="text-slate-500 text-[10px]">Inserted</span>
                    <div className="text-emerald-700 font-bold text-sm">{reportResult.inserted}</div>
                  </div>
                  <div className="p-2 rounded bg-white border border-emerald-200">
                    <span className="text-slate-500 text-[10px]">Updated</span>
                    <div className="text-sky-800 font-bold text-sm">{reportResult.updated}</div>
                  </div>
                  <div className="p-2 rounded bg-white border border-emerald-200">
                    <span className="text-slate-500 text-[10px]">SO Synced</span>
                    <div className="text-slate-900 font-bold text-sm">{reportResult.shippingOrdersUpdated}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Engine 2: Region Mapping Ingestion */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200 flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-lg bg-teal-50 text-teal-800 border border-teal-200">
                  <MapPin className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">2. Region Mapping &amp; Station Ingestion</h3>
                  <p className="text-[11px] text-slate-500">Assigns Regions &amp; Generates Dynamic CCI Users</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 transition-colors shadow-xs"
              >
                <Download className="w-3 h-3 text-slate-500" />
                Template CSV
              </button>
            </div>

            <div className="mt-4 text-xs text-slate-700 space-y-2">
              <p>
                Upload station-to-region mapping file. The engine:
              </p>
              <ul className="list-disc list-inside space-y-1 text-slate-500 text-[11px]">
                <li>Generates dynamic username: <code className="text-teal-700">cci_{'{station_code}'}</code> (e.g. <code>cci_65</code>)</li>
                <li>Populates regional classification (North, South, East, West, Central)</li>
                <li>Cascades region inheritance down to all defective items and shipping orders</li>
              </ul>
            </div>

            {/* Dropzone */}
            <div
              onClick={() => regionInputRef.current?.click()}
              className="mt-5 p-8 rounded-xl border-2 border-dashed border-slate-300 hover:border-[#001489] bg-slate-50/70 hover:bg-slate-50 transition-all cursor-pointer text-center group"
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
              <Upload className="w-8 h-8 mx-auto text-teal-700 group-hover:scale-110 transition-transform mb-2" />
              <p className="text-xs font-semibold text-slate-800">
                Click or drag &amp; drop Region Mapping File
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                CSV or Excel with Station Code, Name, Region, State, City
              </p>
            </div>

            <button
              type="button"
              onClick={() => regionInputRef.current?.click()}
              disabled={isProcessingRegion}
              className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-teal-700 hover:bg-teal-800 text-white shadow-xs transition-colors cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              {isProcessingRegion ? 'Ingesting Stations...' : 'Upload Region Mapping & Ingest to Supabase'}
            </button>

            {isProcessingRegion && (
              <div className="mt-4 p-4 rounded-xl bg-teal-50 border border-teal-200 flex items-center gap-3 text-xs text-teal-800">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Parsing region definitions and updating station master...</span>
              </div>
            )}

            {regionError && (
              <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
                <span>{regionError}</span>
              </div>
            )}

            {regionResult && (
              <div className="mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Region Mapping Updated!</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs pt-1 font-mono">
                  <div className="p-2 rounded bg-white border border-emerald-200">
                    <span className="text-slate-500 text-[10px]">New Stations</span>
                    <div className="text-teal-700 font-bold text-sm">{regionResult.inserted}</div>
                  </div>
                  <div className="p-2 rounded bg-white border border-emerald-200">
                    <span className="text-slate-500 text-[10px]">Updated</span>
                    <div className="text-sky-800 font-bold text-sm">{regionResult.updated}</div>
                  </div>
                  <div className="p-2 rounded bg-white border border-emerald-200">
                    <span className="text-slate-500 text-[10px]">Total Synced</span>
                    <div className="text-emerald-700 font-bold text-sm">{regionResult.stationsAffected}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Engine 3: Shipping Order & Delivery Challan Ingestion */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200 flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
                  <FileSpreadsheet className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">3. Shipping Order &amp; DC Sync</h3>
                  <p className="text-[11px] text-slate-500">Maps DC Code, Deliver QTY &amp; Value to Defective Master</p>
                </div>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-mono border border-blue-200 font-semibold">
                CSV / XLSX
              </span>
            </div>

            <div className="mt-4 text-xs text-slate-700 space-y-2">
              <p>
                Upload official Shipping Order export (e.g. <code>Shipping_Order.csv</code>). The engine:
              </p>
              <ul className="list-disc list-inside space-y-1 text-slate-500 text-[11px]">
                <li>Matches composite key: <code className="text-[#001489]">Shipping Order Code + New PN/Item Code</code></li>
                <li>Populates exact <strong>Delivery Challan Code</strong>, <strong>Deliver QTY</strong>, and <strong>Value</strong></li>
                <li>Recalculates parent Consignment Declared Value &amp; E-Way Bill threshold</li>
                <li><strong>Preserves &apos;Not Return&apos; parts</strong> under default category rules (no DC generated)</li>
              </ul>
            </div>

            {/* Dropzone */}
            <div
              onClick={() => shippingOrderInputRef.current?.click()}
              className="mt-5 p-8 rounded-xl border-2 border-dashed border-slate-300 hover:border-blue-600 bg-slate-50/70 hover:bg-slate-50 transition-all cursor-pointer text-center group"
            >
              <input
                ref={shippingOrderInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleProcessShippingOrderFile(file);
                }}
              />
              <Upload className="w-8 h-8 mx-auto text-blue-700 group-hover:scale-110 transition-transform mb-2" />
              <p className="text-xs font-semibold text-slate-800">
                Click or drag &amp; drop Shipping Order File
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                Supports Shipping_Order.csv or Excel (.xlsx, .xls)
              </p>
            </div>

            <button
              type="button"
              onClick={() => shippingOrderInputRef.current?.click()}
              disabled={isProcessingShippingOrder}
              className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-blue-700 hover:bg-blue-800 text-white shadow-xs transition-colors cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              {isProcessingShippingOrder ? 'Processing Shipping Orders...' : 'Upload Shipping Order & Sync DC Values'}
            </button>

            {isProcessingShippingOrder && (
              <div className="mt-4 p-4 rounded-xl bg-blue-50 border border-blue-200 flex items-center gap-3 text-xs text-blue-800">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Reading shipping order lines, matching defective parts, and calculating DC values...</span>
              </div>
            )}

            {shippingOrderError && (
              <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
                <span>{shippingOrderError}</span>
              </div>
            )}

            {shippingOrderResult && (
              <div className="mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Shipping Order &amp; Delivery Challans Ingested!</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs pt-1 font-mono">
                  <div className="p-2 rounded bg-white border border-emerald-200">
                    <span className="text-slate-500 text-[10px]">Parts Updated</span>
                    <div className="text-emerald-700 font-bold text-sm">{shippingOrderResult.updatedItemsCount}</div>
                  </div>
                  <div className="p-2 rounded bg-white border border-emerald-200">
                    <span className="text-slate-500 text-[10px]">SOs Updated</span>
                    <div className="text-blue-700 font-bold text-sm">{shippingOrderResult.updatedOrdersCount}</div>
                  </div>
                  <div className="p-2 rounded bg-white border border-emerald-200">
                    <span className="text-slate-500 text-[10px]">Not Return (Kept)</span>
                    <div className="text-amber-700 font-bold text-sm">{shippingOrderResult.skippedNotReturnCount}</div>
                  </div>
                  <div className="p-2 rounded bg-white border border-emerald-200">
                    <span className="text-slate-500 text-[10px]">Total Rows</span>
                    <div className="text-slate-800 font-bold text-sm">{shippingOrderResult.totalRows}</div>
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
