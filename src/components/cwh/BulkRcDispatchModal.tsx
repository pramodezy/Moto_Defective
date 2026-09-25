import React, { useState, useRef } from 'react';
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
  Calendar,
  Barcode
} from 'lucide-react';
import { ShippingOrder, CCIMaster, UserProfile } from '../../types/crm';
import { crmDb } from '../../lib/db';
import { toast } from 'sonner';

interface BulkRcDispatchModalProps {
  orders: ShippingOrder[];
  stations: CCIMaster[];
  user: UserProfile;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (count: number) => void;
}

interface ParsedRcDispatchRow {
  rowNum: number;
  soCode: string;
  aspRcSoCode?: string;
  courier: string;
  awbNumber: string;
  pickupDate?: string;
  remarks?: string;
  matchedOrder?: ShippingOrder;
  status: 'VALID' | 'NOT_FOUND' | 'MISSING_AWB' | 'DUPLICATE';
  message: string;
}

export const BulkRcDispatchModal: React.FC<BulkRcDispatchModalProps> = ({
  orders,
  stations,
  user,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [parsedRows, setParsedRows] = useState<ParsedRcDispatchRow[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Station map lookup
  const stationMap = new Map<string, CCIMaster>();
  stations.forEach((st) => stationMap.set(st.station_code, st));

  // Eligible orders for RC dispatch (ASP Send to RC or awaiting outbound AWB)
  const eligibleRcOrders = orders.filter((o) => {
    const moto = (o.motorola_status || '').toLowerCase();
    const crm = (o.crm_status || '').toLowerCase();
    // Exclude completed/delivered RC orders
    if (
      o.crm_status === 'Delivered to RC' ||
      o.crm_status === 'Delivered to RC (Discrepancies)' ||
      moto.includes('rc received') ||
      Boolean(o.asp_rc_delivered_date) ||
      Boolean(o.so_grn_time)
    ) {
      return false;
    }
    // Show orders in ASP Send to RC stage or orders flagged with an ASP-RC SO code
    return moto.includes('send to rc') || crm.includes('send to rc') || Boolean(o.asp_rc_shipping_order_code);
  });

  const pendingRcOrders = eligibleRcOrders.filter((o) => !o.asp_outbound_awb);

  // 1. Download Blank Template
  const handleDownloadBlankTemplate = () => {
    const templateData = [
      {
        'Shipping Order Code': 'SORLC26080600166',
        'ASP-RC Shipping Order Code': 'SORLC26080501009',
        'Courier Partner': 'Bluedart Surface',
        'ASP Outbound SO (AWB)': '53676493043',
        'Pickup Date / Time': '2026-08-06 14:30',
        'Remarks': 'Carton 1 of 2 sealed',
      },
      {
        'Shipping Order Code': 'SORLC26073000960',
        'ASP-RC Shipping Order Code': 'SORLC26080200881',
        'Courier Partner': 'Delhivery Freight',
        'ASP Outbound SO (AWB)': '53678202299',
        'Pickup Date / Time': '2026-08-07 11:00',
        'Remarks': 'Direct handover to RC courier',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'RC_Dispatch_Template');
    XLSX.writeFile(wb, 'Motorola_RC_Dispatch_Template.xlsx');
    toast.success('Blank RC Dispatch Template downloaded.');
  };

  // 2. Download Pre-filled Template with Pending Orders
  const handleDownloadPendingOrdersTemplate = () => {
    const targetOrders = pendingRcOrders.length > 0 ? pendingRcOrders : eligibleRcOrders;

    if (targetOrders.length === 0) {
      toast.info('No consignments currently in "ASP Send to RC" stage.');
    }

    const exportData = targetOrders.map((so) => {
      const st = stationMap.get(so.station_code);
      return {
        'Shipping Order Code': so.so_code,
        'ASP-RC Shipping Order Code': so.asp_rc_shipping_order_code || '',
        'Origin Station': `${so.station_code} - ${st?.station_name || ''}`,
        'City': st?.city || so.city || '',
        'Total Units': so.total_items || 1,
        'Courier Partner': so.courier || 'Bluedart Surface',
        'ASP Outbound SO (AWB)': so.asp_outbound_awb || '',
        'Pickup Date / Time': so.asp_rc_pickup_date ? so.asp_rc_pickup_date.replace('T', ' ').slice(0, 16) : '',
        'Remarks': so.rc_receive_remark || '',
      };
    });

    const ws = XLSX.utils.json_to_sheet(
      exportData.length > 0
        ? exportData
        : [
            {
              'Shipping Order Code': '',
              'ASP-RC Shipping Order Code': '',
              'Courier Partner': 'Bluedart Surface',
              'ASP Outbound SO (AWB)': '',
              'Pickup Date / Time': '',
              'Remarks': '',
            },
          ]
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pending_RC_Dispatches');
    XLSX.writeFile(wb, `Motorola_Pending_RC_Dispatches_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success(`Exported ${targetOrders.length} consignments for bulk RC dispatch.`);
  };

function formatParsedExcelDate(val: any): string {
  if (val === undefined || val === null || val === '') return '';
  if (val instanceof Date && !isNaN(val.getTime())) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    const hh = String(val.getHours()).padStart(2, '0');
    const mm = String(val.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${d} ${hh}:${mm}`;
  }
  const str = String(val).trim();
  const num = Number(str);
  // Excel serial date range: e.g. 25569 (1970) to 75000 (2105)
  if (!isNaN(num) && num > 25569 && num < 75000) {
    const utcDays = Math.floor(num - 25569);
    const utcVal = utcDays * 86400;
    const dateObj = new Date(utcVal * 1000);
    const frac = num - Math.floor(num);
    const totalSeconds = Math.round(frac * 86400);
    dateObj.setSeconds(dateObj.getSeconds() + totalSeconds);
    if (!isNaN(dateObj.getTime())) {
      const y = dateObj.getFullYear();
      const m = String(dateObj.getMonth() + 1).padStart(2, '0');
      const d = String(dateObj.getDate()).padStart(2, '0');
      const hh = String(dateObj.getHours()).padStart(2, '0');
      const mm = String(dateObj.getMinutes()).padStart(2, '0');
      return `${y}-${m}-${d} ${hh}:${mm}`;
    }
  }
  return str;
}

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

        // Build lookup map using SO Code, ASP-RC SO Code, and ID
        const orderLookup = new Map<string, ShippingOrder>();
        orders.forEach((o) => {
          if (o.so_code) orderLookup.set(o.so_code.trim().toUpperCase(), o);
          if (o.asp_rc_shipping_order_code) orderLookup.set(o.asp_rc_shipping_order_code.trim().toUpperCase(), o);
          if (o.id) orderLookup.set(o.id.trim(), o);
        });

        const seenSos = new Set<string>();
        const parsed: ParsedRcDispatchRow[] = [];

        rawJson.forEach((row, index) => {
          const keys = Object.keys(row);
          const findVal = (patterns: string[]) => {
            for (const key of keys) {
              const cleanKey = key.trim().toLowerCase().replace(/[\s_\-/()]+/g, '');
              if (patterns.some((p) => cleanKey.includes(p))) {
                return row[key];
              }
            }
            return '';
          };

          const soCode = String(findVal(['shippingordercode', 'shippingorder', 'socode', 'so_code', 'so']) || '').trim();
          const aspRcSoCode = String(findVal(['asprcshippingordercode', 'asprcso', 'rcsocode', 'rcso', 'asprc']) || '').trim();
          const courier = String(findVal(['courierpartner', 'courier', 'carrier', 'transporter']) || 'Bluedart Surface').trim();
          const awbNumber = String(findVal(['aspoutboundsoawb', 'aspoutboundawb', 'outboundawb', 'awbnumber', 'awbno', 'awb', 'docket', 'waybill', 'tracking']) || '').replace(/\t/g, '').trim();
          const rawPickupDate = findVal(['pickupdate', 'pickuptime', 'logisticsdate', 'dispatchdate', 'pickupdate/time']);
          const pickupDate = formatParsedExcelDate(rawPickupDate);
          const remarks = String(findVal(['remarks', 'remark', 'notes', 'comments']) || '').trim();

          if (!soCode && !aspRcSoCode && !awbNumber) return; // Skip blank rows

          // Attempt lookup by SO Code or by ASP-RC SO Code
          const normSo = (soCode || '').toUpperCase();
          const normRcSo = (aspRcSoCode || '').toUpperCase();
          const matchedOrder = orderLookup.get(normSo) || (normRcSo ? orderLookup.get(normRcSo) : undefined);

          let status: ParsedRcDispatchRow['status'] = 'VALID';
          let message = 'Ready to dispatch';

          const primaryKey = normSo || normRcSo;

          if (!primaryKey) {
            status = 'NOT_FOUND';
            message = 'Missing Shipping Order or ASP-RC Code';
          } else if (!matchedOrder) {
            status = 'NOT_FOUND';
            message = `Order "${primaryKey}" not found in CRM`;
          } else if (!awbNumber) {
            status = 'MISSING_AWB';
            message = 'Missing Outbound AWB / Docket Number';
          } else if (seenSos.has(primaryKey)) {
            status = 'DUPLICATE';
            message = 'Duplicate consignment row in sheet';
          } else {
            seenSos.add(primaryKey);
          }

          parsed.push({
            rowNum: index + 2,
            soCode: soCode || matchedOrder?.so_code || '',
            aspRcSoCode: aspRcSoCode || matchedOrder?.asp_rc_shipping_order_code || '',
            courier,
            awbNumber,
            pickupDate,
            remarks,
            matchedOrder,
            status,
            message,
          });
        });

        setParsedRows(parsed);
        const validCount = parsed.filter((p) => p.status === 'VALID').length;
        toast.success(`Parsed ${parsed.length} rows (${validCount} valid RC dispatches ready).`);
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
      const recordsToUpdate = validRows.map((r) => {
        let finalPickupIso = new Date().toISOString();
        if (r.pickupDate) {
          const parsed = new Date(r.pickupDate);
          if (!isNaN(parsed.getTime())) {
            finalPickupIso = parsed.toISOString();
          }
        }
        return {
          soCode: r.soCode || r.aspRcSoCode || '',
          aspRcShippingOrderCode: r.aspRcSoCode || r.matchedOrder?.asp_rc_shipping_order_code,
          courier: r.courier,
          awbNumber: r.awbNumber,
          pickupDate: finalPickupIso,
          remarks: r.remarks,
        };
      });

      const res = await crmDb.batchUpdateRcDocketDetails(recordsToUpdate, user);

      if (res.updated > 0) {
        if (res.errors.length > 0) {
          toast.warning(`Updated RC dispatch for ${res.updated} consignments, with notices: ${res.errors.slice(0, 2).join('; ')}`);
        } else {
          toast.success(`Successfully updated ${res.updated} RC dispatches with live Supabase sync!`);
        }
        onSuccess?.(res.updated);
        onClose();
      } else {
        toast.error('Failed to update consignments: ' + (res.errors.join('; ') || 'Unknown error'));
      }
    } catch (err: any) {
      toast.error('Database update failed: ' + (err.message || 'Error updating RC dispatches'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const validRowsCount = parsedRows.filter((r) => r.status === 'VALID').length;
  const invalidRowsCount = parsedRows.filter((r) => r.status !== 'VALID').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] border border-slate-200 shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold flex items-center gap-2">
                Bulk RC Dispatch &amp; Docket Upload
                <span className="text-[11px] font-semibold text-blue-300 bg-blue-900/60 px-2 py-0.5 rounded-full border border-blue-700/50">
                  CWH &rarr; Repair Center
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Upload logistics docket details for consignments in <strong>ASP Send to RC</strong> stage.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Instructions and Download Templates Box */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1 text-xs text-slate-600">
              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                Step 1: Download Standard Template
              </div>
              <p>
                Download a pre-filled template with consignments awaiting RC dispatch docket, or a blank template.
              </p>
              <p className="text-[11px] text-slate-500">
                &bull; <strong className="text-slate-700">ASP-RC Shipping Order Code</strong> is auto-fetched from the Motorola defective dump.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadPendingOrdersTemplate}
                className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Pre-filled Pending ({pendingRcOrders.length})
              </button>
              <button
                type="button"
                onClick={handleDownloadBlankTemplate}
                className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                Blank Template
              </button>
            </div>
          </div>

          {/* Upload Drop Zone */}
          <div>
            <div className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
              <Upload className="w-4 h-4 text-blue-600" />
              Step 2: Upload Completed Excel / CSV Sheet
            </div>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleFileUpload(file);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-blue-500 bg-blue-50/50'
                  : 'border-slate-300 hover:border-blue-400 bg-slate-50/50 hover:bg-slate-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />
              <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-3">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div className="text-sm font-semibold text-slate-800">
                {fileName ? fileName : 'Click to browse or drag and drop your spreadsheet here'}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Supports Microsoft Excel (.xlsx, .xls) and CSV (.csv)
              </div>
            </div>
          </div>

          {/* Parsed Results Preview */}
          {parsedRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
                  <span>Sheet Validation Preview</span>
                  <span className="text-slate-400">&bull;</span>
                  <span className="text-slate-600 font-normal">{parsedRows.length} total rows parsed</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    {validRowsCount} Valid &amp; Ready
                  </span>
                  {invalidRowsCount > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                      {invalidRowsCount} Errors / Skipped
                    </span>
                  )}
                </div>
              </div>

              {/* Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-3 font-semibold">Row #</th>
                      <th className="py-2.5 px-3 font-semibold">Shipping Order Code</th>
                      <th className="py-2.5 px-3 font-semibold">ASP-RC SO Code</th>
                      <th className="py-2.5 px-3 font-semibold">Courier</th>
                      <th className="py-2.5 px-3 font-semibold">Outbound AWB / Docket</th>
                      <th className="py-2.5 px-3 font-semibold">Pickup Date</th>
                      <th className="py-2.5 px-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedRows.map((row, idx) => (
                      <tr
                        key={idx}
                        className={row.status === 'VALID' ? 'hover:bg-slate-50' : 'bg-rose-50/30 hover:bg-rose-50/50'}
                      >
                        <td className="py-2 px-3 text-slate-500 font-mono">{row.rowNum}</td>
                        <td className="py-2 px-3 font-mono font-bold text-slate-900">
                          {row.soCode || <span className="text-slate-400 italic">None</span>}
                        </td>
                        <td className="py-2 px-3 font-mono text-indigo-700">
                          {row.aspRcSoCode || <span className="text-slate-400 italic">-</span>}
                        </td>
                        <td className="py-2 px-3 text-slate-700">{row.courier}</td>
                        <td className="py-2 px-3 font-mono font-semibold text-blue-900">
                          {row.awbNumber || <span className="text-rose-500 font-normal italic">Missing</span>}
                        </td>
                        <td className="py-2 px-3 text-slate-600 font-mono text-[11px]">
                          {row.pickupDate || 'Current Time'}
                        </td>
                        <td className="py-2 px-3">
                          {row.status === 'VALID' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              Ready
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700"
                              title={row.message}
                            >
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                              <span className="truncate max-w-[150px]">{row.message}</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <div className="flex items-center gap-3">
            {parsedRows.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setParsedRows([]);
                  setFileName('');
                }}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors cursor-pointer"
              >
                Clear Sheet
              </button>
            )}
            <button
              type="button"
              disabled={validRowsCount === 0 || isSubmitting}
              onClick={handleSubmitBatch}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold shadow-md transition-all ${
                validRowsCount > 0 && !isSubmitting
                  ? 'bg-[#001489] hover:bg-[#08209e] text-white cursor-pointer'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Updating Database...
                </>
              ) : (
                <>
                  <FileCheck className="w-4 h-4" />
                  Confirm &amp; Update {validRowsCount} Dispatches
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
