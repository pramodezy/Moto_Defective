import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
  Upload, 
  Download, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  Barcode, 
  Truck, 
  RefreshCw, 
  Layers, 
  FileCheck
} from 'lucide-react';
import { ShippingOrder, CCIMaster, UserProfile } from '../../types/crm';
import { crmDb } from '../../lib/db';
import { isAwbIssueRequired } from '../../lib/motorolaStatus';
import { toast } from 'sonner';

interface BulkAwbUploadModalProps {
  orders: ShippingOrder[];
  stations: CCIMaster[];
  user: UserProfile;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (count: number) => void;
}

interface ParsedAwbRow {
  rowNum: number;
  soCode: string;
  dcCode?: string;
  tokenIssueDate?: string;
  courier: string;
  awbNumber: string;
  ewayBillNumber?: string;
  matchedOrder?: ShippingOrder;
  status: 'VALID' | 'NOT_FOUND' | 'MISSING_AWB' | 'DUPLICATE';
  message: string;
}

function formatParsedExcelDate(val: any): string {
  if (!val) return '';
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.toISOString().slice(0, 10);
  }
  const str = String(val).trim();
  const num = parseFloat(str);
  if (!isNaN(num) && num > 25569 && num < 80000) {
    const utcDays = Math.floor(num - 25569);
    const dateObj = new Date(utcDays * 86400 * 1000);
    if (!isNaN(dateObj.getTime())) {
      return dateObj.toISOString().slice(0, 10);
    }
  }

  // Handle DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, '0');
    const m = dmyMatch[2].padStart(2, '0');
    const y = dmyMatch[3];
    return `${y}-${m}-${d}`;
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.slice(0, 10);
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return str;
}

