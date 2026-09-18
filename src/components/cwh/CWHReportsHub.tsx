import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  Download,
  Search,
  Layers,
  Truck,
  CheckCircle2,
  Clock,
  Barcode,
  IndianRupee,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { ShippingOrder, DefectiveItem, CCIMaster, UserProfile } from '../../types/crm';
import { formatINR, getAgeingBucket, parseDateSafe } from '../../lib/utils';
import { getUnifiedPickupStatus } from '../../lib/motorolaStatus';
import { toast } from 'sonner';

interface CWHReportsHubProps {
  orders: ShippingOrder[];
  items: DefectiveItem[];
  stations: CCIMaster[];
  user: UserProfile;
}

export const CWHReportsHub: React.FC<CWHReportsHubProps> = ({
  orders,
  items,
  stations,
  user,
}) => {
  const [reportType, setReportType] = useState<'line_item' | 'so_summary'>('line_item');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedRegion, setSelectedRegion] = useState<string>('ALL');
  const [selectedStation, setSelectedStation] = useState<string>('ALL');
  const [selectedPriority, setSelectedPriority] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [previewPage, setPreviewPage] = useState<number>(1);
  const pageSize = 12;

  // Station lookup map
  const stationMap = useMemo(() => {
    const map = new Map<string, CCIMaster>();
    stations.forEach((s) => {
      map.set(s.station_code, s);
      map.set(s.station_code.padStart(3, '0'), s);
    });
    return map;
  }, [stations]);

  // Map defective items by SO code
  const itemsBySo = useMemo(() => {
    const map = new Map<string, DefectiveItem[]>();
    items.forEach((it) => {
      if (it.shipping_order_code) {
        const k = it.shipping_order_code.trim().toUpperCase();
        const arr = map.get(k) || [];
        arr.push(it);
        map.set(k, arr);
      }
    });
    return map;
  }, [items]);

  // Order age map (days calculated from SO Close Time or max_sr_age)
  const orderAgeMap = useMemo(() => {
    const map = new Map<string, number>();
    const now = Date.now();

    orders.forEach((so) => {
      const soItems = itemsBySo.get(so.so_code.toUpperCase()) || [];
      let maxDays = Number(so.max_sr_age || 0);

      soItems.forEach((it) => {
        if (it.sr_close_timestamp) {
          const d = parseDateSafe(it.sr_close_timestamp);
          if (d) {
            const days = Math.max(0, Math.floor((now - d.getTime()) / (1000 * 60 * 60 * 24)));
            if (days > maxDays) maxDays = days;
          }
        }
      });
      map.set(so.id, maxDays);
      map.set(so.so_code.toUpperCase(), maxDays);
    });
    return map;
  }, [orders, itemsBySo]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter((so) => {
      // 1. Station Filter
      if (selectedStation !== 'ALL' && so.station_code !== selectedStation) {
        return false;
      }

      // 2. Region Filter
      const st = stationMap.get(so.station_code);
      const effectiveRegion = st?.region || so.region || 'West';
      if (selectedRegion !== 'ALL' && effectiveRegion.toUpperCase() !== selectedRegion.toUpperCase()) {
        return false;
      }

      // 3. Status Filter
      if (selectedStatus !== 'ALL') {
        if (selectedStatus === 'PENDING_AWB') {
          if (so.crm_status !== 'Pending AWB') return false;
        } else if (selectedStatus === 'PICKUP_PENDING') {
          if (so.crm_status !== 'Pickup Pending') return false;
        } else if (selectedStatus === 'IN_TRANSIT') {
          if (so.crm_status !== 'In Transit') return false;
        } else if (selectedStatus === 'DELIVERED_AT_CWH') {
          if (so.crm_status !== 'Delivered at CWH') return false;
        } else if (selectedStatus === 'CWH_TO_CREATE_DC') {
          if (so.crm_status !== 'CWH to Create DC') return false;
        } else if (selectedStatus === 'OUTBOUND_RC') {
          if (
            so.crm_status !== 'Pickup Pending for RC' &&
            so.crm_status !== 'In Transit to RC' &&
            so.crm_status !== 'Delivered to RC' &&
            so.crm_status !== 'Delivered to RC (Discrepancies)'
          ) return false;
        } else if (so.crm_status !== selectedStatus) {
          return false;
        }
      }

      // 4. Ageing / Criticality Filter
      if (selectedPriority !== 'ALL') {
        const age = orderAgeMap.get(so.so_code.toUpperCase()) ?? Number(so.max_sr_age || 0);
        if (getAgeingBucket(age) !== selectedPriority) {
          return false;
        }
      }

      // 5. Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesSo =
          so.so_code.toLowerCase().includes(q) ||
          (so.delivery_challan_code && so.delivery_challan_code.toLowerCase().includes(q)) ||
          (so.active_awb && so.active_awb.toLowerCase().includes(q)) ||
          (so.excel_ref_awb && so.excel_ref_awb.toLowerCase().includes(q)) ||
          so.station_code.toLowerCase().includes(q) ||
          (st?.station_name && st.station_name.toLowerCase().includes(q)) ||
          (so.city && so.city.toLowerCase().includes(q)) ||
          (so.courier && so.courier.toLowerCase().includes(q));

        if (!matchesSo) {
          // Check constituent parts
          const soItems = itemsBySo.get(so.so_code.toUpperCase()) || [];
          const matchesPart = soItems.some((it) =>
            (it.new_part_number && it.new_part_number.toLowerCase().includes(q)) ||
            (it.sr_part_number && it.sr_part_number.toLowerCase().includes(q)) ||
            (it.part_description && it.part_description.toLowerCase().includes(q))
          );
          if (!matchesPart) return false;
        }
      }

      return true;
    });
  }, [orders, selectedStation, selectedRegion, selectedStatus, selectedPriority, searchQuery, stationMap, orderAgeMap, itemsBySo]);

  // Generate granular line-item records (1 row per defective part)
  const lineItemRows = useMemo(() => {
    const list: {
      so: ShippingOrder;
      item?: DefectiveItem;
      soCode: string;
      dcCode: string;
      partNumber: string;
      description: string;
      quantity: number;
      deliverQty: number;
      unitPrice: number;
      lineValue: number;
      motoStatus: string;
      crmStatus: string;
      pickupStatus: string;
      awbNumber: string;
      courier: string;
      stationCode: string;
      stationName: string;
      region: string;
      city: string;
      state: string;
      ageDays: number;
      ageBucket: string;
      closeTime: string;
      ewayBillNumber: string;
    }[] = [];

    filteredOrders.forEach((so) => {
      const soItems = itemsBySo.get(so.so_code.toUpperCase()) || [];
      const st = stationMap.get(so.station_code);
      const ageDays = orderAgeMap.get(so.so_code.toUpperCase()) ?? Number(so.max_sr_age || 0);
      const ageBucket = getAgeingBucket(ageDays);
      const pickupStatus = getUnifiedPickupStatus(so);
      const awb = so.active_awb || so.excel_ref_awb || '';
      const dcCode = so.delivery_challan_code || '';

      if (soItems.length === 0) {
        // Even if no defective parts catalog row mapped, export order-level row
        list.push({
          so,
          soCode: so.so_code,
          dcCode,
          partNumber: 'N/A (Order Level)',
          description: `Consignment of ${so.total_items || 1} units`,
          quantity: so.total_items || 1,
          deliverQty: so.total_items || 1,
          unitPrice: (so.total_declared_value || 0) / Math.max(1, so.total_items || 1),
          lineValue: so.total_declared_value || 0,
          motoStatus: so.motorola_status || 'CCI Send To CWH',
          crmStatus: so.crm_status,
          pickupStatus,
          awbNumber: awb,
          courier: so.courier || 'BlueDart Express',
          stationCode: so.station_code,
          stationName: st?.station_name || `Service Center ${so.station_code}`,
          region: st?.region || so.region || 'West',
          city: st?.city || so.city || '',
          state: st?.state || so.state || '',
          ageDays,
          ageBucket,
          closeTime: so.created_at ? so.created_at.slice(0, 10) : '',
          ewayBillNumber: so.eway_bill_number || '',
        });
      } else {
        soItems.forEach((it) => {
          const partVal = it.value !== undefined && it.value !== null ? it.value : (it.estimated_value || 8000);
          const partQty = it.deliver_qty || it.quantity || 1;
          const unitP = it.deliver_qty && it.deliver_qty > 0 ? (partVal / it.deliver_qty) : (it.estimated_value || 8000);

          list.push({
            so,
            item: it,
            soCode: so.so_code,
            dcCode: it.delivery_challan_code || dcCode,
            partNumber: it.new_part_number || it.sr_part_number || 'UNKNOWN_PART',
            description: it.part_description || it.sr_model_name || '',
            quantity: it.quantity || 1,
            deliverQty: partQty,
            unitPrice: Math.round(unitP * 100) / 100,
            lineValue: Math.round(partVal * 100) / 100,
            motoStatus: it.motorola_parts_status || so.motorola_status || 'CCI Send To CWH',
            crmStatus: so.crm_status,
            pickupStatus,
            awbNumber: awb,
            courier: so.courier || 'BlueDart Express',
            stationCode: so.station_code,
            stationName: st?.station_name || `Service Center ${so.station_code}`,
            region: st?.region || so.region || 'West',
            city: st?.city || so.city || '',
            state: st?.state || so.state || '',
            ageDays,
            ageBucket,
            closeTime: it.sr_close_timestamp || so.created_at?.slice(0, 10) || '',
            ewayBillNumber: so.eway_bill_number || '',
          });
        });
      }
    });

    return list;
  }, [filteredOrders, itemsBySo, stationMap, orderAgeMap]);

  // Overall metric totals
  const totalDeclaredValue = useMemo(() => {
    return filteredOrders.reduce((acc, so) => acc + (so.total_declared_value || 0), 0);
  }, [filteredOrders]);

  const totalUnits = useMemo(() => {
    return lineItemRows.reduce((acc, r) => acc + (r.deliverQty || 1), 0);
  }, [lineItemRows]);

  // Export to Excel
  const handleExportToExcel = () => {
    if (filteredOrders.length === 0) {
      toast.warning('No records to export matching the selected filters.');
      return;
    }

    try {
      let exportData: any[] = [];

      if (reportType === 'line_item') {
        exportData = lineItemRows.map((r, idx) => ({
          'Sr. No': idx + 1,
          'Shipping Order Code': r.soCode,
          'Delivery Challan Code': r.dcCode || 'N/A',
          'Defective Part No': r.partNumber,
          'Part Description': r.description,
          'Deliver Qty': r.deliverQty,
          'Unit Price (INR)': r.unitPrice,
          'Line Value (INR)': r.lineValue,
          'Moto CRM Status': r.motoStatus,
          'CRM Status': r.crmStatus,
          'Pickup Status': r.pickupStatus,
          'AWB Number': r.awbNumber || 'Pending AWB',
          'Courier Partner': r.courier,
          'Origin Station Code': r.stationCode,
          'Station Name': r.stationName,
          'Region': r.region,
          'City': r.city,
          'State': r.state,
          'Ageing (Days)': r.ageDays,
          'Ageing Criticality': r.ageBucket.replace('_', ' ').toUpperCase(),
          'SO Close / Issue Date': r.closeTime,
          'e-Way Bill Number': r.ewayBillNumber || 'Not Required / Pending',
        }));
      } else {
        exportData = filteredOrders.map((so, idx) => {
          const st = stationMap.get(so.station_code);
          const age = orderAgeMap.get(so.so_code.toUpperCase()) ?? Number(so.max_sr_age || 0);
          return {
            'Sr. No': idx + 1,
            'Shipping Order Code': so.so_code,
            'Delivery Challan Code': so.delivery_challan_code || 'N/A',
            'Total Items': so.total_items || 1,
            'Total Declared Value (INR)': so.total_declared_value || 0,
            'Moto CRM Status': so.motorola_status || 'CCI Send To CWH',
            'CRM Status': so.crm_status,
            'Pickup Status': getUnifiedPickupStatus(so),
            'AWB Number': so.active_awb || so.excel_ref_awb || 'Pending AWB',
            'Courier Partner': so.courier || 'BlueDart Express',
            'Station Code': so.station_code,
            'Station Name': st?.station_name || '',
            'Region': st?.region || so.region || 'West',
            'City': st?.city || so.city || '',
            'State': st?.state || so.state || '',
            'Ageing (Days)': age,
            'Ageing Criticality': getAgeingBucket(age).replace('_', ' ').toUpperCase(),
            'e-Way Bill Number': so.eway_bill_number || '',
            'Created Date': so.created_at ? so.created_at.slice(0, 10) : '',
          };
        });
      }

      const ws = XLSX.utils.json_to_sheet(exportData);

      // Auto-fit column widths
      const colWidths = Object.keys(exportData[0] || {}).map((k) => ({
        wch: Math.max(k.length + 3, 12),
      }));
      ws['!cols'] = colWidths;

      const wb = XLSX.utils.book_new();
      const sheetName = reportType === 'line_item' ? 'Defective_Line_Items' : 'SO_Summary';
      XLSX.utils.book_append_sheet(wb, ws, sheetName);

      const timestamp = new Date().toISOString().slice(0, 10);
      const filename = `Motorola_CWH_${sheetName}_Report_${timestamp}.xlsx`;
      XLSX.writeFile(wb, filename);

      toast.success(`Successfully exported ${exportData.length} records to ${filename}`);
    } catch (err: any) {
      console.error('Export error:', err);
      toast.error('Failed to export Excel report: ' + (err.message || 'Unknown error'));
    }
  };

  // Preview Pagination
  const totalPreviewPages = Math.ceil(lineItemRows.length / pageSize) || 1;
  const paginatedRows = useMemo(() => {
    const start = (previewPage - 1) * pageSize;
    return lineItemRows.slice(start, start + pageSize);
  }, [lineItemRows, previewPage, pageSize]);

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Top Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-6 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-2xl text-white shadow-xl border border-blue-800/40">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide bg-sky-500/20 text-sky-200 border border-sky-400/30 flex items-center gap-1.5">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              CWH Management Information System (MIS)
            </span>
            <span className="text-xs text-blue-200/70 font-mono">
              Role: {user.role} ({user.username})
            </span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight font-['Outfit']">
            Consignment & Defective Spares Reports
          </h1>
          <p className="text-sm text-blue-200/90 max-w-2xl mt-1">
            Generate and export granular line-item or consignment-level Excel reports for all {orders.length} dispatches visible to CWH.
          </p>
        </div>

        {/* Export Action */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportToExcel}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white shadow-lg hover:shadow-emerald-500/30 active:scale-95 transition-all cursor-pointer border border-emerald-400/30"
          >
            <Download className="w-4 h-4" />
            <span>Download Excel Report</span>
            <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-emerald-900/50 text-emerald-100 font-mono">
              {reportType === 'line_item' ? lineItemRows.length : filteredOrders.length} rows
            </span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Filtered Shipping Orders</p>
            <h3 className="text-2xl font-extrabold text-slate-800 font-mono mt-0.5">
              {filteredOrders.length} <span className="text-xs font-normal text-slate-600 font-sans">/ {orders.length} total</span>
            </h3>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-800 flex items-center justify-center border border-blue-100">
            <Truck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Defective Spare Parts</p>
            <h3 className="text-2xl font-extrabold text-indigo-700 font-mono mt-0.5">
              {lineItemRows.length} <span className="text-xs font-normal text-slate-600 font-sans">lines ({totalUnits} pcs)</span>
            </h3>
          </div>
          <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center border border-indigo-100">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Declared Value</p>
            <h3 className="text-2xl font-extrabold text-emerald-800 font-mono mt-0.5">
              {formatINR(totalDeclaredValue)}
            </h3>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-800 flex items-center justify-center border border-emerald-100">
            <IndianRupee className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Pending CWH AWB Action</p>
            <h3 className="text-2xl font-extrabold text-amber-800 font-mono mt-0.5">
              {filteredOrders.filter((o) => o.crm_status === 'Pending AWB').length}
            </h3>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-800 flex items-center justify-center border border-amber-100">
            <Barcode className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter Control Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          {/* Report Granularity Switcher */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Report Format:</span>
            <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setReportType('line_item')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  reportType === 'line_item'
                    ? 'bg-blue-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Line-Item Level (Part-Wise Granular)
              </button>
              <button
                type="button"
                onClick={() => setReportType('so_summary')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  reportType === 'so_summary'
                    ? 'bg-blue-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Consignment Summary (SO-Wise)
              </button>
            </div>
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search SO, DC, Part No, AWB..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPreviewPage(1);
              }}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all outline-hidden text-slate-800"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-xs text-slate-600 hover:text-slate-800"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Dropdown Filters */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Status Bucket */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">Logistics Status</label>
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setPreviewPage(1);
              }}
              className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 outline-hidden text-slate-700 cursor-pointer"
            >
              <option value="ALL">All Statuses ({orders.length})</option>
              <option value="PENDING_AWB">1. Pending AWB (Issue Token)</option>
              <option value="PICKUP_PENDING">2. Pickup Pending (At CCI)</option>
              <option value="IN_TRANSIT">3. In Transit (En Route)</option>
              <option value="DELIVERED_AT_CWH">4. Delivered at CWH Hub</option>
              <option value="CWH_TO_CREATE_DC">5. Passed CCTV / DC to RC</option>
              <option value="OUTBOUND_RC">6. Outbound Leg to RC</option>
            </select>
          </div>

          {/* Ageing Criticality */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">Ageing Criticality</label>
            <select
              value={selectedPriority}
              onChange={(e) => {
                setSelectedPriority(e.target.value);
                setPreviewPage(1);
              }}
              className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 outline-hidden text-slate-700 cursor-pointer"
            >
              <option value="ALL">All Ageing Buckets</option>
              <option value="super_critical">Super Critical (&gt; 25 Days)</option>
              <option value="critical">Critical (16 - 25 Days)</option>
              <option value="high">High (8 - 15 Days)</option>
              <option value="low">Low (0 - 7 Days)</option>
            </select>
          </div>

          {/* Region */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">Region</label>
            <select
              value={selectedRegion}
              onChange={(e) => {
                setSelectedRegion(e.target.value);
                setSelectedStation('ALL');
                setPreviewPage(1);
              }}
              className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 outline-hidden text-slate-700 cursor-pointer"
            >
              <option value="ALL">All Regions</option>
              <option value="CENTRAL">Central</option>
              <option value="WEST">West</option>
              <option value="NORTH">North</option>
              <option value="SOUTH">South</option>
              <option value="EAST">East</option>
            </select>
          </div>

          {/* Station */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">Service Center (CCI)</label>
            <select
              value={selectedStation}
              onChange={(e) => {
                setSelectedStation(e.target.value);
                setPreviewPage(1);
              }}
              className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 outline-hidden text-slate-700 cursor-pointer"
            >
              <option value="ALL">All Stations ({stations.length})</option>
              {stations
                .filter((s) => selectedRegion === 'ALL' || s.region?.toUpperCase() === selectedRegion.toUpperCase())
                .map((s) => (
                  <option key={s.station_code} value={s.station_code}>
                    {s.station_code} - {s.city || s.station_name}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </div>

      {/* Live Data Preview Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50">
          <div>
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-800" />
              Live Report Preview ({reportType === 'line_item' ? `${lineItemRows.length} Defective Line Items` : `${filteredOrders.length} Shipping Orders`})
            </h3>
            <p className="text-xs text-slate-600">
              Showing page {previewPage} of {totalPreviewPages}. The exported file will contain all matching rows.
            </p>
          </div>

          {/* Pagination Controls */}
          {totalPreviewPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                disabled={previewPage === 1}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-mono font-bold text-slate-700">
                {previewPage} / {totalPreviewPages}
              </span>
              <button
                type="button"
                onClick={() => setPreviewPage((p) => Math.min(totalPreviewPages, p + 1))}
                disabled={previewPage === totalPreviewPages}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-100/80 text-[11px] font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">#</th>
                <th className="py-3 px-4">SO Code</th>
                <th className="py-3 px-4">DC Code</th>
                <th className="py-3 px-4">Defective Part No</th>
                <th className="py-3 px-4">Qty</th>
                <th className="py-3 px-4 text-right">Value</th>
                <th className="py-3 px-4">Moto Status</th>
                <th className="py-3 px-4">CRM Status</th>
                <th className="py-3 px-4">Pickup Status</th>
                <th className="py-3 px-4">Courier & AWB</th>
                <th className="py-3 px-4">Origin Station</th>
                <th className="py-3 px-4 text-center">Ageing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {paginatedRows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-600">
                    <p className="text-sm font-medium">No records match the selected filters.</p>
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row, index) => (
                  <tr key={`${row.soCode}-${row.partNumber}-${index}`} className="hover:bg-blue-50/40 transition-colors">
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {(previewPage - 1) * pageSize + index + 1}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-blue-900">
                      {row.soCode}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700">
                      {row.dcCode ? (
                        <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 font-semibold text-[11px]">
                          {row.dcCode}
                        </span>
                      ) : (
                        <span className="text-slate-600 italic">Pending DC</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-mono font-semibold text-slate-900">{row.partNumber}</div>
                      <div className="text-[10px] text-slate-600 truncate max-w-xs">{row.description}</div>
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold">
                      {row.deliverQty}
                    </td>
                    <td className="py-3 px-4 font-mono text-right font-bold text-slate-900">
                      {formatINR(row.lineValue)}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-sky-50 text-sky-800 border border-sky-200">
                        {row.motoStatus}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {row.crmStatus}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700">
                        {row.pickupStatus === 'Pickup Done' ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Clock className="w-3 h-3 text-amber-500" />
                        )}
                        {row.pickupStatus}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs">
                      {row.awbNumber ? (
                        <div>
                          <div className="text-blue-800 font-bold flex items-center gap-1">
                            <Barcode className="w-3 h-3" />
                            <span>{row.awbNumber}</span>
                          </div>
                          <div className="text-[10px] text-slate-600 font-sans">{row.courier}</div>
                        </div>
                      ) : (
                        <span className="text-amber-800 text-[11px] font-sans font-medium">Pending CWH AWB</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <div className="font-semibold text-slate-800">Station {row.stationCode}</div>
                      <div className="text-[10px] text-slate-600">{row.city} ({row.region})</div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                        row.ageBucket === 'super_critical'
                          ? 'bg-rose-100 text-rose-800 border border-rose-300'
                          : row.ageBucket === 'critical'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : row.ageBucket === 'high'
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      }`}>
                        {row.ageDays}d
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
