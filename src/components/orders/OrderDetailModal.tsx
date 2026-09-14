import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Printer, 
  Truck, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Layers, 
  FileText,
  Barcode,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { ShippingOrder, DefectiveItem, CCIMaster } from '../../types/crm';
import { formatINR, formatDate, getCrmStatusStyle, getScreeningStatusStyle } from '../../lib/utils';
import { SlaBadge } from '../layout/SlaBadge';
import { printConsignmentManifest } from '../../services/manifestGenerator';
import { crmDb } from '../../lib/db';
import { 
  getMotorolaStatusInfo, 
  isAwbIssueRequired,
  getCciActionDetails,
  getCwhActionDetails
} from '../../lib/motorolaStatus';

interface OrderDetailModalProps {
  order: ShippingOrder | null;
  items: DefectiveItem[];
  station?: CCIMaster;
  onClose: () => void;
  onOpenInward?: (order: ShippingOrder) => void;
  onOpenAwbModal?: (order: ShippingOrder) => void;
  onOpenPickupModal?: (order: ShippingOrder) => void;
}

export const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
  order,
  items,
  station,
  onClose,
  onOpenInward,
  onOpenAwbModal,
  onOpenPickupModal,
}) => {
  if (!order) return null;

  const normalize = (s?: string) => (s || '').trim().toLowerCase();
  const initialMatched = useMemo(() => {
    return items.filter(
      (i) =>
        normalize(i.shipping_order_code) === normalize(order.so_code) ||
        (i.shipping_order_id && i.shipping_order_id === order.id)
    );
  }, [items, order.so_code, order.id]);

  const [orderItems, setOrderItems] = useState<DefectiveItem[]>(initialMatched);
  const [isLoadingItems, setIsLoadingItems] = useState<boolean>(initialMatched.length === 0);

  useEffect(() => {
    if (initialMatched.length > 0) {
      setOrderItems(initialMatched);
      setIsLoadingItems(false);
      return;
    }
    let isCancelled = false;
    setIsLoadingItems(true);
    crmDb.fetchItemsForOrder(order.so_code, order.id).then((fetched) => {
      if (!isCancelled) {
        if (fetched.length > 0) {
          setOrderItems(fetched);
        }
        setIsLoadingItems(false);
      }
    }).catch(() => {
      if (!isCancelled) setIsLoadingItems(false);
    });
    return () => {
      isCancelled = true;
    };
  }, [initialMatched, order.so_code, order.id]);

  const totalValue = orderItems.reduce((acc, item) => acc + ((item.estimated_value || 8000) * (item.quantity || 1)), 0);
  const motoInfo = getMotorolaStatusInfo(order.motorola_status);
  const needsAwb = isAwbIssueRequired(order);

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
                <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${motoInfo.badgeClass}`}>
                  {motoInfo.label}
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1a274c] hover:bg-[#233566] text-cyan-300 border border-cyan-500/30 transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              Print Manifest
            </button>

            {onOpenPickupModal && motoInfo.code === 2 && !motoInfo.isDelivered && (order.active_awb || order.excel_ref_awb || order.crm_status !== 'AWB Pending') && (
              <button
                onClick={() => onOpenPickupModal(order)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow transition-all cursor-pointer"
                title="Update AWB number or mark Pickup Done / Not Done"
              >
                <Truck className="w-4 h-4" />
                Pickup / AWB
              </button>
            )}

            {onOpenAwbModal && motoInfo.code === 2 && needsAwb && (
              <button
                onClick={() => onOpenAwbModal(order)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white shadow transition-colors cursor-pointer"
              >
                <Barcode className="w-4 h-4" />
                AWB / Retoken
              </button>
            )}

            {onOpenInward && motoInfo.code === 2 && order.crm_status !== 'CWH Received' && !motoInfo.isDelivered && (
              <button
                onClick={() => onOpenInward(order)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow transition-colors cursor-pointer"
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
          {/* Action Guidance Banner */}
          {order.crm_status === 'Discrepancy Tagged' || motoInfo.code === 6 ? (
            <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 flex items-start gap-3 text-xs">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-rose-300">Discrepancy Flagged during CWH CCTV Unboxing:</span>
                <p className="text-slate-300 mt-1">
                  This consignment has recorded quantity shortages, outer carton issues, or defective part mismatch/damage. Motorola parts status escalated to <strong className="text-rose-300">6. RC Received ASP(Negative)</strong>.
                </p>
                {order.cwh_evidence_ref && (
                  <div className="mt-2 text-[11px] text-indigo-300 font-mono">
                    📹 CCTV Verification Log attached: {order.cwh_evidence_ref}
                  </div>
                )}
              </div>
            </div>
          ) : motoInfo.isDelivered ? (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div className="text-xs">
                <span className="font-bold text-emerald-300">Delivered & Closed Lifecycle:</span>
                <span className="text-slate-300 ml-1.5">
                  Parts have been acknowledged and received by the Repair Center (RC) in Motorola CRM. No further courier dispatch or AWB generation is required.
                </span>
              </div>
            </div>
          ) : motoInfo.code === 4 ? (
            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center gap-3 text-xs">
              <Truck className="w-5 h-5 text-blue-400 shrink-0" />
              <div>
                <span className="font-bold text-blue-300">Dispatched CWH → RC (Lenovo CRM) — Not Actionable for CCI:</span>
                <span className="text-slate-300 ml-1.5">
                  This consignment is an outbound dispatch created by CWH to the Repair Center (RC) in Lenovo CRM. Hence, <strong>it is not actionable for CCI</strong>. Awaiting RC receipt confirmation in Motorola CRM.
                </span>
              </div>
            </div>
          ) : needsAwb ? (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/40 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-xs">
                <Barcode className="w-5 h-5 text-amber-400 shrink-0 animate-pulse" />
                <div>
                  <span className="font-bold text-amber-300">AWB Issuance Required:</span>
                  <span className="text-slate-300 ml-1.5">
                    Delivery Challan (DC) was created by Station in Moto CRM. CWH must issue courier AWB for shipment pickup.
                  </span>
                </div>
              </div>
              {onOpenAwbModal && (
                <button
                  onClick={() => onOpenAwbModal(order)}
                  className="px-3 py-1 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white shrink-0 transition-colors cursor-pointer"
                >
                  Issue AWB Now
                </button>
              )}
            </div>
          ) : motoInfo.code === 2 ? (
            <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-500/40 flex items-center gap-3 text-xs">
              <Truck className="w-5 h-5 text-cyan-400 shrink-0" />
              <div>
                <span className="font-bold text-cyan-300">
                  {order.pickup_status === 'Pickup Done' 
                    ? 'In-Transit Monitoring (CCI):' 
                    : '⚡ Action for CCI — Pickup Handover Pending:'}
                </span>
                <span className="text-slate-300 ml-1.5">
                  {order.pickup_status === 'Pickup Done'
                    ? 'Consignment is in-transit to CWH. CCI to monitor shipment until delivery & updated as "CWH Received" in Moto CRM.'
                    : 'AWB updated from CWH. Handover parcel to courier & update pickup status (Pickup Done / Not Done).'}
                </span>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center gap-3 text-xs text-slate-300">
              <span className="font-semibold text-indigo-300">Status Stage:</span>
              <span>{motoInfo.meaning}</span>
            </div>
          )}

          {/* Metrics ribbon */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
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
                {order.active_awb || order.excel_ref_awb || (motoInfo.isDelivered ? 'Delivered (Direct)' : 'None Assigned')}
              </div>
              <span className="text-[10px] text-slate-400">{order.courier || 'BlueDart Express'}</span>
            </div>

            <div className="p-3 rounded-xl bg-[#101a35] border border-[#1c2b53]">
              <span className="text-xs text-slate-400">Pickup Status</span>
              <div className="mt-1">
                {order.pickup_status === 'Pickup Done' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    Pickup Done
                  </span>
                ) : order.pickup_status === 'Pickup Not Done' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                    Pickup Not Done
                  </span>
                ) : motoInfo.isDelivered ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    Delivered
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
                    <Clock className="w-3.5 h-3.5" />
                    Awaiting Pickup
                  </span>
                )}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block truncate" title={order.pickup_remarks || ''}>
                {order.pickup_date ? formatDate(order.pickup_date) : order.pickup_remarks || (motoInfo.isDelivered ? 'Closed at RC' : 'Handover pending')}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[#101a35] border border-[#1c2b53]">
              <span className="text-xs text-slate-400">Motorola Parts Status</span>
              <div className="text-xs font-semibold text-slate-200 mt-1 truncate" title={motoInfo.meaning}>
                {order.motorola_status || 'CCI Send To CWH'}
              </div>
              <span className="text-[10px] text-slate-400">{motoInfo.meaning}</span>
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
                          {item.item_remarks && (
                            <div className="text-[10px] text-rose-300 mt-1 max-w-[140px] truncate mx-auto" title={item.item_remarks}>
                              ⚠️ {item.item_remarks}
                            </div>
                          )}
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
