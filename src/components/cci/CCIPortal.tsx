import React, { useState } from 'react';
import { 
  Store, 
  Truck, 
  Layers, 
  Printer, 
  CheckCircle2, 
  AlertTriangle, 
  MapPin, 
  Barcode, 
  FileText,
  Clock
} from 'lucide-react';
import { ShippingOrder, DefectiveItem, CCIMaster } from '../../types/crm';
import { formatINR, formatDate, getCrmStatusStyle } from '../../lib/utils';
import { SlaBadge } from '../layout/SlaBadge';
import { printConsignmentManifest } from '../../services/manifestGenerator';

interface CCIPortalProps {
  stationCode: string;
  station?: CCIMaster;
  orders: ShippingOrder[];
  items: DefectiveItem[];
  onSelectOrder: (order: ShippingOrder) => void;
}

export const CCIPortal: React.FC<CCIPortalProps> = ({
  stationCode,
  station,
  orders,
  items,
  onSelectOrder,
}) => {
  const [activeView, setActiveView] = useState<'consignments' | 'items'>('consignments');

  // Strict station scoping
  const stationOrders = orders.filter((o) => o.station_code === stationCode);
  const stationItems = items.filter((i) => i.station_code === stationCode);

  const totalValue = stationOrders.reduce((sum, o) => sum + (o.total_declared_value || 0), 0);
  const inTransitCount = stationOrders.filter((o) => o.crm_status === 'In Transit').length;
  const cwhReceivedCount = stationOrders.filter((o) => o.crm_status === 'CWH Received').length;
  const discrepanciesCount = stationOrders.filter((o) => o.crm_status === 'Discrepancy Tagged').length;

  return (
    <div className="space-y-6">
      {/* Station Header Profile */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-[#0d2218] via-[#102a20] to-[#143328] border border-emerald-500/40 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Store className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-emerald-300 px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40">
                  cci_{stationCode}
                </span>
                <span className="text-xs text-slate-300 font-semibold">
                  Station Code: <strong className="text-white font-mono">{stationCode}</strong>
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-medium">
                  {station?.region || 'West'} Region
                </span>
              </div>
              <h2 className="text-xl font-extrabold text-white font-['Outfit'] mt-1">
                {station?.station_name || `Motorola Authorized Service Center - ${stationCode}`}
              </h2>
              <p className="text-xs text-emerald-200/80 flex items-center gap-1.5 mt-0.5">
                <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                {station?.city ? `${station.city}, ` : ''}{station?.state || 'India'} • Contact: {station?.contact_person || 'N/A'} ({station?.contact_phone || 'N/A'})
              </p>
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs text-emerald-300 uppercase tracking-wider font-semibold">
              Station Pipeline Value
            </div>
            <div className="text-2xl font-bold font-mono text-white mt-0.5">
              {formatINR(totalValue)}
            </div>
            <div className="text-[11px] text-slate-400">
              {stationOrders.length} Consignments • {stationItems.length} Defective Units
            </div>
          </div>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-[#101a35] border border-[#1c2b53]">
          <span className="text-xs text-slate-400">Total Dispatched</span>
          <div className="text-2xl font-bold font-mono text-white mt-1">
            {stationOrders.length}
          </div>
          <span className="text-[10px] text-slate-400">Lifetime consignments</span>
        </div>

        <div className="p-4 rounded-xl bg-[#101a35] border border-[#1c2b53]">
          <span className="text-xs text-slate-400">In Transit to CWH</span>
          <div className="text-2xl font-bold font-mono text-cyan-400 mt-1">
            {inTransitCount}
          </div>
          <span className="text-[10px] text-slate-400">Under courier tracking</span>
        </div>

        <div className="p-4 rounded-xl bg-[#101a35] border border-[#1c2b53]">
          <span className="text-xs text-slate-400">CWH Received & Verified</span>
          <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
            {cwhReceivedCount}
          </div>
          <span className="text-[10px] text-slate-400">Completed inward verification</span>
        </div>

        <div className="p-4 rounded-xl bg-[#101a35] border border-[#1c2b53]">
          <span className="text-xs text-slate-400">Discrepancies Flagged</span>
          <div className="text-2xl font-bold font-mono text-rose-400 mt-1">
            {discrepanciesCount}
          </div>
          <span className="text-[10px] text-slate-400">Physical inspection variances</span>
        </div>
      </div>

      {/* View Switcher Tabs */}
      <div className="flex items-center gap-2 border-b border-[#1f2e5a] pb-2">
        <button
          onClick={() => setActiveView('consignments')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeView === 'consignments'
              ? 'bg-emerald-600 text-white shadow'
              : 'bg-[#101a35] text-slate-400 hover:text-slate-200 border border-[#1c2b53]'
          }`}
        >
          <Truck className="w-3.5 h-3.5" />
          Consignments Dispatch Orders ({stationOrders.length})
        </button>

        <button
          onClick={() => setActiveView('items')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeView === 'items'
              ? 'bg-emerald-600 text-white shadow'
              : 'bg-[#101a35] text-slate-400 hover:text-slate-200 border border-[#1c2b53]'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          Defective Line Items ({stationItems.length})
        </button>
      </div>

      {/* Consignments Table */}
      {activeView === 'consignments' && (
        <div className="rounded-xl border border-[#1c2b53] overflow-hidden bg-[#101a35] shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0b1329] text-slate-400 border-b border-[#1c2b53] font-mono">
                <tr>
                  <th className="py-3 px-4">SO Code</th>
                  <th className="py-3 px-4">Courier & AWB</th>
                  <th className="py-3 px-4 text-center">Units</th>
                  <th className="py-3 px-4 text-right">Declared Value</th>
                  <th className="py-3 px-4">SLA Priority</th>
                  <th className="py-3 px-4">CRM Status</th>
                  <th className="py-3 px-4">Ship Date</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1c2b53]/60 text-slate-300">
                {stationOrders.map((so) => {
                  const orderItems = items.filter((i) => i.shipping_order_code === so.so_code);

                  return (
                    <tr key={so.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-cyan-300">
                        <button
                          onClick={() => onSelectOrder(so)}
                          className="hover:underline text-left"
                        >
                          {so.so_code}
                        </button>
                        {so.eway_bill_required && (
                          <div className="text-[9px] text-amber-400">E-Way Bill Req</div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <div className="text-slate-300">{so.courier}</div>
                        <div className="font-mono text-cyan-400 text-[11px]">
                          {so.active_awb || so.excel_ref_awb || 'Pending'}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-center font-mono font-medium">
                        {orderItems.reduce((s, i) => s + (i.quantity || 1), 0)}
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                        {formatINR(so.total_declared_value)}
                      </td>

                      <td className="py-3 px-4">
                        <SlaBadge tier={so.priority_tier} ageDays={so.max_sr_age} />
                      </td>

                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${getCrmStatusStyle(so.crm_status)}`}>
                          {so.crm_status}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-slate-400 font-mono">
                        {formatDate(so.created_at)}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => printConsignmentManifest(so, orderItems, station)}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium bg-[#1a274c] hover:bg-[#233566] text-cyan-300 border border-cyan-500/30 transition-colors"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          Print Manifest
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {stationOrders.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      No consignments recorded for Station {stationCode}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Items View */}
      {activeView === 'items' && (
        <div className="rounded-xl border border-[#1c2b53] overflow-hidden bg-[#101a35]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0b1329] text-slate-400 border-b border-[#1c2b53]">
                <tr>
                  <th className="py-2.5 px-3">SR Number</th>
                  <th className="py-2.5 px-3">Defective Part No</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Description</th>
                  <th className="py-2.5 px-3">Model</th>
                  <th className="py-2.5 px-3 text-center">Qty</th>
                  <th className="py-2.5 px-3">SO Code</th>
                  <th className="py-2.5 px-3 text-right">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1c2b53]/60 text-slate-300">
                {stationItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-3 font-mono font-medium text-white">{item.sr_number}</td>
                    <td className="py-2.5 px-3 font-mono text-cyan-300">{item.sr_part_number}</td>
                    <td className="py-2.5 px-3 text-slate-200">{item.part_category}</td>
                    <td className="py-2.5 px-3 text-slate-400 max-w-xs truncate">{item.part_description}</td>
                    <td className="py-2.5 px-3">{item.sr_model_name || '-'}</td>
                    <td className="py-2.5 px-3 text-center font-mono">{item.quantity || 1}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-400">{item.shipping_order_code}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-emerald-400">
                      {formatINR((item.estimated_value || 8000) * (item.quantity || 1))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
