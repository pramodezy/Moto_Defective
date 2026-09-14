import React, { useState } from 'react';
import { 
  X, 
  Camera, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldAlert, 
  Package, 
  FileCheck,
  Video
} from 'lucide-react';
import { ShippingOrder, DefectiveItem, ScreeningStatus, UserProfile } from '../../types/crm';
import { formatINR } from '../../lib/utils';

interface UnboxingModalProps {
  order: ShippingOrder;
  items: DefectiveItem[];
  user: UserProfile;
  onClose: () => void;
  onSubmitVerification: (
    soId: string,
    screeningMap: Record<string, { status: ScreeningStatus; remarks?: string }>,
    evidenceRef: string | null
  ) => void;
}

export const UnboxingModal: React.FC<UnboxingModalProps> = ({
  order,
  items,
  user,
  onClose,
  onSubmitVerification,
}) => {
  const orderItems = items.filter((i) => i.shipping_order_code === order.so_code);

  const [screeningMap, setScreeningMap] = useState<Record<string, { status: ScreeningStatus; remarks?: string }>>(() => {
    const initial: Record<string, { status: ScreeningStatus; remarks?: string }> = {};
    orderItems.forEach((item) => {
      initial[item.id] = {
        status: item.screening_status || 'Passed',
        remarks: item.item_remarks || '',
      };
    });
    return initial;
  });

  const [cctvEvidence, setCctvEvidence] = useState<string | null>(order.cwh_evidence_ref || null);
  const [isCapturing, setIsCapturing] = useState(false);

  // Mark all as passed
  const handlePassAll = () => {
    const updated = { ...screeningMap };
    orderItems.forEach((item) => {
      updated[item.id] = { status: 'Passed', remarks: '' };
    });
    setScreeningMap(updated);
  };

  // Simulate CCTV snapshot with real canvas generation
  const handleSimulateCctv = () => {
    setIsCapturing(true);
    setTimeout(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // CCTV dark surveillance background
        ctx.fillStyle = '#0a101f';
        ctx.fillRect(0, 0, 640, 360);

        // Grid lines
        ctx.strokeStyle = 'rgba(0, 210, 255, 0.15)';
        ctx.lineWidth = 1;
        for (let x = 0; x < 640; x += 40) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, 360);
          ctx.stroke();
        }
        for (let y = 0; y < 360; y += 40) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(640, y);
          ctx.stroke();
        }

        // Camera feed mockup box / package
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(200, 110, 240, 160);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.strokeRect(200, 110, 240, 160);

        // Motorola label simulation
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(220, 130, 200, 40);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 13px Courier New';
        ctx.fillText(`MOTO RETURNS - ${order.station_code}`, 230, 155);

        // Watermarks & Time
        ctx.fillStyle = '#00ff66';
        ctx.font = 'bold 12px Courier New';
        ctx.fillText(`● REC [CAM-04 CWH INWARD BAY]`, 20, 30);
        ctx.fillText(`SO: ${order.so_code}`, 20, 50);
        ctx.fillText(`TIMESTAMP: ${new Date().toISOString()}`, 20, 70);
        ctx.fillText(`SUPERVISOR: ${user.full_name}`, 20, 90);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setCctvEvidence(dataUrl);
      }
      setIsCapturing(false);
    }, 400);
  };

  const handleStatusChange = (itemId: string, status: ScreeningStatus) => {
    setScreeningMap((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], status },
    }));
  };

  const handleRemarksChange = (itemId: string, remarks: string) => {
    setScreeningMap((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], remarks },
    }));
  };

  const hasDiscrepancy = Object.values(screeningMap).some((v) =>
    ['Damaged', 'Missing', 'Failed'].includes(v.status)
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmitVerification(order.id, screeningMap, cctvEvidence);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl bg-[#0b1329] border border-indigo-500/40 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1f2e5a] bg-gradient-to-r from-[#101a35] to-[#151a30]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-400">
              <Video className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white font-mono">CWH Inward & CCTV Unboxing Station</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                  Bay #4 Active
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Consignment <strong className="text-cyan-300 font-mono">{order.so_code}</strong> from Station <strong className="text-slate-200">{order.station_code}</strong> ({order.region})
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* CCTV Evidence Camera Section */}
          <div className="p-4 rounded-xl border border-[#1c2b53] bg-[#101a35]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-cyan-400" />
                <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                  CCTV Bay Unboxing Evidence Recording
                </h4>
              </div>

              <button
                type="button"
                onClick={handleSimulateCctv}
                disabled={isCapturing}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 transition-colors"
              >
                <Camera className="w-3.5 h-3.5" />
                {isCapturing ? 'Recording Frame...' : cctvEvidence ? 'Recapture CCTV Bay Frame' : 'Capture CCTV Bay Snapshot'}
              </button>
            </div>

            {cctvEvidence ? (
              <div className="relative rounded-lg overflow-hidden border border-cyan-500/40 bg-black max-h-52 flex items-center justify-center">
                <img
                  src={cctvEvidence}
                  alt="CCTV Inward Evidence"
                  className="w-full object-cover max-h-52"
                />
                <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-black/75 text-[10px] font-mono text-emerald-400 border border-emerald-500/40 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  EVIDENCE SECURED
                </div>
              </div>
            ) : (
              <div className="py-6 border-2 border-dashed border-[#1f2e5a] rounded-lg text-center text-xs text-slate-400">
                <Camera className="w-8 h-8 mx-auto text-slate-500 mb-1.5 opacity-60" />
                Click above to capture an official unboxing frame under CCTV surveillance.
              </div>
            )}
          </div>

          {/* Quick Action & Items Verification List */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                  Item Inward Screening Checklist ({orderItems.length} units)
                </h4>
                <p className="text-[11px] text-slate-400">
                  Confirm physical condition vs declared manifest
                </p>
              </div>

              <button
                type="button"
                onClick={handlePassAll}
                className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Mark All as Passed
              </button>
            </div>

            <div className="space-y-3">
              {orderItems.map((item, idx) => {
                const currentScreen = screeningMap[item.id] || { status: 'Passed', remarks: '' };

                return (
                  <div
                    key={item.id}
                    className={`p-3.5 rounded-xl border transition-colors ${
                      ['Damaged', 'Missing', 'Failed'].includes(currentScreen.status)
                        ? 'bg-red-950/20 border-red-500/40'
                        : 'bg-[#101a35] border-[#1c2b53]'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      {/* Item Details */}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-white">
                            #{idx + 1} {item.sr_number}
                          </span>
                          <span className="text-[11px] font-mono px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                            Part: {item.sr_part_number}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            (Qty: {item.quantity || 1})
                          </span>
                        </div>
                        <div className="text-xs text-slate-300 mt-1 font-medium">
                          {item.part_category}: {item.part_description}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Model: {item.sr_model_name || '-'} • Fault: {item.sr_fault_description || '-'}
                        </div>
                      </div>

                      {/* Status Selector Pills */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {(['Passed', 'Damaged', 'Missing', 'Failed'] as ScreeningStatus[]).map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => handleStatusChange(item.id, st)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                              currentScreen.status === st
                                ? st === 'Passed'
                                  ? 'bg-emerald-600 text-white shadow'
                                  : st === 'Damaged'
                                  ? 'bg-amber-600 text-white shadow'
                                  : 'bg-rose-600 text-white shadow'
                                : 'bg-[#0b1329] border border-[#1f2e5a] text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {st}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Discrepancy Remarks Input */}
                    {['Damaged', 'Missing', 'Failed'].includes(currentScreen.status) && (
                      <div className="mt-3 pt-2.5 border-t border-red-500/20">
                        <label className="text-[11px] font-medium text-rose-300 block mb-1">
                          Discrepancy Description / Physical Inspection Notes:
                        </label>
                        <input
                          type="text"
                          value={currentScreen.remarks || ''}
                          onChange={(e) => handleRemarksChange(item.id, e.target.value)}
                          placeholder="e.g. PCB burnt / Connector missing / Broken screen glass..."
                          className="w-full bg-[#0b1329] border border-red-500/40 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-red-400"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Alert if discrepancies exist */}
          {hasDiscrepancy && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-3 text-xs text-amber-300">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-400" />
              <div>
                <strong>Discrepancies Tagged:</strong> This consignment will be flagged with status{' '}
                <strong className="text-rose-400 font-mono">Discrepancy Tagged</strong>. Discrepancy logs will be recorded in the audit trail.
              </div>
            </div>
          )}

          {/* Footer Submit Button */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#1f2e5a]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg shadow-indigo-500/20 transition-all"
            >
              <FileCheck className="w-4 h-4" />
              Complete Inward Verification
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
