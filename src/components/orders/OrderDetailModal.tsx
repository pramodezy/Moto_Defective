import React from 'react';
import { 
  X, 
  Printer, 
  Truck, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Layers, 
  FileText,
  Barcode
} from 'lucide-react';
import { ShippingOrder, DefectiveItem, CCIMaster } from '../../types/crm';
import { formatINR, formatDate, getCrmStatusStyle, getScreeningStatusStyle } from '../../lib/utils';
import { SlaBadge } from '../layout/SlaBadge';
import { printConsignmentManifest } from '../../services/manifestGenerator';

interface OrderDetailModalProps {
  order: ShippingOrder | null;
  items: DefectiveItem[];
  station?: CCIMaster;
  onClose: () => void;
  onOpenInward?: (order: ShippingOrder) => void;
  onOpenAwbModal?: (order: ShippingOrder) => void;
}

export const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
  order,
  items,
  station,
  onClose,
  onOpenInward,
  onOpenAwbModal,
}) => {
  if (!order) return null;

  const orderItems = items.filter((i) => i.shipping_order_code === order.so_code);
  const totalValue = orderItems.reduce((acc, item) => acc + ((item.estimated_value || 8000) * (item.quantity || 1)), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl bg-[#0b1329] border border-[#1f2e5a] shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1f2e5a] bg-[#101a35]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white font-mono">{order.so_code}</h2>
                <SlaBadge tier={order.priority_tier} ageDays={order.max_sr_age} />
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getCrmStatusStyle(order.crm_status)}`}>
                  {order.crm_status}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Station: <strong className="text-slate-200">{order.station_code}</strong> ({station?.station_name || 'Service Center'}) • {(station?.city || order.city) ? `${station?.city || order.city}, ` : ''}{(station?.state || order.state) ? `${station?.state || order.state} • ` : ''}Region: <strong className="text-cyan-400">{station?.region || order.region || 'West'}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => printConsignmentManifest(order, orderItems, station)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1a274c] hover:bg-[#233566] text-cyan-300 border border-cyan-500/30 transition-colors"
            >
              <Printer className="w-4 h-4" />
              Print Manifest
            </button>

            {onOpenAwbModal && (
              <button
                onClick={() => onOpenAwbModal(order)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white shadow transition-colors"
              >
                <Barcode className="w-4 h-4" />
                AWB / Retoken
              </button>
            )}

            {onOpenInward && order.crm_status !== 'CWH Received' && (
              <button
                onClick={() => onOpenInward(order)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                Verify Inward
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body & Metrics */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Metrics ribbon */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 rounded-xl bg-[#101a35] border border-[#1c2b53]">
              <span className="text-xs text-slate-400">Declared Value</span>
              <div className="text-lg font-bold text-white font-mono mt-0.5">
                {formatINR(totalValue || order.total_declared_value)}
              </div>
              {order.eway_bill_required && (
                <span className="inline-block mt-1 text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                  E-Way Bill Required (≥ ₹50K)
                </span>
              )}
            </div>

            <div className="p-3 rounded-xl bg-[#101a35] border border-[#1c2b53]">
              <span className="text-xs text-slate-400">Total Items / Qty</span>
              <div className="text-lg font-bold text-white font-mono mt-0.5">
                {orderItems.length} items ({orderItems.reduce((s, i) => s + (i.quantity || 1), 0)} units)
              </div>
              <span className="text-[10px] text-slate-400">Constituent line items</span>
            </div>

            <div className="p-3 rounded-xl bg-[#101a35] border border-[#1c2b53]">
              <span className="text-xs text-slate-400">Active AWB & Courier</span>
              <div className="text-sm font-bold text-cyan-400 font-mono mt-1 truncate">
                {order.active_awb || order.excel_ref_awb || 'None Assigned'}
              </div>
              <span className="text-[10px] text-slate-400">{order.courier || 'BlueDart Express'}</span>
            </div>

            <div className="p-3 rounded-xl bg-[#101a35] border border-[#1c2b53]">
              <span className="text-xs text-slate-400">Motorola Parts Status</span>
              <div className="text-xs font-semibold text-slate-200 mt-1 truncate">
                {order.motorola_status || 'CCI Send To CWH'}
              </div>
              <span className="text-[10px] text-slate-400">Synced from Defective Dump</span>
            </div>
          </div>

          {/* Constituent Line Items Table */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                Constituent Defective Line Items ({orderItems.length})
              </h3>
              <span className="text-xs text-slate-400">
                Composite Key: <code className="text-cyan-400">SR#_DefectivePart#_IssuedPart#</code>
              </span>
            </div>

            <div className="rounded-xl border border-[#1c2b53] overflow-hidden bg-[#101a35]">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#0b1329] text-slate-400 border-b border-[#1c2b53]">
                    <tr>
                      <th className="py-2.5 px-3">SR Number</th>
                      <th className="py-2.5 px-3">Defective Part No</th>
                      <th className="py-2.5 px-3">Issued Part No</th>
                      <th className="py-2.5 px-3">Category & Description</th>
                      <th className="py-2.5 px-3">Model</th>
                      <th className="py-2.5 px-3">Fault</th>
                      <th className="py-2.5 px-3 text-center">Qty</th>
                      <th className="py-2.5 px-3 text-right">Est. Value</th>
                      <th className="py-2.5 px-3 text-center">Screening</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1c2b53]/60 text-slate-300">
                    {orderItems.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-2.5 px-3 font-mono font-medium text-white">{item.sr_number}</td>
                        <td className="py-2.5 px-3 font-mono text-cyan-300">{item.sr_part_number}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-400">{item.new_part_number || '-'}</td>
                        <td className="py-2.5 px-3 max-w-xs truncate">
                          <div className="font-semibold text-slate-200">{item.part_category}</div>
                          <div className="text-[11px] text-slate-400 truncate">{item.part_description}</div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-300">{item.sr_model_name || '-'}</td>
                        <td className="py-2.5 px-3 max-w-[160px] truncate text-slate-400" title={item.sr_fault_description}>
                          {item.sr_fault_description || '-'}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono">{item.quantity || 1}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-emerald-400">
                          {formatINR((item.estimated_value || 8000) * (item.quantity || 1))}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${getScreeningStatusStyle(item.screening_status)}`}>
                            {item.screening_status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {orderItems.length === 0 && (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-500">
                          No line items found for this shipping order.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-[#1f2e5a] bg-[#101a35]/80 text-xs text-slate-400">
          <div>
            Created: <span className="text-slate-300 font-mono">{formatDate(order.created_at)}</span> • Last Updated: <span className="text-slate-300 font-mono">{formatDate(order.updated_at)}</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
