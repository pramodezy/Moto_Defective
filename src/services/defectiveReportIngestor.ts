import * as XLSX from 'xlsx';
import { DefectiveItem } from '../types/crm';

export interface ParseResult {
  items: Partial<DefectiveItem>[];
  totalRead: number;
  detectedHeaders: string[];
  filename: string;
}

// Clean and normalize keys for header matching
function cleanKey(key: string): string {
  return String(key || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function parseDefectiveReportFile(file: File): Promise<ParseResult> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array', cellDates: true });
  
  // Use first sheet or 'Combined Data' if present
  const sheetName = workbook.SheetNames.find(s => s.toLowerCase().includes('combined') || s.toLowerCase().includes('data')) || workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  if (!worksheet) {
    throw new Error('No worksheets found in uploaded file');
  }

  const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });
  if (rawRows.length === 0) {
    throw new Error('Uploaded sheet is empty');
  }

  const sampleRow = rawRows[0];
  const originalHeaders = Object.keys(sampleRow);
  const headerMap: Record<string, string> = {};

  // Build mapping from normalized keys to actual row keys
  originalHeaders.forEach((h) => {
    headerMap[cleanKey(h)] = h;
  });

  const getColVal = (row: any, candidates: string[]): string => {
    for (const cand of candidates) {
      const matched = headerMap[cand];
      if (matched && row[matched] !== undefined) {
        return String(row[matched]).trim();
      }
    }
    // Substring fallback for variations like "SO Close Time (IST)"
    for (const cand of candidates) {
      const entry = Object.entries(headerMap).find(
        ([cleanH]) => cleanH.includes(cand) || cand.includes(cleanH)
      );
      if (entry && row[entry[1]] !== undefined) {
        return String(row[entry[1]]).trim();
      }
    }
    return '';
  };

  const items: Partial<DefectiveItem>[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const r = rawRows[i];

    const srNumber = getColVal(r, ['srnumber', 'srno', 'srnum']);
    const srPartNumber = getColVal(r, ['srpartnumber', 'srpartno', 'defectivepartnumber']);
    const newPartNumber = getColVal(r, ['newpartnumber', 'newpartno', 'issuedpartnumber']);
    const soCode = getColVal(r, ['cciaspshippingordercode', 'shippingordercode', 'socode', 'shippingorder']);

    // Skip empty lines
    if (!srNumber && !srPartNumber && !soCode) continue;

    const stationCode = getColVal(r, ['stationcode', 'station', 'aspcodestation']).replace(/\t/g, '').padStart(3, '0');
    const category = getColVal(r, ['partcategory', 'category']);
    const partDesc = getColVal(r, ['srpartdescription', 'partdescription', 'description']);
    const qtyStr = getColVal(r, ['srpartquantity', 'quantity', 'qty']);
    const qty = parseInt(qtyStr.replace(/\t/g, ''), 10) || 1;
    const excelAwb = getColVal(r, ['aspoutboundsoawb', 'outboundawb', 'awb', 'excelawb']);
    const modelName = getColVal(r, ['srmodelname', 'modelname', 'model']);
    const faultDesc = getColVal(r, ['srfaultdescription', 'faultdescription', 'fault']);
    const srCloseDate = getColVal(r, [
      'soclosetime',
      'soclosedatetime',
      'soclosedate',
      'soclosed',
      'srclosetime',
      'srclosedatetime',
      'srclosedate',
      'closetime',
      'closedate',
      'closedtime',
      'sotime',
      'sodate',
    ]);
    const partsStatus = getColVal(r, ['partsstatus', 'partstatus', 'status', 'motorolastatus']);

    // Determine estimated value by category
    let estimatedVal = 3500;
    const catLower = category.toLowerCase();
    if (catLower.includes('handset') || catLower.includes('swap') || catLower.includes('doa')) estimatedVal = 18000;
    else if (catLower.includes('main board') || catLower.includes('pcb')) estimatedVal = 14500;
    else if (catLower.includes('display') || catLower.includes('screen') || catLower.includes('oled') || catLower.includes('tp lcm')) estimatedVal = 9800;
    else if (catLower.includes('camera')) estimatedVal = 3200;
    else if (catLower.includes('battery')) estimatedVal = 1800;
    else if (catLower.includes('sub board') || catLower.includes('small board')) estimatedVal = 850;
    else if (catLower.includes('cable') || catLower.includes('adapter') || catLower.includes('charger')) estimatedVal = 750;
    else if (catLower.includes('speaker') || catLower.includes('receiver') || catLower.includes('fpc') || catLower.includes('vibrator') || catLower.includes('fps')) estimatedVal = 150;
    else if (
      catLower.includes('adhesive') ||
      catLower.includes('tape') ||
      catLower.includes('screw') ||
      catLower.includes('gasket') ||
      catLower.includes('cushion') ||
      catLower.includes('mesh') ||
      catLower.includes('film') ||
      catLower.includes('label')
    ) estimatedVal = 21;

    // Leg 2 Outbound Hub Transfer (CWH -> RC) columns
    const aspRcSo = getColVal(r, ['asprcshippingordercode', 'asprcshippingorder', 'asprcsocode', 'asprcso']);
    const aspRcShipDate = getColVal(r, ['asprcshipdatetime', 'asprcshipdate']);
    const aspRcPickupDate = getColVal(r, ['asprclogisticspickupdatetime', 'asprclogisticspickupdate', 'asprcpickupdate']);
    const aspRcDeliveredDate = getColVal(r, ['asprclogisticsdelivereddatetime', 'asprclogisticsdelivereddate', 'asprcdelivereddate']);
    const rcRemark = getColVal(r, ['rcreceiveremark', 'rcremark', 'rccomments', 'rcremark2']);

    const finalStation = stationCode || '068';
    const effectiveSoCode = soCode || `SO-PENDING-${finalStation}`;

    // Match Key = SR Number + SR Part Number + CCI-ASP Shipping Order Code
    const compositeKey = `${srNumber}_${srPartNumber}_${effectiveSoCode}`;

    items.push({
      composite_key: compositeKey,
      sr_number: srNumber,
      sr_part_number: srPartNumber,
      new_part_number: newPartNumber,
      part_category: category || 'Spare Part',
      part_description: partDesc,
      quantity: qty,
      station_code: finalStation,
      shipping_order_code: effectiveSoCode,
      sr_close_timestamp: srCloseDate,
      sr_model_name: modelName,
      sr_fault_description: faultDesc,
      motorola_parts_status: partsStatus || 'Not Return',
      excel_awb: excelAwb,
      estimated_value: estimatedVal,
      asp_rc_shipping_order_code: aspRcSo || undefined,
      asp_rc_ship_date: aspRcShipDate || undefined,
      asp_rc_pickup_date: aspRcPickupDate || undefined,
      asp_rc_delivered_date: aspRcDeliveredDate || undefined,
      rc_receive_remark: rcRemark || undefined,
    });
  }

  return {
    items,
    totalRead: rawRows.length,
    detectedHeaders: originalHeaders,
    filename: file.name,
  };
}
