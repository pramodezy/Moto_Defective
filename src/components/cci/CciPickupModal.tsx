import React, { useState } from 'react';
import { 
  X, 
  Truck, 
  CheckCircle2, 
  AlertTriangle, 
  Barcode, 
  Clock, 
  FileText, 
  UserCheck, 
  Info,
  Layers,
  ArrowRight
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { ShippingOrder, DefectiveItem, CCIMaster, PickupStatus, UserProfile } from '../../types/crm';
import { formatINR, formatDate, getCrmStatusStyle } from '../../lib/utils';
import { SlaBadge } from '../layout/SlaBadge';

interface CciPickupModalProps {
  order: ShippingOrder | null;
  items: DefectiveItem[];
  station?: CCIMaster;
  user: UserProfile;
  onClose: () => void;
  onSubmitPickupAction: (
    soId: string,
    data: {
      pickupStatus: PickupStatus;
      newAwb?: string;
      courier?: string;
      remarks?: string;
    }
  ) => void;
}

const COMMON_PICKUP_FAIL_REASONS = [
  'Courier executive did not arrive / missed scheduled pickup',
  'AWB label barcode unreadable / reprint required',
  'Courier refused parcel due to weight / volume discrepancy',
  'Package carton damaged / repacking needed',
  'Service center closed during courier arrival',
  'Other operational delay',
];

const COURIER_OPTIONS = [
  'BlueDart Express',
  'Delhivery Surface',
  'DTDC Express',
  'FedEx India',
  'Shadowfax Logistics',
  'XpressBees',
  'Safechem Logistics',
  'Other Regional Courier',
];

export const CciPickupModal: React.FC<CciPickupModalProps> = ({
  order,
  items,
  station,
  user,
  onClose,
  onSubmitPickupAction,
}) => {
  if (!order) return null;

  const currentAwbNumber = order.active_awb || order.excel_ref_awb || '';
  const orderItems = items.filter((i) => i.shipping_order_code === order.so_code);
  const totalUnits = orderItems.reduce((sum, item) => sum + (item.quantity || 1), 0);

  const [pickupStatus, setPickupStatus] = useState<PickupStatus>(
    order.pickup_status || 'Pickup Done'
  );
  const [awbNumber, setAwbNumber] = useState<string>(currentAwbNumber);
  const [courier, setCourier] = useState<string>(order.courier || 'BlueDart Express');
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [customRemarks, setCustomRemarks] = useState<string>(order.pickup_remarks || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const finalRemarks = pickupStatus === 'Pickup Not Done'
        ? (selectedReason ? `${selectedReason}${customRemarks ? ` - ${customRemarks}` : ''}` : customRemarks || 'Courier pickup delayed')
        : customRemarks;

      onSubmitPickupAction(order.id, {
        pickupStatus,
        newAwb: awbNumber.trim(),
        courier,
        remarks: finalRemarks,
      });

      if (pickupStatus === 'Pickup Done') {
        confetti({ particleCount: 60, spread: 60, origin: { y: 0.7 } });
      }

      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const isAwbChanged = awbNumber.trim() !== currentAwbNumber.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold font-mono text-slate-900">{order.so_code}</span>
                <SlaBadge tier={order.priority_tier} ageDays={order.max_sr_age} />
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${getCrmStatusStyle(order.crm_status)}`}>
                  {order.crm_status}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                CCI Station: <strong className="text-slate-800 font-mono">{order.station_code}</strong> ({station?.station_name || 'Service Center'}) • Action by <strong className="text-slate-900">{user.full_name}</strong>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-700">
          {/* Quick Consignment Summary */}
          <div className="grid grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Defective Units</span>
              <div className="text-sm font-bold font-mono text-slate-900 mt-0.5">
                {totalUnits} items
              </div>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Declared Value</span>
              <div className="text-sm font-bold font-mono text-emerald-700 mt-0.5">
                {formatINR(order.total_declared_value)}
              </div>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Active AWB (CWH Issued)</span>
              <div className="text-sm font-bold font-mono text-blue-700 mt-0.5 truncate" title={currentAwbNumber || 'Pending'}>
                {currentAwbNumber || 'Pending'}
              </div>
            </div>
          </div>

          {/* Action Step 1: Pickup Status Toggle */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
              1. Courier Pickup Status <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Option A: Pickup Done */}
              <div
                onClick={() => setPickupStatus('Pickup Done')}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  pickupStatus === 'Pickup Done'
                    ? 'bg-emerald-50 border-emerald-500 text-slate-900 shadow-xs ring-1 ring-emerald-400/20'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${pickupStatus === 'Pickup Done' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-emerald-900">Pickup Done</h4>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      Handed over to courier. Status updates to <strong className="text-slate-800">In Transit</strong>.
                    </p>
                  </div>
                </div>
              </div>

              {/* Option B: Pickup Not Done */}
              <div
                onClick={() => setPickupStatus('Pickup Not Done')}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  pickupStatus === 'Pickup Not Done'
                    ? 'bg-rose-50 border-rose-500 text-slate-900 shadow-xs ring-1 ring-rose-400/20'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${pickupStatus === 'Pickup Not Done' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-500'}`}>
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-rose-900">Pickup Not Done</h4>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      Courier missed pickup or packet was rejected/delayed.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Conditional Step 1b: Reason for Pickup Not Done */}
          {pickupStatus === 'Pickup Not Done' && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 space-y-3">
              <label className="block text-xs font-semibold text-rose-900">
                Reason for Delayed / Missed Pickup:
              </label>
              <select
                value={selectedReason}
                onChange={(e) => setSelectedReason(e.target.value)}
                className="w-full bg-white border border-rose-300 text-slate-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500/20"
              >
                <option value="">-- Select reason from standard list --</option>
                {COMMON_PICKUP_FAIL_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Action Step 2: AWB & Courier Details */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Barcode className="w-4 h-4 text-[#001489]" />
                2. AWB Tracking Number & Courier
              </label>
              {isAwbChanged && (
                <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300 text-[10px] font-mono">
                  AWB Changed from: {currentAwbNumber}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] text-slate-600 font-medium mb-1">
                  AWB / Docket Number
                </label>
                <input
                  type="text"
                  value={awbNumber}
                  onChange={(e) => setAwbNumber(e.target.value)}
                  placeholder="Enter / update AWB number"
                  className="w-full bg-white border border-slate-300 text-slate-900 font-mono font-bold rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#001489] transition-colors"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Modify this if the courier executive replaced the docket barcode during pickup.
                </p>
              </div>

              <div>
                <label className="block text-[11px] text-slate-600 font-medium mb-1">
                  Courier Partner
                </label>
                <select
                  value={courier}
                  onChange={(e) => setCourier(e.target.value)}
                  className="w-full bg-white border border-slate-300 text-slate-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#001489] transition-colors"
                >
                  {COURIER_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Action Step 3: Remarks / Handover Notes */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
              3. Handover Notes & Courier Verification
            </label>
            <textarea
              rows={2}
              value={customRemarks}
              onChange={(e) => setCustomRemarks(e.target.value)}
              placeholder="e.g. Handed over to BlueDart pickup executive Mr. Ramesh (Ph: 9876543210), 2 boxes sealed with tamper-evident tape."
              className="w-full bg-white border border-slate-300 rounded-lg p-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#001489]"
            />
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-sm transition-all ${
                pickupStatus === 'Pickup Done'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-rose-600 hover:bg-rose-700'
              }`}
            >
              {pickupStatus === 'Pickup Done' ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirm Pickup Done & Update AWB</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4" />
                  <span>Log Pickup Delay & Save AWB</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
