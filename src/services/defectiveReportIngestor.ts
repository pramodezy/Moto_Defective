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
    const srCloseDate = getColVal(r, ['srclosedatetime', 'srclosedate', 'closetime', 'closedate']);
    const partsStatus = getColVal(r, ['partsstatus', 'partstatus', 'status', 'motorolastatus']);

    // Determine estimated value by category
    let estimatedVal = 8000;
    const catLower = category.toLowerCase();
    if (catLower.includes('main board') || catLower.includes('pcb')) estimatedVal = 14500;
    else if (catLower.includes('display') || catLower.includes('screen') || catLower.includes('oled')) estimatedVal = 9800;
    else if (catLower.includes('camera')) estimatedVal = 3200;
    else if (catLower.includes('battery')) estimatedVal = 1800;
    else if (catLower.includes('cable') || catLower.includes('adapter') || catLower.includes('charger')) estimatedVal = 750;

    const compositeKey = `${srNumber}_${srPartNumber}_${newPartNumber}`;

    items.push({
      composite_key: compositeKey,
      sr_number: srNumber,
      sr_part_number: srPartNumber,
      new_part_number: newPartNumber,
      part_category: category || 'Spare Part',
      part_description: partDesc,
      quantity: qty,
      station_code: stationCode || '068',
      shipping_order_code: soCode || `SO-MANUAL-${Date.now()}`,
      sr_close_timestamp: srCloseDate,
      sr_model_name: modelName,
      sr_fault_description: faultDesc,
      motorola_parts_status: partsStatus || 'CCI Send To CWH',
      excel_awb: excelAwb,
      estimated_value: estimatedVal,
    });
  }

  return {
    items,
    totalRead: rawRows.length,
    detectedHeaders: originalHeaders,
    filename: file.name,
  };
}
