import React, { useState } from 'react';
import { 
  X, 
  Barcode, 
  Truck, 
  FileSpreadsheet, 
  AlertCircle, 
  RefreshCw, 
  CheckCircle2,
  FileCheck
} from 'lucide-react';
import { ShippingOrder, UserProfile } from '../../types/crm';
import { formatINR } from '../../lib/utils';

interface AwbDispatchModalProps {
  order: ShippingOrder;
  user: UserProfile;
  onClose: () => void;
  onSubmit: (
    soId: string,
    courier: string,
    awbNumber: string,
    cancellationReason?: string,
    ewayNumber?: string,
    ewayUrl?: string
  ) => void;
}

export const AwbDispatchModal: React.FC<AwbDispatchModalProps> = ({
  order,
  user,
  onClose,
  onSubmit,
}) => {
  const isRetokening = Boolean(order.active_awb || order.excel_ref_awb);

  const [courier, setCourier] = useState(order.courier || 'BlueDart Express');
  const [awbNumber, setAwbNumber] = useState('');
  const [cancellationReason, setCancellationReason] = useState('Courier Rescheduled / Operational Reassignment');
  const [ewayNumber, setEwayNumber] = useState(order.eway_bill_number || '');
  const [ewayUrl, setEwayUrl] = useState(order.eway_bill_url || '');

  // Generate random dummy AWB
  const handleGenerateAwb = () => {
    const prefix = courier.toLowerCase().includes('blue') ? 'BD' : courier.toLowerCase().includes('delhi') ? 'DL' : 'EXP';
    const randDigits = Math.floor(100000000 + Math.random() * 900000000);
    setAwbNumber(`${prefix}${randDigits}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!awbNumber.trim()) {
      alert('Please enter an AWB number');
      return;
    }

    onSubmit(
      order.id,
      courier,
      awbNumber.trim(),
      isRetokening ? cancellationReason : undefined,
      ewayNumber.trim() || undefined,
      ewayUrl.trim() || undefined
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-50 border border-sky-200 text-[#001489]">
              <Barcode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {isRetokening ? 'Retoken Courier AWB' : 'Assign Logistics AWB Token'}
              </h2>
              <p className="text-xs text-slate-500">
                Consignment: <strong className="text-[#001489] font-mono">{order.so_code}</strong>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Active AWB Notice if re-tokening */}
          {isRetokening && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-900 shadow-xs">
              <div className="flex items-center gap-2 font-medium">
                <RefreshCw className="w-4 h-4 text-amber-700" />
                Retokening active AWB: <span className="font-mono text-slate-900 font-bold">{order.active_awb || order.excel_ref_awb}</span>
              </div>
              <p className="mt-1 text-amber-800 text-[11px]">
                The current AWB will be archived into `awb_history` with your cancellation reason.
              </p>
            </div>
          )}

          {/* Courier Partner */}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">
              Logistics &amp; Courier Partner
            </label>
            <select
              value={courier}
              onChange={(e) => setCourier(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#001489] focus:bg-white transition-colors"
            >
              <option value="BlueDart Express">BlueDart Express (Official SLA Air)</option>
              <option value="Delhivery Surface">Delhivery Surface Cargo</option>
              <option value="DTDC Express">DTDC Express Logistics</option>
              <option value="TrackOn Courier">TrackOn Premium Air</option>
              <option value="FedEx Express">FedEx Logistics</option>
            </select>
          </div>

          {/* AWB Number Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Courier Waybill (AWB) Number
              </label>
              <button
                type="button"
                onClick={handleGenerateAwb}
                className="text-[11px] text-[#001489] hover:underline flex items-center gap-1 font-medium cursor-pointer"
              >
                Auto-generate Sample Token
              </button>
            </div>
            <div className="relative">
              <input
                type="text"
                value={awbNumber}
                onChange={(e) => setAwbNumber(e.target.value)}
                placeholder="e.g. BD883920194"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#001489] focus:bg-white uppercase transition-colors"
                required
              />
            </div>
          </div>

          {/* Cancellation Reason (only if re-tokening) */}
          {isRetokening && (
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                Reason for Re-tokening / Previous AWB Cancellation
              </label>
              <select
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#001489] focus:bg-white transition-colors"
              >
                <option value="Courier Rescheduled / Operational Reassignment">Courier Rescheduled / Operational Reassignment</option>
                <option value="Barcode Label Damaged / Unscannable">Barcode Label Damaged / Unscannable</option>
                <option value="Pickup SLA Exceeded by Courier">Pickup SLA Exceeded by Courier</option>
                <option value="Wrong Consignment Weight / Dimension Declared">Wrong Consignment Weight / Dimension Declared</option>
                <option value="Damaged Outer Carton at Hub Staging">Damaged Outer Carton at Hub Staging</option>
              </select>
            </div>
          )}

          {/* E-Way Bill Requirement Alert */}
          {order.eway_bill_required ? (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-xs space-y-2 shadow-xs">
              <div className="flex items-center gap-2 text-amber-900 font-semibold">
                <AlertCircle className="w-4 h-4 text-amber-700 flex-shrink-0" />
                <span>Statutory E-Way Bill Mandatory</span>
              </div>
              <p className="text-[11px] text-amber-800">
                Consignment declared value is <strong className="text-slate-900 font-mono">{formatINR(order.total_declared_value)}</strong> (≥ ₹50,000 threshold). Attach Government E-Way bill number to avoid transit penalty.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="text-[10px] text-slate-600 block mb-1">E-Way Bill # (12 digits)</label>
                  <input
                    type="text"
                    value={ewayNumber}
                    onChange={(e) => setEwayNumber(e.target.value)}
                    placeholder="281099201948"
                    className="w-full bg-white border border-amber-300 rounded px-2 py-1 text-xs text-slate-800 font-mono placeholder-slate-400 focus:outline-none focus:border-[#001489]"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-600 block mb-1">Govt Portal Reference / URL</label>
                  <input
                    type="text"
                    value={ewayUrl}
                    onChange={(e) => setEwayUrl(e.target.value)}
                    placeholder="https://ewaybillgst.gov.in/..."
                    className="w-full bg-white border border-amber-300 rounded px-2 py-1 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#001489]"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Consignment value under ₹50,000. E-Way bill not required.
            </div>
          )}

          {/* Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-semibold bg-[#001489] hover:bg-[#08209e] text-white shadow-xs transition-colors cursor-pointer"
            >
              <FileCheck className="w-4 h-4" />
              Confirm &amp; Assign AWB
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
