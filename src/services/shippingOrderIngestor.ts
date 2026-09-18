import * as XLSX from 'xlsx';

export interface ShippingOrderItemRow {
  shippingOrderCode: string;
  deliveryChallanCode: string;
  itemCode: string;          // New PN / Item Code
  oldPn?: string;
  orderPn?: string;
  description?: string;
  deliverQty: number;
  receivedQty?: number;
  value: number;
  unitPrice?: number;
  dateIssued?: string;
  carrier?: string;
  trackingNumber?: string;
  shippingOrderStatus?: string;
}

export interface ShippingOrderParseResult {
  rows: ShippingOrderItemRow[];
  totalRowsRead: number;
  uniqueSoCount: number;
  totalValue: number;
  filename: string;
}

function cleanKey(key: string): string {
  return String(key || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function parseShippingOrderFile(file: File): Promise<ShippingOrderParseResult> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) throw new Error('No worksheets found in uploaded file');

  const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });
  if (rawRows.length === 0) throw new Error('Uploaded shipping order file is empty');

  const sampleRow = rawRows[0];
  const originalHeaders = Object.keys(sampleRow);
  const headerMap: Record<string, string> = {};
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
    // Substring fallback
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

  const rows: ShippingOrderItemRow[] = [];
  const uniqueSos = new Set<string>();
  let totalValue = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const r = rawRows[i];
    const soCode = getColVal(r, ['shippingordercode', 'socode', 'shippingorder', 'cciaspshippingordercode']);
    if (!soCode) continue;

    const dcCode = getColVal(r, ['deliverychallancode', 'challancode', 'dccode', 'deliverychallan', 'dcnumber']);
    const itemCode = getColVal(r, ['newpnitemcode', 'itemcode', 'newpn', 'partnumber', 'pn']);
    const oldPn = getColVal(r, ['oldpn']);
    const orderPn = getColVal(r, ['orderpn']);
    const desc = getColVal(r, ['description', 'partdescription']);
    const qtyStr = getColVal(r, ['deliverqty', 'deliveredqty', 'quantity', 'qty']);
    const deliverQty = Math.max(1, parseInt(qtyStr.replace(/[^0-9]/g, ''), 10) || 1);
    const recvQtyStr = getColVal(r, ['receivedqty', 'rcvdqty']);
    const receivedQty = recvQtyStr ? parseInt(recvQtyStr.replace(/[^0-9]/g, ''), 10) : undefined;
    const valStr = getColVal(r, ['value', 'declaredvalue', 'totalvalue', 'amount']);
    const val = parseFloat(valStr.replace(/[^0-9.]/g, '')) || 0;
    const unitPriceStr = getColVal(r, ['unitprice', 'price']);
    const unitPrice = parseFloat(unitPriceStr.replace(/[^0-9.]/g, '')) || 0;
    const dateIssued = getColVal(r, ['dateissued', 'issueddate']);
    const carrier = getColVal(r, ['carriershipper', 'carrier', 'shipper', 'courier']);
    const tracking = getColVal(r, ['trackingnumber', 'waybillno', 'docketnumber']);
    const soStatus = getColVal(r, ['shippingorderstatus', 'sostatus', 'status']);

    uniqueSos.add(soCode);
    totalValue += val;

    rows.push({
      shippingOrderCode: soCode,
      deliveryChallanCode: dcCode,
      itemCode,
      oldPn: oldPn || undefined,
      orderPn: orderPn || undefined,
      description: desc || undefined,
      deliverQty,
      receivedQty: receivedQty !== undefined && !isNaN(receivedQty) ? receivedQty : undefined,
      value: val,
      unitPrice: unitPrice || undefined,
      dateIssued: dateIssued || undefined,
      carrier: carrier || undefined,
      trackingNumber: tracking || undefined,
      shippingOrderStatus: soStatus || undefined,
    });
  }

  return {
    rows,
    totalRowsRead: rawRows.length,
    uniqueSoCount: uniqueSos.size,
    totalValue,
    filename: file.name,
  };
}
