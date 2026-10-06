import * as XLSX from 'xlsx';
import { CCIMaster } from '../types/crm';

export interface RegionParseResult {
  stations: CCIMaster[];
  totalRows: number;
  filename: string;
}

function cleanKey(key: string): string {
  return String(key || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function parseRegionMappingFile(file: File): Promise<RegionParseResult> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

  if (!firstSheet) {
    throw new Error('No sheet found in Region Mapping file');
  }

  const rawRows: any[] = XLSX.utils.sheet_to_json(firstSheet, { defval: '', raw: false });
  if (rawRows.length === 0) {
    throw new Error('Uploaded Region Mapping file is empty');
  }

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
    return '';
  };

  const stations: CCIMaster[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const r = rawRows[i];

    let stationCode = getColVal(r, ['stationcode', 'station', 'code', 'ccicode']).replace(/\t/g, '');
    if (!stationCode) continue;

    // Normalize station code (e.g. 68 -> '068' if numeric)
    if (/^\d+$/.test(stationCode) && stationCode.length < 3) {
      stationCode = stationCode.padStart(3, '0');
    }

    const stationName = getColVal(r, ['stationname', 'name', 'cciname', 'aspservicename']) || `Station ${stationCode}`;
    let region = getColVal(r, ['region', 'zone']).toUpperCase() || 'WEST';
    const state = getColVal(r, ['state', 'province']);
    const city = getColVal(r, ['city', 'location']);
    const contactPerson = getColVal(r, ['contactperson', 'manager', 'contact', 'head']);
    const contactPhone = getColVal(r, ['contactphone', 'phone', 'mobile', 'telephone']);

    // Generate dynamic username: cci_<station_code>
    const username = `cci_${stationCode}`;

    stations.push({
      station_code: stationCode,
      username,
      station_name: stationName,
      region,
      state: state || undefined,
      city: city || undefined,
      contact_person: contactPerson || undefined,
      contact_phone: contactPhone || undefined,
      is_active: true,
    });
  }

  return {
    stations,
    totalRows: rawRows.length,
    filename: file.name,
  };
}

export function generateSampleRegionTemplateCSV(): string {
  const headers = ['Station Code', 'Station Name', 'Region', 'State', 'City', 'Contact Person', 'Contact Phone'];
  const samples = [
    ['068', 'RRLC-068-Noble Sales And Services', 'WEST', 'Maharashtra', 'Mumbai', 'Pravin Jadhav', '+91 98201 12345'],
    ['071', 'RRLC-071-HRK Tec Serv Pvt Ltd', 'SOUTH-1', 'Karnataka', 'Bengaluru', 'Karthik Rao', '+91 98450 67890'],
    ['027', 'RRLC-027-Viaan Services', 'NORTH-1', 'Delhi', 'New Delhi', 'Rajesh Sharma', '+91 98110 54321'],
    ['015', 'RRLC-015-Yatharth Services', 'NORTH-2', 'Uttar Pradesh', 'Noida', 'Amit Verma', '+91 98990 11223'],
    ['037', 'RRLC-037-G.M.Enterprises', 'EAST', 'West Bengal', 'Kolkata', 'Subhashish Roy', '+91 98300 44556'],
    ['042', 'RRLC-042-Apex Solutions', 'SOUTH-2', 'Tamil Nadu', 'Chennai', 'Venkatesh S', '+91 98401 23456'],
    ['055', 'RRLC-055-Central Telecom Hub', 'CENTRAL', 'Madhya Pradesh', 'Bhopal', 'Deepak Jain', '+91 98260 78901'],
    ['088', 'RRLC-088-Coastal Services', 'SOUTH-3', 'Kerala', 'Kochi', 'Anand Nair', '+91 98470 34567'],
  ];

  const csvRows = [
    headers.join(','),
    ...samples.map((row) => row.map((val) => `"${val}"`).join(',')),
  ];

  return csvRows.join('\n');
}
