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
  Loader2,
  Package,
  RotateCcw,
  AlertOctagon,
  History
} from 'lucide-react';
import { toast } from 'sonner';
import { ShippingOrder, DefectiveItem, CCIMaster, UserProfile, ShippingOrderDetailRecord, AWBHistory } from '../../types/crm';
import { formatINR, formatDate, getCrmStatusStyle, getScreeningStatusStyle } from '../../lib/utils';
import { SlaBadge } from '../layout/SlaBadge';
import { printConsignmentManifest } from '../../services/manifestGenerator';
import { crmDb } from '../../lib/db';
import { 
  getMotorolaStatusInfo, 
  isAwbIssueRequired,
  getCciActionDetails,
  getCwhActionDetails,
  getUnifiedStageDetails,
  getUnifiedPickupStatus
} from '../../lib/motorolaStatus';

interface OrderDetailModalProps {
  order: ShippingOrder | null;
  items: DefectiveItem[];
  station?: CCIMaster;
  user?: UserProfile;
  onClose: () => void;
  onOpenInward?: (order: ShippingOrder) => void;
  onOpenAwbModal?: (order: ShippingOrder) => void;
  onOpenPickupModal?: (order: ShippingOrder) => void;
}

export const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
  order,
  items,
  station,
  user,
  onClose,
  onOpenInward,
  onOpenAwbModal,
  onOpenPickupModal,
}) => {
  if (!order) return null;

  const initialMatched = useMemo(() => {
    const normalize = (s?: string) => (s || '').trim().toLowerCase();
    return items.filter(
      (i) =>
        normalize(i.shipping_order_code) === normalize(order.so_code) ||
        (i.shipping_order_id && i.shipping_order_id === order.id)
    );
  }, [items, order.so_code, order.id]);

  const [orderItems, setOrderItems] = useState<DefectiveItem[]>(initialMatched);
  const [isLoadingItems, setIsLoadingItems] = useState<boolean>(initialMatched.length === 0);
  const [fileDetails, setFileDetails] = useState<ShippingOrderDetailRecord[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<'parts' | 'awb_history'>('parts');
  const [isDebitModalOpen, setIsDebitModalOpen] = useState(false);
  const [debitReasonPreset, setDebitReasonPreset] = useState('Physical Part Missing in Consignment');
  const [debitCustomNotes, setDebitCustomNotes] = useState('');
  const [isProcessingDebit, setIsProcessingDebit] = useState(false);

  // Compute AWB history records for this order (hidden from CCI)
  const effectiveAwbHistory = useMemo(() => {
    const raw = crmDb.getAwbHistory(order.id || order.so_code);
    if (raw && raw.length > 0) {
      return [...raw].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    const currentAwb = order.active_awb || order.excel_ref_awb;
    if (currentAwb) {
      return [{
        id: `synth-${order.id}`,
        shipping_order_id: order.id,
        awb_number: currentAwb,
        courier: order.courier || 'BlueDart Express',
        is_active: true,
        created_at: order.token_issue_date || order.pickup_date || order.created_at || new Date().toISOString(),
        pickup_date: order.pickup_date,
        created_by: 'Logistics Operations',
        cancellation_reason: '',
      }] as AWBHistory[];
    }
    return [];
  }, [order.id, order.so_code, order.active_awb, order.excel_ref_awb, order.courier, order.token_issue_date, order.pickup_date, order.created_at]);

  const handleConfirmDebitPosting = async () => {
    if (!user) return;
    setIsProcessingDebit(true);
    try {
      const finalReason = debitCustomNotes.trim()
        ? `${debitReasonPreset} - ${debitCustomNotes.trim()}`
        : debitReasonPreset;
      crmDb.moveToDebitPosting(order.so_code || order.id, finalReason, user);
      toast.success(`Consignment ${order.so_code} moved to Debit Posting stage!`);
      setIsDebitModalOpen(false);
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to move to Debit Posting');
    } finally {
      setIsProcessingDebit(false);
    }
  };

  const handleRevertDebitPosting = async () => {
    if (!user) return;
    if (!window.confirm(`Are you sure you want to revert ${order.so_code} from Debit Posting back to active pipeline?`)) return;
    try {
      crmDb.revertFromDebitPosting(order.so_code || order.id, user);
      toast.success(`Consignment ${order.so_code} reverted from Debit Posting.`);
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to revert from Debit Posting');
    }
  };

  // Fetch verified line details directly from Supabase Cloud shipping_order_details table
  useEffect(() => {
    let isCancelled = false;
    crmDb.fetchShippingOrderDetails(order.so_code).then((res) => {
      if (!isCancelled) setFileDetails(res);
    });
    return () => { isCancelled = true; };
  }, [order.so_code]);

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
        setOrderItems(fetched);
        setIsLoadingItems(false);
      }
    }).catch(() => {
      if (!isCancelled) {
        setOrderItems([]);
        setIsLoadingItems(false);
      }
    });
    return () => {
      isCancelled = true;
    };
  }, [initialMatched, order.so_code, order.id]);

  const fileSummary = useMemo(() => {
    return crmDb.getShippingOrderFileSummary(order.so_code);
  }, [order.so_code]);

  const itemsCalculatedValue = orderItems.reduce((acc, item) => {
    const val = (item.value && item.value > 0) ? item.value : ((item.estimated_value || 8000) * (item.quantity || 1));
    return acc + val;
  }, 0);

  // If the shipping order file has this SO, respect its file value strictly (even if ₹0.00)
  const totalValue = fileSummary.hasFileRecord
    ? fileSummary.totalValue
    : (order.total_declared_value !== undefined && order.total_declared_value !== null)
    ? order.total_declared_value
    : itemsCalculatedValue;

  const totalItemCount = orderItems.length > 0 
    ? orderItems.length 
    : (order.total_items || 1);

  const totalUnitCount = orderItems.length > 0 
    ? orderItems.reduce((s, i) => s + (i.deliver_qty || i.quantity || 1), 0) 
    : (order.total_items || 1);
  const motoInfo = getMotorolaStatusInfo(order.motorola_status);
  const needsAwb = isAwbIssueRequired(order);
  const stage = getUnifiedStageDetails(order);
  const unifiedPickup = getUnifiedPickupStatus(order);

  // Inward verification is ONLY available when the parcel has left the station / arrived at CWH
  const isEligibleForInward = Boolean(
    onOpenInward &&
    !motoInfo.isDelivered &&
    order.crm_status !== 'CWH to Create DC' &&
    order.crm_status !== 'Pickup Pending' &&
    order.crm_status !== 'Pending AWB' &&
    order.crm_status !== 'Pending AWB Re-Issue' &&
    order.crm_status !== 'CCI to Create DC' &&
    unifiedPickup !== 'Pickup Pending' &&
    unifiedPickup !== 'Pickup Not Done' &&
    (motoInfo.code >= 3 || order.crm_status === 'Delivered at CWH' || order.crm_status === 'Pending Inward at CWH' || order.crm_status === 'In Transit')
  );

  const hasLeg2Started = Boolean(
    order.asp_rc_shipping_order_code ||
    order.asp_rc_ship_date ||
    order.asp_rc_delivered_date ||
    order.rc_receive_remark ||
    motoInfo.code >= 4 ||
    order.crm_status === 'Delivered to RC' ||
    order.crm_status === 'Delivered to RC (Discrepancies)'
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-sky-50 border border-sky-200 text-[#001489]">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900 font-mono">{order.so_code}</h2>
                {order.delivery_challan_code && (
                  <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-blue-50 text-blue-800 border border-blue-200" title="Delivery Challan Code">
                    DC: {order.delivery_challan_code}
                  </span>
                )}
                <SlaBadge tier={order.priority_tier} ageDays={order.max_sr_age} />
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${stage.badgeClass}`} title={stage.meaning}>
                  {stage.stageName}
                </span>
                <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${motoInfo.badgeClass}`}>
                  {motoInfo.label}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Station: <strong className="text-slate-800">{order.station_code}</strong> ({station?.station_name || 'Service Center'}) • {(station?.city || order.city) ? `${station?.city || order.city}, ` : ''}{(station?.state || order.state) ? `${station?.state || order.state} • ` : ''}Region: <strong className="text-sky-800">{station?.region || order.region || 'West'}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {orderItems.length > 0 && (
              <button
                disabled={motoInfo.code === 1}
                onClick={() => {
                  if (motoInfo.code === 1) return;
                  printConsignmentManifest(order, orderItems, station);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border shadow-xs transition-colors ${
                  motoInfo.code === 1
                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 cursor-pointer'
                }`}
                title={
                  motoInfo.code === 1
                    ? 'Manifest cannot be printed: Create Delivery Challan in Motorola CRM first'
                    : 'Print physical manifest for dispatch'
                }
              >
                <Printer className={`w-4 h-4 ${motoInfo.code === 1 ? 'text-slate-400' : 'text-slate-600'}`} />
                Print Manifest
              </button>
            )}

            {/* CCI station handover pickup button - hidden for CWH operators or once delivered to CWH */}
            {onOpenPickupModal && user?.role !== 'CWH' && motoInfo.code === 2 && !motoInfo.isDelivered && (order.active_awb || order.excel_ref_awb || order.crm_status !== 'Pending AWB') && order.crm_status !== 'Delivered at CWH' && order.crm_status !== 'Pending Inward at CWH' && order.crm_status !== 'CWH to Create DC' && (
              <button
                onClick={() => onOpenPickupModal(order)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all cursor-pointer"
                title="Update AWB number or mark Pickup Done / Not Done"
              >
                <Truck className="w-4 h-4" />
                Pickup / AWB
              </button>
            )}

            {/* AWB modal / Retoken button */}
            {onOpenAwbModal && !motoInfo.isDelivered && (
              (user?.role === 'CWH' && motoInfo.code <= 3 && order.crm_status !== 'CWH to Create DC') ||
              (user?.role !== 'CWH' && motoInfo.code === 2 && needsAwb)
            ) && (
              <button
                onClick={() => onOpenAwbModal(order)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#001489] hover:bg-[#08209e] text-white shadow-xs transition-colors cursor-pointer"
                title="Edit or Retoken AWB Docket Number"
              >
                <Barcode className="w-4 h-4" />
                {user?.role === 'CWH' ? 'Edit AWB' : 'AWB / Retoken'}
              </button>
            )}

            {/* Inward verification - ONLY visible when eligible (arrived / in-transit, not pickup pending) */}
            {isEligibleForInward && onOpenInward && (
              <button
                onClick={() => onOpenInward(order)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-700 hover:bg-purple-800 text-white shadow-xs transition-colors cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                Verify Inward
              </button>
            )}

            {/* Debit Posting Actions - For CWH and Admin */}
            {(user?.role === 'CWH' || user?.role === 'ADMIN') && (
              order.crm_status === 'Debit Posting' ? (
                <button
                  onClick={handleRevertDebitPosting}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-colors cursor-pointer"
                  title="Revert consignment from Debit Posting back to active pipeline"
                >
                  <RotateCcw className="w-4 h-4" />
                  Revert from Debit
                </button>
              ) : (
                <button
                  onClick={() => setIsDebitModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-colors cursor-pointer"
                  title="Flag and move to Debit Posting stage (Debit to CCI)"
                >
                  <AlertOctagon className="w-4 h-4" />
                  Debit to CCI
                </button>
              )
            )}

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body & Metrics */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Debit Posting Banner */}
          {order.crm_status === 'Debit Posting' ? (
            <div className="p-3.5 rounded-xl bg-rose-50 border-2 border-rose-300 flex items-start gap-3 text-xs shadow-xs">
              <AlertOctagon className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-rose-900 text-sm">Debit Posting Stage (Debit to CCI Station)</span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-200 text-rose-800 border border-rose-300">
                    DEBIT ACTIVE
                  </span>
                </div>
                <p className="text-rose-800 mt-1">
                  This consignment has been flagged for commercial debit to the originating CCI station (e.g. missing parts, physical damage, CID, or IMEI mismatch). It is held outside standard dispatch pipelines and Motorola dump syncs.
                </p>
                {order.cwh_evidence_ref && (
                  <div className="mt-2 text-[11px] text-rose-900 font-mono bg-rose-100/70 p-2 rounded-lg border border-rose-200">
                    <strong>Recorded Reason / Reference:</strong> {order.cwh_evidence_ref}
                  </div>
                )}
              </div>
            </div>
          ) : order.crm_status === 'Discrepancies' || order.crm_status === 'Delivered to RC (Discrepancies)' || motoInfo.code === 35 || motoInfo.code === 6 ? (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3 text-xs shadow-xs">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-rose-900">CWH Inward Discrepancy Flagged:</span>
                <p className="text-rose-800 mt-1">
                  This consignment recorded quantity shortage, outer carton issues, or defective part mismatch/damage. Status is <strong className="text-rose-900 font-mono">Discrepancies</strong>.
                </p>
                {order.cwh_evidence_ref && (
                  <div className="mt-2 text-[11px] text-sky-800 font-mono">
                    📹 CCTV Reference / Link: {order.cwh_evidence_ref}
                  </div>
                )}
              </div>
            </div>
          ) : motoInfo.isDelivered ? (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-3 shadow-xs">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div className="text-xs">
                <span className="font-bold text-emerald-900">Delivered &amp; Closed Lifecycle:</span>
                <span className="text-emerald-800 ml-1.5">
                  Parts have been acknowledged and received by the Repair Center (RC) in Motorola CRM. No further courier dispatch or AWB generation is required.
                </span>
              </div>
            </div>
          ) : motoInfo.code === 4 ? (
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 flex items-center gap-3 text-xs shadow-xs">
              <Truck className="w-5 h-5 text-blue-600 shrink-0" />
              <div>
                <span className="font-bold text-blue-900">CWH Shipped to RC (Lenovo CRM) — Not Actionable for CCI:</span>
                <span className="text-blue-800 ml-1.5">
                  This consignment is an outbound dispatch created by CWH to the Repair Center (RC) in Lenovo CRM. Hence, <strong>it is not actionable for CCI</strong>. Awaiting RC receipt confirmation in Motorola CRM.
                </span>
              </div>
            </div>
          ) : needsAwb ? (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 flex items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-2.5 text-xs">
                <Barcode className="w-5 h-5 text-amber-700 shrink-0" />
                <div>
                  <span className="font-bold text-amber-900">AWB Issuance Required:</span>
                  <span className="text-amber-800 ml-1.5">
                    Delivery Challan (DC) was created by Station in Moto CRM. CWH must issue courier AWB for shipment pickup.
                  </span>
                </div>
              </div>
              {onOpenAwbModal && (
                <button
                  onClick={() => onOpenAwbModal(order)}
                  className="px-3 py-1 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white shrink-0 transition-colors shadow-xs cursor-pointer"
                >
                  Issue AWB Now
                </button>
              )}
            </div>
          ) : motoInfo.code === 2 ? (
            user?.role === 'CWH' ? (
              <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 flex items-center gap-3 text-xs shadow-xs">
                <Truck className="w-5 h-5 text-sky-700 shrink-0" />
                <div>
                  <span className="font-bold text-sky-900">
                    {order.crm_status === 'Pending Inward at CWH'
                      ? 'CCTV Inward Complete — Awaiting Motorola CRM Receipt:'
                      : order.crm_status === 'Delivered at CWH'
                      ? 'Delivered at CWH Dock — Staged for CCTV Screening:'
                      : unifiedPickup === 'Pickup Done' || order.crm_status === 'In Transit'
                      ? 'Consignment In-Transit to CWH:'
                      : `Awaiting Courier Pickup at Station (${order.station_code}):`}
                  </span>
                  <span className="text-sky-800 ml-1.5">
                    {order.crm_status === 'Pending Inward at CWH'
                      ? 'Physical verification completed clean under CCTV bay. Please enter receipt in Motorola CRM to advance status to "CWH Received" and unlock DC creation to RC.'
                      : order.crm_status === 'Delivered at CWH'
                      ? 'Consignment arrived at CWH dock from courier. Please proceed to CCTV bay for unboxing and line-item screening.'
                      : unifiedPickup === 'Pickup Done' || order.crm_status === 'In Transit'
                      ? `Dispatched from ${order.station_code} via ${order.courier || 'courier'}. Consignment is en-route to Central Warehouse. Acknowledge delivery upon arrival at dock.`
                      : `AWB token (${order.active_awb || order.excel_ref_awb || 'Assigned'}) is generated. Station is packing and handing over parcel to courier. Inward verification will activate once in-transit.`}
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 flex items-center gap-3 text-xs shadow-xs">
                <Truck className="w-5 h-5 text-sky-700 shrink-0" />
                <div>
                  <span className="font-bold text-sky-900">
                    {order.pickup_status === 'Pickup Done' 
                      ? 'In-Transit Monitoring (CCI):' 
                      : '⚡ Action for CCI — Pickup Handover Pending:'}
                  </span>
                  <span className="text-sky-800 ml-1.5">
                    {order.pickup_status === 'Pickup Done'
                      ? 'Consignment is in-transit to CWH. CCI to monitor shipment until delivery & updated as "CWH Received" in Moto CRM.'
                      : 'AWB updated from CWH. Handover parcel to courier & update pickup status (Pickup Done / Not Done).'}
                  </span>
                </div>
              </div>
            )
          ) : motoInfo.code === 1 ? (
            <div className="p-3.5 rounded-xl bg-amber-50/90 border border-amber-200 flex items-start gap-3 text-xs shadow-xs">
              <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-amber-950">⚡ Action for CCI — Create Delivery Challan (DC) in Moto CRM:</span>
                <p className="text-amber-800 mt-0.5 leading-relaxed">
                  Defective parts are accumulated at the service station. CCI must create an official Delivery Challan (DC) in Motorola CRM to generate the Motorola SO Number. Once created, CWH will assign an AWB for courier pickup.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 flex items-center gap-3 text-xs text-slate-700">
              <span className="font-semibold text-slate-900">Status Stage:</span>
              <span>{motoInfo.meaning}</span>
            </div>
          )}

          {/* Metrics ribbon */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-xs text-slate-500">Declared Value</span>
              <div className="text-lg font-bold text-slate-900 font-mono mt-0.5">
                {formatINR(totalValue)}
              </div>
              {fileSummary.hasFileRecord ? (
                <span className="inline-block mt-1 text-[10px] text-blue-800 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 font-medium">
                  Verified SO File
                </span>
              ) : order.eway_bill_required ? (
                <span className="inline-block mt-1 text-[10px] text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-300 font-medium">
                  E-Way Bill Required (≥ ₹50K)
                </span>
              ) : null}
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-xs text-slate-500">Total Items / Qty</span>
              <div className="text-lg font-bold text-slate-900 font-mono mt-0.5">
                {totalItemCount} items ({totalUnitCount} units)
              </div>
              <span className="text-[10px] text-slate-500">Constituent line items</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-xs text-slate-500">Active AWB &amp; Courier</span>
              <div className="text-sm font-bold text-sky-800 font-mono mt-1 truncate">
                {order.active_awb || order.excel_ref_awb || (motoInfo.isDelivered ? 'Delivered' : 'Pending CWH AWB')}
              </div>
              <span className="text-[10px] text-slate-500">
                {(order.active_awb || order.excel_ref_awb) ? (order.courier || '-') : '-'}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-xs text-slate-500">Pickup Status</span>
              <div className="mt-1">
                {unifiedPickup === '-' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">
                    -
                  </span>
                ) : unifiedPickup === 'Pickup Done' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Pickup Done
                  </span>
                ) : unifiedPickup === 'Pickup Not Done' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-300">
                    <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                    Pickup Not Done
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300">
                    <Clock className="w-3.5 h-3.5" />
                    Pickup Pending
                  </span>
                )}
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block truncate" title={order.pickup_remarks || ''}>
                {unifiedPickup === '-'
                  ? 'No action required from service center'
                  : motoInfo.code >= 3
                  ? (order.pickup_date ? formatDate(order.pickup_date) : 'No CCI action required')
                  : (order.pickup_date ? formatDate(order.pickup_date) : order.pickup_remarks || 'Handover pending')}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-xs text-slate-500">Motorola Parts Status</span>
              <div className="text-xs font-semibold text-slate-800 mt-1 truncate" title={motoInfo.meaning}>
                {order.motorola_status || 'CCI Send To CWH'}
              </div>
              <span className="text-[10px] text-slate-500">{motoInfo.meaning}</span>
            </div>
          </div>

          {/* Two-Leg Journey Tracking (Leg 1: CCI -> CWH & Leg 2: CWH -> RC) */}
          <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-[#001489]" />
                Two-Leg Logistics Architecture (Motorola End-to-End Tracking)
              </h4>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${getCrmStatusStyle(order.crm_status)}`}>
                {order.crm_status}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Leg 1 Box */}
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-sky-600" />
                    Leg 1: Service Station → CWH Inward
                  </span>
                  <span className="font-mono text-[11px] text-sky-800 font-semibold">{order.so_code}</span>
                </div>
                <div className="text-[11px] text-slate-600 grid grid-cols-2 gap-1 pt-1 border-t border-slate-200">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Logistics Partner</span>
                    <span className="font-medium text-slate-800">
                      {(order.active_awb || order.excel_ref_awb) ? (order.courier || '-') : '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">AWB Tracking Token</span>
                    <span className="font-mono font-medium text-sky-700">
                      {order.active_awb || order.excel_ref_awb || (motoInfo.isDelivered ? 'Delivered' : 'Pending CWH AWB')}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Pickup Status</span>
                    <span className="font-medium text-slate-800">
                      {motoInfo.code === 1 ? '-' : (motoInfo.code >= 3 && !order.pickup_status ? '-' : (order.pickup_status || 'Handover Pending'))}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Pickup Date</span>
                    <span className="font-mono text-slate-700">{order.pickup_date ? formatDate(order.pickup_date) : '-'}</span>
                  </div>
                </div>
              </div>

              {/* Leg 2 Box */}
              {hasLeg2Started ? (
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-purple-600" />
                      Leg 2: Central Warehouse → Repair Center (RC)
                    </span>
                    <span className="font-mono text-[11px] text-purple-800 font-semibold">
                      {order.asp_rc_shipping_order_code || 'Pending DC'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 grid grid-cols-2 gap-2 pt-1 border-t border-slate-200">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Logistics Partner</span>
                      <span className="font-medium text-slate-800">
                        {order.asp_outbound_awb ? (order.courier || '-') : '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Outbound Docket / AWB</span>
                      <span className="font-mono text-blue-800 font-semibold">
                        {order.asp_outbound_awb || 'Awaiting Docket'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Logistics Pickup Date</span>
                      <span className="font-mono text-slate-700">
                        {order.asp_rc_pickup_date ? formatDate(order.asp_rc_pickup_date) : (order.asp_rc_ship_date ? formatDate(order.asp_rc_ship_date) : 'Pending Pickup')}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">RC Delivery Date</span>
                      <span className="font-mono text-emerald-700 font-medium">
                        {order.asp_rc_delivered_date ? formatDate(order.asp_rc_delivered_date) : (order.asp_outbound_awb ? 'In Transit' : '-')}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">RC GRN Inward Time</span>
                      <span className="font-mono text-purple-700 font-semibold">
                        {order.so_grn_time ? formatDate(order.so_grn_time) : 'Awaiting RC GRN'}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-slate-400 block text-[10px]">RC Acknowledgment / Remark</span>
                      <span className="text-slate-700 truncate block" title={order.rc_receive_remark || '-'}>
                        {order.rc_receive_remark || '-'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-slate-50/70 border border-dashed border-slate-200 flex flex-col justify-center text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-600 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-slate-300" />
                      Leg 2: Central Warehouse → Repair Center (RC)
                    </span>
                    <span className="text-[10px] font-semibold text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded">Not Started</span>
                  </div>
                  <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-200/60 leading-relaxed">
                    Consignment is currently in Leg 1. Outbound DC to Lenovo RC will be initiated once verified at CWH.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Sub-Tabs: Constituent Parts vs AWB History (strictly hidden from CCI) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 mb-3 pb-2 gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveSubTab('parts')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeSubTab === 'parts' || user?.role === 'CCI'
                    ? 'bg-blue-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Constituent Parts ({totalItemCount})</span>
              </button>

              {/* AWB History tab - strictly hidden from CCI */}
              {user?.role !== 'CCI' && (
                <button
                  type="button"
                  onClick={() => setActiveSubTab('awb_history')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    activeSubTab === 'awb_history'
                      ? 'bg-blue-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  <span>AWB History &amp; Retokens</span>
                  <span className={`px-2 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                    effectiveAwbHistory.length > 1
                      ? 'bg-amber-400 text-amber-950'
                      : 'bg-blue-800 text-blue-100'
                  }`}>
                    {effectiveAwbHistory.length} {effectiveAwbHistory.length === 1 ? 'AWB' : 'AWBs'}
                  </span>
                </button>
              )}
            </div>

            {(activeSubTab === 'parts' || user?.role === 'CCI') ? (
              <span className="text-xs text-slate-500 font-mono hidden sm:inline">
                Composite Key: <code className="text-[#001489]">SR#_DefectivePart#_IssuedPart#</code>
              </span>
            ) : (
              <span className="text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full hidden sm:inline">
                🔒 CWH &amp; Admin Internal Audit (Hidden from CCI)
              </span>
            )}
          </div>

          {/* TAB CONTENT 1: Constituent Parts (Visible to ALL, including CCI) */}
          {(activeSubTab === 'parts' || user?.role === 'CCI') && (
            <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100/90 text-slate-600 border-b border-slate-200 font-mono text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">SR Number</th>
                      <th className="py-2.5 px-3">Defective Part No</th>
                      <th className="py-2.5 px-3">Issued Part No</th>
                      <th className="py-2.5 px-3">DC Code</th>
                      <th className="py-2.5 px-3">Category &amp; Description</th>
                      <th className="py-2.5 px-3">Model</th>
                      <th className="py-2.5 px-3">Fault</th>
                      <th className="py-2.5 px-3 text-center">Qty</th>
                      <th className="py-2.5 px-3 text-right">Value (INR)</th>
                      <th className="py-2.5 px-3 text-center">Screening</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-slate-700">
                    {orderItems.map((item) => {
                      const cleanPn = (s?: string) => String(s || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
                      const matchedFileRow = fileDetails.find(
                        (f) => cleanPn(f.item_code) === cleanPn(item.new_part_number) || cleanPn(f.item_code) === cleanPn(item.sr_part_number)
                      );

                      const displayQty = matchedFileRow
                        ? matchedFileRow.deliver_qty
                        : (item.deliver_qty ?? item.quantity ?? 1);
                      const displayValue = matchedFileRow
                        ? matchedFileRow.value
                        : (item.value && item.value > 0)
                        ? item.value
                        : ((item.estimated_value || 8000) * (item.quantity || 1));
                      const dcCode = matchedFileRow?.delivery_challan_code || item.delivery_challan_code || order.delivery_challan_code;

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-2.5 px-3 font-mono font-medium text-slate-900">{item.sr_number}</td>
                          <td className="py-2.5 px-3 font-mono text-sky-700 font-medium">{item.sr_part_number}</td>
                          <td className="py-2.5 px-3 font-mono text-slate-500">{item.new_part_number || '-'}</td>
                          <td className="py-2.5 px-3 font-mono">
                            {dcCode ? (
                              <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 text-[10px] font-bold">
                                {dcCode}
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 max-w-xs truncate">
                            <div className="font-semibold text-slate-800">{item.part_category}</div>
                            <div className="text-[11px] text-slate-500 truncate">{item.part_description}</div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">{item.sr_model_name || '-'}</td>
                          <td className="py-2.5 px-3 max-w-[160px] truncate text-slate-500" title={item.sr_fault_description}>
                            {item.sr_fault_description || '-'}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono text-slate-900 font-semibold">{displayQty}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                            <div>{formatINR(displayValue)}</div>
                            {matchedFileRow ? (
                              <span className="text-[9px] font-normal text-blue-700 bg-blue-50 px-1 py-0.2 rounded border border-blue-200">
                                SO File
                              </span>
                            ) : item.value && item.value > 0 ? (
                              <span className="text-[9px] font-normal text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200">
                                DC Matched
                              </span>
                            ) : null}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${getScreeningStatusStyle(item.screening_status)}`}>
                              {item.screening_status}
                            </span>
                            {item.item_remarks && (
                              <div className="text-[10px] text-rose-700 mt-1 max-w-[140px] truncate mx-auto" title={item.item_remarks}>
                                ⚠️ {item.item_remarks}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {isLoadingItems && (
                      <tr>
                        <td colSpan={10} className="py-8 text-center text-slate-500">
                          <div className="flex items-center justify-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-sky-600" />
                            <span>Loading constituent parts for {order.so_code}...</span>
                          </div>
                        </td>
                      </tr>
                    )}
                    {!isLoadingItems && orderItems.length === 0 && (
                      <tr>
                        <td colSpan={10} className="py-8 px-4 text-center bg-slate-50/50">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <div className="p-3 bg-white rounded-full border border-slate-200 shadow-2xs">
                              <Package className="w-6 h-6 text-sky-700" />
                            </div>
                            <span className="font-semibold text-slate-800 text-sm">
                              Consignment Parcel ({totalItemCount} units • {formatINR(totalValue)})
                            </span>
                            <p className="text-xs text-slate-500 max-w-md">
                              Direct line items are registered at the consignment level. Physical part serial numbers and fault inspections will be scanned and verified during CWH inward unboxing.
                            </p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB CONTENT 2: AWB History & Retoken Ledger (Hidden strictly from CCI) */}
          {activeSubTab === 'awb_history' && user?.role !== 'CCI' && (
            <div className="space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-200">
                  <span className="text-[11px] font-medium text-blue-800 block">Total AWBs Issued</span>
                  <div className="text-xl font-bold font-mono text-blue-900 mt-0.5">
                    {effectiveAwbHistory.length}
                  </div>
                  <span className="text-[10px] text-blue-600">
                    {effectiveAwbHistory.length > 1 ? `${effectiveAwbHistory.length - 1} Retokens recorded` : 'Single token issued'}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[11px] font-medium text-slate-600 block">Active Tracking Docket</span>
                  <div className="text-sm font-bold font-mono text-slate-900 mt-1 truncate">
                    {order.active_awb || order.excel_ref_awb || 'Pending AWB'}
                  </div>
                  <span className="text-[10px] text-slate-500">
                    {order.courier || 'BlueDart Express'}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[11px] font-medium text-slate-600 block">Token Issue Date</span>
                  <div className="text-xs font-bold font-mono text-slate-800 mt-1">
                    {order.token_issue_date || (order.pickup_date ? order.pickup_date.slice(0, 10) : '-') || '-'}
                  </div>
                  <span className="text-[10px] text-slate-500">
                    Handover: {order.pickup_date ? order.pickup_date.slice(0, 10) : 'Pending'}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[11px] font-medium text-slate-600 block">Access Permission</span>
                  <div className="text-xs font-bold text-emerald-700 mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>CWH / Admin Only</span>
                  </div>
                  <span className="text-[10px] text-slate-500">
                    Hidden from Service Centers
                  </span>
                </div>
              </div>

              {/* AWB Retokening Timeline & Audit Table */}
              <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-xs">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Barcode className="w-4 h-4 text-blue-800" />
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      AWB Generation &amp; Retoken History Audit Ledger
                    </h4>
                  </div>
                  {onOpenAwbModal && user?.role === 'CWH' && (
                    <button
                      type="button"
                      onClick={() => onOpenAwbModal(order)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-blue-800 hover:bg-blue-900 text-white transition-colors cursor-pointer shadow-xs"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Retoken / Generate New AWB</span>
                    </button>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100/90 text-slate-600 border-b border-slate-200 font-mono text-[11px] uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-3">AWB Docket Number</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Courier</th>
                        <th className="py-2.5 px-3">Token Issue Date</th>
                        <th className="py-2.5 px-3">Pickup Date</th>
                        <th className="py-2.5 px-3">Cancellation / Retoken Reason</th>
                        <th className="py-2.5 px-3">Created By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-slate-700">
                      {effectiveAwbHistory.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-slate-500">
                            <div className="flex flex-col items-center justify-center gap-1.5">
                              <Barcode className="w-5 h-5 text-slate-400" />
                              <span className="text-xs font-semibold text-slate-700">No AWB has been issued yet</span>
                              <p className="text-[11px] text-slate-500">
                                When CWH generates a courier tracking token for this order, its issuance and any subsequent re-tokenings will be logged here.
                              </p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        effectiveAwbHistory.map((awb, index) => (
                          <tr key={awb.id || awb.awb_number || index} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-2.5 px-3 font-mono text-slate-500">
                              {index + 1}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold">
                              <div className="flex items-center gap-1.5 text-blue-900">
                                <Barcode className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                                <span>{awb.awb_number}</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border inline-flex items-center gap-1 ${
                                awb.is_active
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                  : 'bg-rose-50 text-rose-800 border-rose-300'
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${awb.is_active ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                {awb.is_active ? 'Active Docket' : 'Cancelled / Retokened'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-medium text-slate-800">
                              {awb.courier || order.courier || 'BlueDart Express'}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-700">
                              {awb.created_at ? awb.created_at.slice(0, 19).replace('T', ' ') : '-'}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-700">
                              {awb.pickup_date ? awb.pickup_date.slice(0, 10) : (order.pickup_date ? order.pickup_date.slice(0, 10) : '-')}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate" title={awb.cancellation_reason || '-'}>
                              {awb.cancellation_reason || (awb.is_active ? '-' : 'Retokened for new pickup cycle')}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-600 text-[11px]">
                              {awb.created_by || 'CWH Operations'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-slate-50 text-xs text-slate-500">
          <div>
            Created: <span className="text-slate-700 font-mono">{formatDate(order.created_at)}</span> • Last Updated: <span className="text-slate-700 font-mono">{formatDate(order.updated_at)}</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-medium transition-colors shadow-xs cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      {/* Debit Posting Reason Confirmation Dialog */}
      {isDebitModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-rose-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-rose-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <AlertOctagon className="w-5 h-5" />
                <h3 className="font-bold text-base">Debit to CCI Station</h3>
              </div>
              <button
                onClick={() => setIsDebitModalOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900">
                <p className="font-semibold">⚠️ Attention:</p>
                <p className="mt-0.5">
                  Moving consignment <strong className="font-mono">{order.so_code}</strong> to <strong>Debit Posting</strong> will freeze its dispatch status across the CRM and protect it from Motorola CRM dump overwrites.
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  Select Debit Primary Reason <span className="text-rose-500">*</span>
                </label>
                <select
                  value={debitReasonPreset}
                  onChange={(e) => setDebitReasonPreset(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-slate-50 font-medium text-slate-800 focus:ring-2 focus:ring-rose-500 focus:outline-none"
                >
                  <option value="Physical Part Missing in Consignment">Physical Part Missing in Consignment</option>
                  <option value="Physical or Liquid Damage by CCI Station">Physical or Liquid Damage by CCI Station</option>
                  <option value="Customer Induced Damage (CID) Non-Returnable">Customer Induced Damage (CID) Non-Returnable</option>
                  <option value="Serial Number / IMEI Mismatch with Motorola CRM">Serial Number / IMEI Mismatch with Motorola CRM</option>
                  <option value="SLA Non-Dispatch Penalty Debit">SLA Non-Dispatch Penalty Debit</option>
                  <option value="Other / Custom Reason">Other / Custom Reason</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  Additional Notes / CCTV Reference / Serial Numbers
                </label>
                <textarea
                  value={debitCustomNotes}
                  onChange={(e) => setDebitCustomNotes(e.target.value)}
                  rows={3}
                  placeholder="Enter specific missing parts, box condition, CCTV incident ref, or explanation..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-normal text-slate-800 focus:ring-2 focus:ring-rose-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsDebitModalOpen(false)}
                disabled={isProcessingDebit}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDebitPosting}
                disabled={isProcessingDebit}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                <AlertOctagon className="w-4 h-4" />
                {isProcessingDebit ? 'Processing...' : 'Confirm Debit Posting'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
