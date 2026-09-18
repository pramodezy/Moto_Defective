import React, { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  X,
  Truck,
  RefreshCw,
  Layers,
  FileCheck,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Building2,
  Barcode
} from 'lucide-react';
import { ShippingOrder, CCIMaster, UserProfile } from '../../types/crm';
import { crmDb, BulkPickupUploadItem } from '../../lib/db';
import { getMotorolaStatusInfo, isCompletedJourneyStatus } from '../../lib/motorolaStatus';
import { formatDate } from '../../lib/utils';
import { toast } from 'sonner';

interface BulkPickupModalProps {
  orders: ShippingOrder[];
  stations: CCIMaster[];
  user: UserProfile;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (count: number) => void;
}

interface ParsedPickupRow {
  rowNum: number;
  soCode: string;
  courier: string;
  awbNumber: string;
  pickupDate?: string;
  runSheetRef?: string;
  remarks?: string;
  matchedOrder?: ShippingOrder;
  status: 'VALID' | 'NOT_FOUND' | 'MISSING_AWB' | 'ALREADY_DELIVERED' | 'DUPLICATE';
  message: string;
}

export const BulkPickupModal: React.FC<BulkPickupModalProps> = ({
  orders,
  stations,
  user,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [parsedRows, setParsedRows] = useState<ParsedPickupRow[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [previewPage, setPreviewPage] = useState(1);
  const previewPageSize = 10;
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fast station map lookup
  const stationMap = useMemo(() => {
    const map = new Map<string, CCIMaster>();
    stations.forEach((st) => {
      map.set(st.station_code, st);
      map.set(st.station_code.padStart(3, '0'), st);
    });
    return map;
  }, [stations]);

  // All active consignments requiring courier pickup or AWB allocation
  const awaitingPickupOrders = useMemo(() => {
    return orders.filter((so) => {
      const motoInfo = getMotorolaStatusInfo(so.motorola_status);
      return (
        motoInfo.code === 2 &&
        so.crm_status !== 'Delivered at CWH' &&
        so.crm_status !== 'Pending Inward at CWH' &&
        so.crm_status !== 'CWH to Create DC' &&
        so.crm_status !== 'Pickup Pending for RC' &&
        so.crm_status !== 'In Transit to RC' &&
        so.crm_status !== 'CWH Shipped to RC' &&
        so.crm_status !== 'Delivered to RC' &&
        so.crm_status !== 'Delivered to RC (Discrepancies)' &&
        so.crm_status !== 'In Transit' &&
        so.pickup_status !== 'Pickup Done' &&
        !motoInfo.isDelivered
      );
    });
  }, [orders]);

  const pendingAwbCount = useMemo(() => {
    return awaitingPickupOrders.filter((so) => !so.active_awb && !so.excel_ref_awb).length;
  }, [awaitingPickupOrders]);

  const awbAssignedCount = useMemo(() => {
    return awaitingPickupOrders.filter((so) => Boolean(so.active_awb || so.excel_ref_awb)).length;
  }, [awaitingPickupOrders]);

  if (!isOpen) return null;

  // 1. Download Blank Excel Template
  const handleDownloadBlankTemplate = () => {
    const templateData = [
      {
        'Shipping Order Code': 'SORLC26091400342',
        'Delivery Challan Code': 'DC-068-2026-0041',
        'Courier Partner': 'BlueDart Express',
        'AWB Number': '53677967711',
        'Pickup Date': new Date().toISOString().slice(0, 10),
        'Courier Run Sheet / Docket': 'RUN-DEL-89412',
        'Pickup Remarks': 'Physical pickup confirmed',
      },
      {
        'Shipping Order Code': 'SORLC26091400343',
        'Delivery Challan Code': 'DC-068-2026-0042',
        'Courier Partner': 'Delhivery Surface',
        'AWB Number': '53678202266',
        'Pickup Date': new Date().toISOString().slice(0, 10),
        'Courier Run Sheet / Docket': 'RUN-DEL-89413',
        'Pickup Remarks': 'Verified on courier manifest',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    ws['!cols'] = [
      { wch: 22 },
      { wch: 22 },
      { wch: 20 },
      { wch: 20 },
      { wch: 14 },
      { wch: 26 },
      { wch: 30 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bulk_Pickup_Template');
    XLSX.writeFile(wb, 'Motorola_Admin_Bulk_Pickup_Template.xlsx');
    toast.success('Blank Bulk Pickup Template downloaded.');
  };

  // 2. Download Pre-filled Template with All Pending SOs (Both Awaiting Pickup & Pending AWB)
  const handleDownloadAwaitingSosTemplate = () => {
    if (awaitingPickupOrders.length === 0) {
      toast.info('No shipping orders are currently pending AWB or awaiting courier pickup.');
      return;
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const exportData = awaitingPickupOrders.map((so) => {
      const st = stationMap.get(so.station_code);
      const hasAwb = Boolean(so.active_awb || so.excel_ref_awb);
      return {
        'Shipping Order Code': so.so_code,
        'Delivery Challan Code': so.delivery_challan_code || '',
        'Origin Station': `${so.station_code} - ${st?.station_name || ''}`,
        'City': st?.city || so.city || '',
        'Total Units': so.total_items || 1,
        'Courier Partner': so.courier || 'BlueDart Express',
        'AWB Number': so.active_awb || so.excel_ref_awb || '',
        'Pickup Date': todayStr,
        'Courier Run Sheet / Docket': '',
        'Pickup Remarks': hasAwb ? 'Confirmed via courier daily run sheet' : 'AWB allocated & pickup confirmed',
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    ws['!cols'] = [
      { wch: 22 }, // Shipping Order Code
      { wch: 22 }, // Delivery Challan Code
      { wch: 32 }, // Origin Station
      { wch: 18 }, // City
      { wch: 12 }, // Total Units
      { wch: 20 }, // Courier Partner
      { wch: 22 }, // AWB Number
      { wch: 14 }, // Pickup Date
      { wch: 26 }, // Courier Run Sheet / Docket
      { wch: 36 }, // Pickup Remarks
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pending_Consignments');
    XLSX.writeFile(
      wb,
      `Motorola_Pending_Pickup_AWB_${todayStr}.xlsx`
    );
    toast.success(
      `Exported ${awaitingPickupOrders.length} pending consignments into template (${pendingAwbCount} Pending AWB).`
    );
  };

  // 3. Process Uploaded File
  const handleFileUpload = (file: File) => {
    if (!file) return;
    setFileName(file.name);
    setPreviewPage(1);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (rawJson.length === 0) {
          toast.error('The uploaded file contains no data.');
          return;
        }

        // Fast lookup map for orders by SO Code and AWB
        const soMap = new Map<string, ShippingOrder>();
        const awbMap = new Map<string, ShippingOrder>();
        orders.forEach((o) => {
          soMap.set(o.so_code.trim().toUpperCase(), o);
          soMap.set(o.id.trim().toUpperCase(), o);
          if (o.active_awb) awbMap.set(o.active_awb.trim().toUpperCase(), o);
          if (o.excel_ref_awb) awbMap.set(o.excel_ref_awb.trim().toUpperCase(), o);
        });

        const seenSos = new Set<string>();
        const parsed: ParsedPickupRow[] = [];

        rawJson.forEach((row, index) => {
          const keys = Object.keys(row);
          const findVal = (patterns: string[]) => {
            for (const key of keys) {
              const cleanKey = key.trim().toLowerCase().replace(/[\s_-]+/g, '');
              if (patterns.some((p) => cleanKey.includes(p))) {
                return String(row[key] || '').trim();
              }
            }
            return '';
          };

          const soCode = findVal(['shippingordercode', 'shippingorder', 'socode', 'so_code', 'so']);
          const awbNumber = findVal(['awbnumber', 'awbno', 'awb', 'waybill', 'trackingnumber', 'tracking']);
          const courier = findVal(['courierpartner', 'courier', 'carrier', 'transporter']) || 'BlueDart Express';
          const pickupDate = findVal(['pickupdate', 'date', 'handoverdate', 'dispatchdate']);
          const runSheetRef = findVal(['courierrunsheet', 'runsheet', 'docket', 'manifest']);
          const remarks = findVal(['pickupremarks', 'remarks', 'notes', 'comments']);

          if (!soCode && !awbNumber) return; // Skip empty rows

          const normSo = soCode.toUpperCase();
          const normAwb = awbNumber.toUpperCase();
          const matchedOrder = (normSo ? soMap.get(normSo) : undefined) || (normAwb ? awbMap.get(normAwb) : undefined);

          let status: ParsedPickupRow['status'] = 'VALID';
          let message = 'Ready to mark Pickup Done';

          if (!matchedOrder) {
            status = 'NOT_FOUND';
            message = `SO "${soCode || awbNumber}" not found in CRM`;
          } else {
            const activeAwb = awbNumber?.trim() || matchedOrder.active_awb || matchedOrder.excel_ref_awb || '';
            const motoInfo = getMotorolaStatusInfo(matchedOrder.motorola_status);

            if (!activeAwb) {
              status = 'MISSING_AWB';
              message = 'Missing AWB: Please enter AWB number in Excel to allocate and confirm pickup';
            } else if (
              matchedOrder.crm_status === 'Delivered at CWH' ||
              matchedOrder.crm_status === 'Pending Inward at CWH' ||
              matchedOrder.crm_status === 'CWH to Create DC' ||
              matchedOrder.crm_status === 'Pickup Pending for RC' ||
              matchedOrder.crm_status === 'In Transit to RC' ||
              matchedOrder.crm_status === 'CWH Shipped to RC' ||
              matchedOrder.crm_status === 'Delivered to RC' ||
              matchedOrder.crm_status === 'Delivered to RC (Discrepancies)' ||
              motoInfo.isDelivered
            ) {
              status = 'ALREADY_DELIVERED';
              message = `Already reached CWH or downstream stage (${matchedOrder.crm_status})`;
            } else if (seenSos.has(matchedOrder.so_code)) {
              status = 'DUPLICATE';
              message = 'Duplicate entry in uploaded sheet';
            } else {
              seenSos.add(matchedOrder.so_code);
            }
          }

          parsed.push({
            rowNum: index + 2,
            soCode: matchedOrder ? matchedOrder.so_code : soCode,
            courier,
            awbNumber: (awbNumber?.trim()) || matchedOrder?.active_awb || matchedOrder?.excel_ref_awb || '',
            pickupDate,
            runSheetRef,
            remarks,
            matchedOrder,
            status,
            message,
          });
        });

        setParsedRows(parsed);
        const validCount = parsed.filter((p) => p.status === 'VALID').length;
        toast.success(`Parsed ${parsed.length} rows (${validCount} valid consignments ready).`);
      } catch (err: any) {
        console.error('Failed to parse Excel file:', err);
        toast.error('Failed to read Excel/CSV file: ' + (err.message || 'Unknown error'));
      }
    };

    reader.readAsArrayBuffer(file);
  };

  // 4. Submit Batch to Database
  const handleSubmitBatch = async () => {
    const validRows = parsedRows.filter((r) => r.status === 'VALID');
    if (validRows.length === 0) {
      toast.error('No valid consignments available to submit.');
      return;
    }

    setIsSubmitting(true);
    try {
      const recordsToUpdate: BulkPickupUploadItem[] = validRows.map((r) => ({
        soCode: r.soCode,
        courier: r.courier,
        awbNumber: r.awbNumber,
        pickupDate: r.pickupDate,
        runSheetRef: r.runSheetRef,
        remarks: r.remarks,
      }));

      const res = crmDb.bulkConfirmPickupDone(recordsToUpdate, user);

      if (res.successCount > 0) {
        if (res.skippedOrders.length > 0) {
          toast.warning(
            `Marked ${res.successCount} orders as "Pickup Done" (In Transit). ${res.skippedOrders.length} skipped.`
          );
        } else {
          toast.success(
            `Successfully marked ${res.successCount} orders as "Pickup Done" & transitioned to "In Transit" (synced to cloud)!`
          );
        }
        onSuccess?.(res.successCount);
        onClose();
      } else {
        toast.error('Failed to update consignments: No eligible orders were updated');
      }
    } catch (err: any) {
      toast.error('Database update failed: ' + (err.message || 'Error executing bulk pickup'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const validRowsCount = parsedRows.filter((r) => r.status === 'VALID').length;
  const invalidRowsCount = parsedRows.filter((r) => r.status !== 'VALID').length;

  // Pagination for preview table
  const totalPreviewPages = Math.ceil(parsedRows.length / previewPageSize) || 1;
  const paginatedPreviewRows = parsedRows.slice(
    (previewPage - 1) * previewPageSize,
    previewPage * previewPageSize
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden text-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-200">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  Admin Bulk Courier Pickup Upload
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-100 text-blue-800 border border-blue-200">
                  EXCEL / CSV
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Download the pending pickup sheet, verify courier run sheet/AWBs, and upload to move multiple SOs to "Pickup Done" (In Transit)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Step 1: Download Templates */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
              <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[11px] font-bold">
                1
              </span>
              Download Pickup Manifest Template
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Option A: Pre-filled Sheet with Pending SOs */}
              <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/40 flex flex-col justify-between space-y-3 hover:border-blue-300 transition-all">
                <div>
                  <div className="flex items-center gap-2 font-semibold text-xs text-blue-950">
                    <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                    Pending Consignments & AWB Allocation ({awaitingPickupOrders.length})
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1">
                    Export all pending consignments ({pendingAwbCount} Pending CWH AWB, {awbAssignedCount} Awaiting Collection). Enter/verify Courier & AWB numbers and re-upload.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadAwaitingSosTemplate}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Pending Sheet ({awaitingPickupOrders.length} SOs)
                </button>
              </div>

              {/* Option B: Blank Template */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col justify-between space-y-3 hover:border-slate-300 transition-all">
                <div>
                  <div className="flex items-center gap-2 font-semibold text-xs text-slate-800">
                    <FileSpreadsheet className="w-4 h-4 text-slate-600" />
                    Blank Pickup Template
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1">
                    Clean template with column schema: Shipping Order Code, Courier Partner, AWB Number, Pickup Date, Run Sheet, Remarks.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadBlankTemplate}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Blank Schema (.xlsx)
                </button>
              </div>
            </div>
          </div>

          {/* Step 2: Upload Completed File */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
              <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[11px] font-bold">
                2
              </span>
              Upload Verified File
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
              }}
              accept=".xlsx,.xls,.csv"
              className="hidden"
            />

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files?.[0]) handleFileUpload(e.dataTransfer.files[0]);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`p-6 rounded-xl border-2 border-dashed flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-blue-500 bg-blue-50/50'
                  : 'border-slate-300 hover:border-blue-400 bg-slate-50/40 hover:bg-blue-50/20'
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center mb-2">
                <Upload className="w-5 h-5" />
              </div>
              <p className="text-xs font-semibold text-slate-800">
                {fileName ? (
                  <span className="text-blue-700 font-mono font-bold flex items-center gap-1.5">
                    <FileCheck className="w-4 h-4" /> {fileName}
                  </span>
                ) : (
                  'Click to browse or drag & drop your Excel/CSV file here'
                )}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Supports Microsoft Excel (.xlsx, .xls) and CSV files
              </p>
            </div>
          </div>

          {/* Step 3: Parse Results & Table Preview */}
          {parsedRows.length > 0 && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[11px] font-bold">
                    3
                  </span>
                  Validation Summary ({parsedRows.length} Rows)
                </div>

                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {validRowsCount} Valid
                  </span>
                  {invalidRowsCount > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {invalidRowsCount} Skipped / Error
                    </span>
                  )}
                </div>
              </div>

              {/* Preview Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs bg-white">
                <div className="max-h-60 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-slate-100 text-slate-600 border-b border-slate-200 font-mono text-[10px] uppercase">
                      <tr>
                        <th className="py-2.5 px-3">Row</th>
                        <th className="py-2.5 px-3">SO Code</th>
                        <th className="py-2.5 px-3">Courier Partner</th>
                        <th className="py-2.5 px-3">AWB Number</th>
                        <th className="py-2.5 px-3">Pickup Date</th>
                        <th className="py-2.5 px-3">Run Sheet / Docket</th>
                        <th className="py-2.5 px-3">Status & Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedPreviewRows.map((r, i) => (
                        <tr
                          key={i}
                          className={`hover:bg-slate-50 transition-colors ${
                            r.status !== 'VALID' ? 'bg-amber-50/40 text-amber-900' : ''
                          }`}
                        >
                          <td className="py-2 px-3 font-mono text-slate-400">
                            #{r.rowNum}
                          </td>
                          <td className="py-2 px-3 font-mono font-semibold text-slate-900">
                            {r.soCode}
                          </td>
                          <td className="py-2 px-3 text-slate-600">
                            {r.courier}
                          </td>
                          <td className="py-2 px-3 font-mono font-semibold text-emerald-700">
                            {r.awbNumber || '—'}
                          </td>
                          <td className="py-2 px-3 text-slate-600">
                            {r.pickupDate || 'Today'}
                          </td>
                          <td className="py-2 px-3 font-mono text-slate-600">
                            {r.runSheetRef || '—'}
                          </td>
                          <td className="py-2 px-3">
                            {r.status === 'VALID' ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                Ready
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600" title={r.message}>
                                <AlertTriangle className="w-3 h-3 text-rose-500 shrink-0" />
                                <span className="truncate max-w-[160px]">{r.message}</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination footer for preview */}
                {totalPreviewPages > 1 && (
                  <div className="px-4 py-2 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
                    <span>
                      Page {previewPage} of {totalPreviewPages} ({parsedRows.length} total rows)
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                        disabled={previewPage === 1}
                        className="p-1 rounded border border-slate-300 disabled:opacity-40 hover:bg-white cursor-pointer"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewPage((p) => Math.min(totalPreviewPages, p + 1))}
                        disabled={previewPage === totalPreviewPages}
                        className="p-1 rounded border border-slate-300 disabled:opacity-40 hover:bg-white cursor-pointer"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {validRowsCount > 0 ? (
              <span className="text-emerald-700 font-semibold">
                ✓ Ready to transition {validRowsCount} consignment(s) to 'In Transit'
              </span>
            ) : (
              <span>Download template, fill pickup data, and upload sheet</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmitBatch}
              disabled={isSubmitting || validRowsCount === 0}
              className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-blue-700/20 flex items-center gap-2 cursor-pointer transition-all"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Updating Consignments...</span>
                </>
              ) : (
                <>
                  <Truck className="w-4 h-4" />
                  <span>Confirm Bulk Pickup Done ({validRowsCount})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
