import React, { useState } from 'react';
import { 
  X, 
  Truck, 
  PackageCheck, 
  Barcode, 
  Building2, 
  CheckCircle2,
  AlertTriangle,
  Layers
} from 'lucide-react';
import { ShippingOrder } from '../../types/crm';

interface CourierReceiptModalProps {
  order: ShippingOrder;
  onClose: () => void;
  onConfirm: (
    soId: string,
    data: {
      cartonCondition: string;
      receivedBoxes: number;
      remarks?: string;
    }
  ) => void;
}

export const CourierReceiptModal: React.FC<CourierReceiptModalProps> = ({
  order,
  onClose,
  onConfirm,
}) => {
  const [cartonCondition, setCartonCondition] = useState<string>('Intact & Sealed');
  const [receivedBoxes, setReceivedBoxes] = useState<number>(1);
  const [remarks, setRemarks] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      onConfirm(order.id, {
        cartonCondition,
        receivedBoxes: Math.max(1, receivedBoxes),
        remarks: remarks.trim() || undefined,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 shadow-2xs">
              <PackageCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Acknowledge Courier Delivery
              </h3>
              <p className="text-xs text-slate-500 font-mono">
                {order.so_code} • Station: {order.station_code}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Consignment Info Badge Ribbon */}
        <div className="px-6 py-3 bg-slate-100/70 border-b border-slate-200 grid grid-cols-3 gap-2 text-xs">
          <div>
            <span className="text-[10px] text-slate-500 block uppercase font-mono">Courier</span>
            <span className="font-semibold text-slate-800 flex items-center gap-1">
              <Truck className="w-3.5 h-3.5 text-sky-600 shrink-0" />
              <span className="truncate">{order.courier || 'BlueDart Express'}</span>
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block uppercase font-mono">Active AWB</span>
            <span className="font-mono font-semibold text-sky-800 truncate block">
              {order.active_awb || order.excel_ref_awb || '-'}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block uppercase font-mono">Total Units</span>
            <span className="font-mono font-bold text-slate-800 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              {order.total_items || 1} units
            </span>
          </div>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Note explaining 2-step flow */}
          <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 text-xs text-sky-900 leading-relaxed flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Step 1 — Dock Receiving:</span>
              <p className="mt-0.5 text-sky-800">
                Acknowledge physical package delivery from the courier. Consignment will be staged at CWH bay with screening status marked as <strong>Pending</strong>. Detailed unit and part screening can be completed under CCTV later.
              </p>
            </div>
          </div>

          {/* Number of physical cartons */}
          <div>
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5 font-mono">
              Number of Boxes / Cartons Received
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={receivedBoxes}
              onChange={(e) => setReceivedBoxes(parseInt(e.target.value, 10) || 1)}
              required
              className="w-full px-3 py-2 rounded-xl text-xs font-mono font-bold text-slate-900 border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#001489]/20 focus:border-[#001489] bg-white shadow-2xs"
            />
          </div>

          {/* Outer packaging condition */}
          <div>
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5 font-mono">
              Outer Carton Condition at Dock
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'Intact & Sealed', label: 'Intact & Sealed', sub: 'Original security tape intact', isGood: true },
                { id: 'Outer Box Damaged', label: 'Outer Box Damaged', sub: 'Crushed / punctured box', isGood: false },
                { id: 'Seal Tampered', label: 'Seal Broken / Tampered', sub: 'Repacked or loose tape', isGood: false },
                { id: 'Wet / Moisture Damage', label: 'Wet / Moisture Damage', sub: 'Water damage visible', isGood: false },
              ].map((opt) => (
                <button
                  type="button"
                  key={opt.id}
                  onClick={() => setCartonCondition(opt.id)}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    cartonCondition === opt.id
                      ? opt.isGood
                        ? 'border-emerald-500 bg-emerald-50/80 ring-1 ring-emerald-500'
                        : 'border-rose-500 bg-rose-50/80 ring-1 ring-rose-500'
                      : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">{opt.label}</span>
                    {cartonCondition === opt.id && (
                      <span className={`w-2 h-2 rounded-full ${opt.isGood ? 'bg-emerald-600' : 'bg-rose-600'}`} />
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-0.5">{opt.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Dock Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5 font-mono">
              Receiving Dock Remarks (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Received at Dock 2 from BlueDart van; signed run-sheet"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs text-slate-800 border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#001489]/20 focus:border-[#001489] bg-white shadow-2xs"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <PackageCheck className="w-4 h-4" />
              Confirm Delivery at CWH
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