export const BulkAwbUploadModal: React.FC<BulkAwbUploadModalProps> = ({
  orders,
  stations,
  user,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [parsedRows, setParsedRows] = useState<ParsedAwbRow[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Station map lookup
  const stationMap = new Map<string, CCIMaster>();
  stations.forEach((st) => stationMap.set(st.station_code, st));

  // Orders currently awaiting AWB assignment
  const pendingAwbOrders = orders.filter((o) => isAwbIssueRequired(o));

  // 1. Download Blank Template
  const handleDownloadBlankTemplate = () => {
    const today = new Date().toISOString().slice(0, 10);
    const templateData = [
      {
        'Shipping Order Code': 'SORLC26080600166',
        'DC Code': 'DC-260806-001',
        'Token Issue Date': today,
        'Courier Partner': 'BlueDart Express',
        'AWB Number': '53677967711',
        'E-Way Bill Number': '',
      },
      {
        'Shipping Order Code': 'SORLC26073000960',
        'DC Code': 'DC-260730-002',
        'Token Issue Date': today,
        'Courier Partner': 'Delhivery',
        'AWB Number': '53678202266',
        'E-Way Bill Number': '',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bulk_AWB_Template');
    XLSX.writeFile(wb, 'Motorola_Bulk_AWB_Template.xlsx');
    toast.success('Blank Bulk AWB Template downloaded.');
  };

  // 2. Download Pre-filled Template with Pending SOs
  const handleDownloadPendingSosTemplate = () => {
    if (pendingAwbOrders.length === 0) {
      toast.info('No shipping orders are currently awaiting AWB assignment.');
    }

    const today = new Date().toISOString().slice(0, 10);
    const exportData = pendingAwbOrders.map((so) => {
      const st = stationMap.get(so.station_code);
      return {
        'Shipping Order Code': so.so_code,
        'DC Code': so.delivery_challan_code || '',
        'Token Issue Date': so.token_issue_date || today,
        'Origin Station': `${so.station_code} - ${st?.station_name || ''}`,
        'City': st?.city || so.city || '',
        'Total Units': so.total_items || 1,
        'Courier Partner': so.courier || 'BlueDart Express',
        'AWB Number': '',
        'E-Way Bill Number': so.eway_bill_number || '',
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData.length > 0 ? exportData : [
      { 'Shipping Order Code': '', 'DC Code': '', 'Token Issue Date': today, 'Courier Partner': 'BlueDart Express', 'AWB Number': '', 'E-Way Bill Number': '' }
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pending_AWB_Consignments');
    XLSX.writeFile(wb, `Motorola_Pending_AWB_Consignments_${today}.xlsx`);
    toast.success(`Exported ${pendingAwbOrders.length} pending consignments for bulk AWB entry.`);
  };

  // 3. Process File Upload
  const handleFileUpload = (file: File) => {
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (rawJson.length === 0) {
          toast.error('The uploaded sheet is empty.');
          return;
        }

        // Create quick lookup maps for SOs
        const soMap = new Map<string, ShippingOrder>();
        orders.forEach((o) => {
          soMap.set(o.so_code.trim().toUpperCase(), o);
          soMap.set(o.id.trim(), o);
        });

        const seenSos = new Set<string>();
        const parsed: ParsedAwbRow[] = [];

        rawJson.forEach((row, index) => {
          // Normalize column headers
          const keys = Object.keys(row);
          const findVal = (patterns: string[]) => {
            // Priority 1: Exact match on normalized header
            for (const key of keys) {
              const cleanKey = key.trim().toLowerCase().replace(/[\s_-]+/g, '');
              if (patterns.includes(cleanKey)) {
                return String(row[key] || '').trim();
              }
            }
            // Priority 2: Partial match only for tokens of length >= 3
            for (const key of keys) {
              const cleanKey = key.trim().toLowerCase().replace(/[\s_-]+/g, '');
              if (patterns.some((p) => p.length >= 3 && cleanKey.includes(p))) {
                return String(row[key] || '').trim();
              }
            }
            return '';
          };

          const soCode = findVal(['shippingordercode', 'shippingorder', 'socode', 'so_code', 'so']);
          const dcCode = findVal(['dccode', 'deliverychallancode', 'deliverychallan', 'challancode', 'dc_code', 'dc']);
          const rawDate = findVal(['tokenissuedate', 'tokenissue', 'issuedate', 'dateissued', 'tokendate', 'issue_date', 'pickupdate']);
          const tokenIssueDate = formatParsedExcelDate(rawDate) || new Date().toISOString().slice(0, 10);
          const courier = findVal(['courierpartner', 'courier', 'carrier', 'transporter']) || 'BlueDart Express';
          const awbNumber = findVal(['awbnumber', 'awbno', 'awb', 'waybill', 'trackingnumber', 'tracking']);
          const ewayBillNumber = findVal(['ewaybillnumber', 'ewaybill', 'ewayno', 'eway']);

          if (!soCode && !awbNumber) return; // Skip empty rows

          const normSo = soCode.toUpperCase();
          const matchedOrder = soMap.get(normSo);

          let status: ParsedAwbRow['status'] = 'VALID';
          let message = 'Ready to update';

          if (!soCode) {
            status = 'NOT_FOUND';
            message = 'Missing Shipping Order Code';
          } else if (!matchedOrder) {
            status = 'NOT_FOUND';
            message = `SO "${soCode}" not found in CRM`;
          } else if (!awbNumber) {
            status = 'MISSING_AWB';
            message = 'Missing AWB Number';
          } else if (seenSos.has(normSo)) {
            status = 'DUPLICATE';
            message = 'Duplicate SO entry in sheet';
          } else {
            seenSos.add(normSo);
          }

          parsed.push({
            rowNum: index + 2, // 1-indexed header + row
            soCode,
            dcCode: dcCode || matchedOrder?.delivery_challan_code || '',
            tokenIssueDate,
            courier,
            awbNumber,
            ewayBillNumber,
            matchedOrder,
            status,
            message,
          });
        });

        setParsedRows(parsed);
        const validCount = parsed.filter((p) => p.status === 'VALID').length;
        toast.success(`Parsed ${parsed.length} rows (${validCount} valid SOs ready).`);
      } catch (err: any) {
        console.error('Failed to parse Excel file:', err);
        toast.error('Failed to read Excel/CSV file: ' + (err.message || 'Unknown error'));
      }
    };

    reader.readAsArrayBuffer(file);
  };

  // Submit and Update Database
  const handleSubmitBatch = async () => {
    const validRows = parsedRows.filter((r) => r.status === 'VALID');
    if (validRows.length === 0) {
      toast.error('No valid rows available to submit.');
      return;
    }

    setIsSubmitting(true);
    try {
      const recordsToUpdate = validRows.map((r) => ({
        soCode: r.soCode,
        courier: r.courier,
        awbNumber: r.awbNumber,
        ewayBillNumber: r.ewayBillNumber,
        dcCode: r.dcCode || r.matchedOrder?.delivery_challan_code,
        tokenIssueDate: r.tokenIssueDate,
      }));

      const res = await crmDb.bulkAssignAwbTokens(recordsToUpdate, user);

      if (res.updatedCount > 0) {
        if (res.errors.length > 0) {
          toast.warning(`Assigned AWBs to ${res.updatedCount} orders (Status: "Pickup Pending"), with notices: ${res.errors.slice(0, 2).join('; ')}`);
        } else {
          toast.success(`Successfully assigned AWBs & updated ${res.updatedCount} orders to "Pickup Pending" (synced to Supabase)!`);
        }
        onSuccess?.(res.updatedCount);
        onClose();
      } else {
        toast.error('Failed to update consignments: ' + (res.errors.join('; ') || 'Unknown error'));
      }
    } catch (err: any) {
      toast.error('Database update failed: ' + (err.message || 'Error updating AWB tokens'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const validRowsCount = parsedRows.filter((r) => r.status === 'VALID').length;
  const invalidRowsCount = parsedRows.filter((r) => r.status !== 'VALID').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50 text-[#001489] border border-blue-200">
              <Barcode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Bulk Courier AWB Upload & Inward Station Retokening
              </h3>
              <p className="text-xs text-slate-500">
                Central Warehouse (CWH) • Batch assignment of courier AWBs generated on logistics portals
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs text-slate-700">
          {/* Top Instructions & Template Downloads */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
                <FileCheck className="w-4 h-4 text-[#001489]" />
                Step 1: Download Standard Template
              </h4>
              <p className="text-slate-600 text-[11px] max-w-lg">
                Enter or paste <strong>Shipping Order Code</strong>, <strong>Courier Partner</strong>, and <strong>AWB Number</strong> generated from courier website.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadBlankTemplate}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 shadow-xs transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                Blank Template
              </button>
              <button
                type="button"
                onClick={handleDownloadPendingSosTemplate}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold bg-blue-50 hover:bg-blue-100 text-[#001489] border border-blue-200 shadow-xs transition-colors cursor-pointer"
                title="Download template pre-populated with active shipping orders awaiting AWB assignment"
              >
                <Download className="w-3.5 h-3.5 text-[#001489]" />
                Pending SOs Template ({pendingAwbOrders.length})
              </button>
            </div>
          </div>

          {/* File Upload Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleFileUpload(e.dataTransfer.files[0]);
              }
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`p-6 rounded-2xl border-2 border-dashed text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-3 ${
              isDragging
                ? 'border-[#001489] bg-blue-50/50'
                : 'border-slate-300 hover:border-slate-400 bg-slate-50/50'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileUpload(e.target.files[0]);
                }
              }}
              accept=".xlsx,.xls,.csv"
              className="hidden"
            />
            <div className="w-12 h-12 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-[#001489]">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm">
                {fileName ? fileName : 'Click to Browse or Drag & Drop AWB Sheet'}
              </p>
              <p className="text-slate-500 text-[11px] mt-1">
                Supports Microsoft Excel (.xlsx, .xls) and CSV (.csv)
              </p>
            </div>
          </div>

          {/* Parsed Preview Table */}
          {parsedRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900">Parsed Consignments Preview</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-100 text-slate-700 border border-slate-200">
                    {parsedRows.length} Total
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300">
                    {validRowsCount} Valid
                  </span>
                  {invalidRowsCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-800 border border-rose-300">
                      {invalidRowsCount} Errors / Not Found
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setParsedRows([]);
                    setFileName('');
                  }}
                  className="text-slate-500 hover:text-slate-800 text-xs underline cursor-pointer"
                >
                  Clear Sheet
                </button>
              </div>

              <div className="rounded-xl border border-slate-200 overflow-hidden max-h-64 overflow-y-auto bg-white shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-medium sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">SO Code</th>
                      <th className="py-2.5 px-3">DC Code</th>
                      <th className="py-2.5 px-3">Origin Station</th>
                      <th className="py-2.5 px-3 text-center">Parts</th>
                      <th className="py-2.5 px-3">Courier</th>
                      <th className="py-2.5 px-3">AWB Number</th>
                      <th className="py-2.5 px-3">Token Issue Date</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedRows.map((r, i) => {
                      const st = r.matchedOrder ? stationMap.get(r.matchedOrder.station_code) : null;
                      return (
                        <tr key={i} className={r.status === 'VALID' ? 'hover:bg-slate-50' : 'bg-rose-50/40 hover:bg-rose-50/70'}>
                          <td className="py-2.5 px-3 text-slate-400 font-mono">{r.rowNum}</td>
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                            {r.soCode || <span className="text-rose-600 italic">Empty</span>}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-xs">
                            {r.dcCode ? (
                              <span className="font-semibold text-blue-800 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                                {r.dcCode}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Pending DC</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">
                            {r.matchedOrder ? (
                              <span>
                                <strong className="text-slate-900 font-mono">{r.matchedOrder.station_code}</strong> - {st?.station_name || 'Station'}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">-</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono text-slate-700">
                            {r.matchedOrder?.total_items || 1}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">
                            <span className="inline-flex items-center gap-1">
                              <Truck className="w-3 h-3 text-slate-400" />
                              {r.courier}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-[#001489]">
                            {r.awbNumber ? (
                              <span className="flex items-center gap-1">
                                <Barcode className="w-3 h-3 text-[#001489]" />
                                {r.awbNumber}
                              </span>
                            ) : (
                              <span className="text-rose-600 italic">Missing AWB</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-xs text-slate-600">
                            {r.tokenIssueDate || '-'}
                          </td>
                          <td className="py-2.5 px-3">
                            {r.status === 'VALID' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded">
                                <CheckCircle2 className="w-3" /> Valid
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-800 bg-rose-50 border border-rose-300 px-2 py-0.5 rounded" title={r.message}>
                                <AlertTriangle className="w-3" /> {r.message}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
          <span className="text-slate-600 text-xs">
            {parsedRows.length > 0 ? (
              <>
                Ready to update: <strong className="text-emerald-700 font-bold">{validRowsCount}</strong> of {parsedRows.length} rows
              </>
            ) : (
              'Upload a sheet with AWB numbers to proceed'
            )}
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmitBatch}
              disabled={isSubmitting || validRowsCount === 0}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-[#001489] hover:bg-[#08209e] text-white shadow-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                  <span>Updating Database...</span>
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  <span>Submit & Update {validRowsCount} AWBs in Database</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
