import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Camera, 
  CheckCircle2, 
  AlertTriangle, 
  Package, 
  Tag, 
  Layers,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  CheckSquare,
  Sparkles,
  Info,
  Loader2,
  Boxes,
  Video,
  ShieldCheck,
  ShieldAlert,
  FileCheck
} from 'lucide-react';
import { ShippingOrder, DefectiveItem, ScreeningStatus, UserProfile } from '../../types/crm';
import { formatINR } from '../../lib/utils';
import { crmDb } from '../../lib/db';

interface UnboxingModalProps {
  order: ShippingOrder;
  items: DefectiveItem[];
  user: UserProfile;
  onClose: () => void;
  onSubmitVerification: (
    soId: string,
    screeningMap: Record<string, { status: ScreeningStatus; remarks?: string; partMatched?: boolean }>,
    evidenceRef: string | null,
    qtyVerification?: {
      expectedQty: number;
      receivedQty: number;
      cartonCondition: string;
      qtyDiscrepancyNote?: string;
    }
  ) => void;
}

const COMMON_DISCREPANCY_TAGS = [
  'Display Shattered / Cracked Glass',
  'Connector / Pins Broken',
  'Liquid / Water Ingress',
  'Burnt Component / PCB Short',
  'Wrong Part in Box',
  'Serial Number Mismatch',
  'Missing Item from Carton',
  'Severe Transit Damage',
];

export const UnboxingModal: React.FC<UnboxingModalProps> = ({
  order,
  items,
  user,
  onClose,
  onSubmitVerification,
}) => {
  const normalize = (s?: string) => (s || '').trim().toLowerCase();
  
  // Initial in-memory matching with trimmed and case-insensitive check
  const initialMatched = useMemo(() => {
    return items.filter(
      (i) =>
        normalize(i.shipping_order_code) === normalize(order.so_code) ||
        (i.shipping_order_id && i.shipping_order_id === order.id)
    );
  }, [items, order.so_code, order.id]);

  const [orderItems, setOrderItems] = useState<DefectiveItem[]>(initialMatched);
  const [isLoadingItems, setIsLoadingItems] = useState<boolean>(initialMatched.length === 0);

  // If items weren't present in memory (e.g. past PostgREST pagination limit), fetch directly from Supabase
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

  const expectedUnits = useMemo(() => {
    return orderItems.reduce((s, i) => s + (i.quantity || 1), 0) || order.total_items || 1;
  }, [orderItems, order.total_items]);

  // Active step in the two-stage unboxing process
  const [activeStage, setActiveStage] = useState<'stage1_qty' | 'stage2_parts'>('stage1_qty');

  // Stage 1: Quantity & Carton Verification State
  const [receivedQty, setReceivedQty] = useState<number>(expectedUnits);
  const [cartonCondition, setCartonCondition] = useState<'Intact & Sealed' | 'Carton Damaged' | 'Tampered Tape / Cut Seal'>('Intact & Sealed');
  const [qtyDiscrepancyNote, setQtyDiscrepancyNote] = useState<string>('');

  // Keep receivedQty synced with expectedUnits when loaded
  useEffect(() => {
    setReceivedQty(expectedUnits);
  }, [expectedUnits]);

  // Stage 2: Part-wise Matching & Inspection State
  const [screeningMap, setScreeningMap] = useState<Record<string, { status: ScreeningStatus; remarks?: string; partMatched?: boolean }>>({});

  // Sync screeningMap whenever orderItems are loaded or updated
  useEffect(() => {
    setScreeningMap((prev) => {
      const next = { ...prev };
      let changed = false;
      orderItems.forEach((item) => {
        if (!next[item.id]) {
          next[item.id] = {
            status: item.screening_status || 'Passed',
            remarks: item.item_remarks || '',
            partMatched: true,
          };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [orderItems]);

  const [cctvEvidence, setCctvEvidence] = useState<string | null>(order.cwh_evidence_ref || null);
  const [isCapturing, setIsCapturing] = useState(false);

  // Quick Action: Mark all parts as matched and passed
  const handleMarkAllPassed = () => {
    const updated = { ...screeningMap };
    orderItems.forEach((item) => {
      updated[item.id] = { status: 'Passed', remarks: '', partMatched: true };
    });
    setScreeningMap(updated);
  };

  // Simulate CCTV snapshot with surveillance canvas overlay
  const handleSimulateCctv = () => {
    setIsCapturing(true);
    setTimeout(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#0a101f';
        ctx.fillRect(0, 0, 640, 360);

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

        // Camera package mockup box
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(180, 90, 280, 180);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.strokeRect(180, 90, 280, 180);

        // Package label
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(200, 110, 240, 45);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 13px Courier New';
        ctx.fillText(`MOTO DEFECTIVE RETURN - ${order.station_code}`, 210, 137);

        // Watermark details
        ctx.fillStyle = '#00ff66';
        ctx.font = 'bold 11px Courier New';
        ctx.fillText(`● REC [CAM-04 CWH UNBOXING BAY]`, 20, 30);
        ctx.fillText(`SO: ${order.so_code}`, 20, 48);
        ctx.fillText(`AWB: ${order.active_awb || order.excel_ref_awb || 'N/A'}`, 20, 66);
        ctx.fillText(`TIMESTAMP: ${new Date().toISOString()}`, 20, 84);
        ctx.fillText(`OFFICER: ${user.full_name} (${user.role})`, 20, 102);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setCctvEvidence(dataUrl);
      }
      setIsCapturing(false);
    }, 350);
  };

  const handleStatusChange = (itemId: string, status: ScreeningStatus) => {
    setScreeningMap((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], status },
    }));
  };

  const handlePartMatchedToggle = (itemId: string, matched: boolean) => {
    setScreeningMap((prev) => ({
      ...prev,
      [itemId]: { 
        ...prev[itemId], 
        partMatched: matched,
        status: !matched && prev[itemId]?.status === 'Passed' ? 'Failed' : prev[itemId]?.status,
        remarks: !matched && !prev[itemId]?.remarks ? 'Part Number Mismatch / Wrong Part Received' : prev[itemId]?.remarks,
      },
    }));
  };

  const handleRemarksChange = (itemId: string, remarks: string) => {
    setScreeningMap((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], remarks },
    }));
  };

  const handleAddTag = (itemId: string, tag: string) => {
    setScreeningMap((prev) => {
      const current = prev[itemId]?.remarks || '';
      const newRemarks = current ? `${current}; ${tag}` : tag;
      return {
        ...prev,
        [itemId]: { ...prev[itemId], remarks: newRemarks },
      };
    });
  };

  // Discrepancy calculations:
  const isQtyMismatch = receivedQty !== expectedUnits;
  const isCartonIssue = cartonCondition !== 'Intact & Sealed';
  const hasItemDiscrepancy = Object.values(screeningMap).some(
    (v) => ['Damaged', 'Missing', 'Failed'].includes(v.status) || v.partMatched === false
  );
  const isDiscrepancy = isQtyMismatch || isCartonIssue || hasItemDiscrepancy;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmitVerification(
      order.id,
      screeningMap,
      cctvEvidence,
      {
        expectedQty: expectedUnits,
        receivedQty,
        cartonCondition,
        qtyDiscrepancyNote,
      }
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl bg-[#0b1329] border border-indigo-500/40 shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1f2e5a] bg-gradient-to-r from-[#101a35] via-[#121f42] to-[#151a30]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-400">
              <Video className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white font-mono">CWH Inward &amp; CCTV Unboxing Bay</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                  Bay #4 CCTV Surveillance Active
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Consignment <strong className="text-cyan-300 font-mono">{order.so_code}</strong> • Station <strong className="text-slate-200">{order.station_code}</strong> ({order.region}) • AWB: <strong className="text-cyan-400 font-mono">{order.active_awb || order.excel_ref_awb || 'N/A'}</strong>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Two-Stage Stepper Bar */}
        <div className="px-6 py-3 bg-[#0d162e] border-b border-[#1c2b53] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Step 1 Tab Button */}
            <button
              type="button"
              onClick={() => setActiveStage('stage1_qty')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeStage === 'stage1_qty'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'bg-[#101a35] text-slate-400 hover:text-slate-200 border border-[#1c2b53]'
              }`}
            >
              <Boxes className="w-3.5 h-3.5" />
              <span>Stage 1: Quantity &amp; Carton Audit</span>
              {(isQtyMismatch || isCartonIssue) && (
                <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" title="Quantity or carton discrepancy noted" />
              )}
            </button>

            <ArrowRight className="w-3.5 h-3.5 text-slate-600" />

            {/* Step 2 Tab Button */}
            <button
              type="button"
              onClick={() => setActiveStage('stage2_parts')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeStage === 'stage2_parts'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'bg-[#101a35] text-slate-400 hover:text-slate-200 border border-[#1c2b53]'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Stage 2: Part-wise Matching &amp; Inspection</span>
              {hasItemDiscrepancy && (
                <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" title="Item level discrepancy noted" />
              )}
            </button>
          </div>

          <div className="text-xs">
            {isDiscrepancy ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                <AlertTriangle className="w-3 h-3 text-rose-400" />
                Discrepancy Flagged → Route to &quot;Discrepancies&quot; Queue
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                Clean Inward → Route to &quot;At CWH Create DC to RC&quot; Queue
              </span>
            )}
          </div>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* CCTV Surveillance Camera Evidence Section */}
          <div className="p-4 rounded-xl border border-[#1c2b53] bg-[#101a35]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-cyan-400" />
                <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                  CCTV Bay Surveillance Footage &amp; Frame Recording
                </h4>
              </div>

              <button
                type="button"
                onClick={handleSimulateCctv}
                disabled={isCapturing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 transition-colors cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                {isCapturing ? 'Recording Frame...' : cctvEvidence ? 'Recapture CCTV Bay Frame' : 'Capture CCTV Bay Frame'}
              </button>
            </div>

            {cctvEvidence ? (
              <div className="relative rounded-lg overflow-hidden border border-cyan-500/40 bg-black max-h-48 flex items-center justify-center">
                <img
                  src={cctvEvidence}
                  alt="CCTV Inward Evidence"
                  className="w-full object-cover max-h-48"
                />
                <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-black/80 text-[10px] font-mono text-emerald-400 border border-emerald-500/40 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  SURVEILLANCE EVIDENCE ATTACHED
                </div>
              </div>
            ) : (
              <div className="py-4 border-2 border-dashed border-[#1f2e5a] rounded-lg text-center text-xs text-slate-400">
                <Camera className="w-7 h-7 mx-auto text-slate-500 mb-1 opacity-60" />
                Click above to capture an official unboxing surveillance frame under CCTV surveillance.
              </div>
            )}
          </div>

          {/* STAGE 1: QUANTITY & CARTON VERIFICATION */}
          {activeStage === 'stage1_qty' && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between pb-2 border-b border-[#1c2b53]">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Boxes className="w-4 h-4 text-indigo-400" />
                    Stage 1: Package Quantity &amp; Outer Carton Inspection
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Count physical units inside package and verify outer carton seal integrity.
                  </p>
                </div>
                <div className="text-right font-mono text-xs">
                  <span className="text-slate-400">Declared Manifest Qty:</span>{' '}
                  <strong className="text-cyan-300 text-sm">{expectedUnits} Units</strong>
                </div>
              </div>

              {/* Quantity Counter & Audit Card */}
              <div className="p-4 rounded-xl bg-[#101a35] border border-[#1c2b53] space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-200 block">
                      Physical Received Units Count:
                    </label>
                    <span className="text-[11px] text-slate-400">
                      Units physically taken out of package at unboxing bay
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setReceivedQty(Math.max(0, receivedQty - 1))}
                      className="w-8 h-8 rounded-lg bg-[#0b1329] border border-[#1f2e5a] text-slate-200 font-bold hover:bg-slate-800 transition-colors"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min="0"
                      value={receivedQty}
                      onChange={(e) => setReceivedQty(parseInt(e.target.value, 10) || 0)}
                      className="w-20 text-center py-1.5 px-2 rounded-lg bg-[#0b1329] border border-[#1f2e5a] font-mono font-bold text-base text-white focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      type="button"
                      onClick={() => setReceivedQty(receivedQty + 1)}
                      className="w-8 h-8 rounded-lg bg-[#0b1329] border border-[#1f2e5a] text-slate-200 font-bold hover:bg-slate-800 transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Match / Mismatch Result Banner */}
                {receivedQty === expectedUnits ? (
                  <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center gap-2 text-xs text-emerald-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      <strong>Quantity Verified Clean:</strong> Received count ({receivedQty}) perfectly matches declared manifest ({expectedUnits} units).
                    </span>
                  </div>
                ) : (
                  <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/40 flex items-center gap-2 text-xs text-rose-300 animate-pulse">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>
                      <strong>Quantity Discrepancy!</strong> Expected {expectedUnits} units but received {receivedQty} units ({receivedQty < expectedUnits ? `${expectedUnits - receivedQty} Short` : `${receivedQty - expectedUnits} Excess`}). This will tag the SO as Discrepancy.
                    </span>
                  </div>
                )}
              </div>

              {/* Carton Seal Integrity Options */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-200 uppercase tracking-wider block">
                  Outer Carton &amp; Courier Seal Condition:
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div
                    onClick={() => setCartonCondition('Intact & Sealed')}
                    className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                      cartonCondition === 'Intact & Sealed'
                        ? 'bg-emerald-500/15 border-emerald-500 text-white shadow-lg'
                        : 'bg-[#101a35] border-[#1c2b53] text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-xs text-emerald-300">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      Intact &amp; Sealed
                    </div>
                    <p className="text-[11px] text-slate-300 mt-1">
                      Carton undamaged, original courier flyer &amp; station tape intact.
                    </p>
                  </div>

                  <div
                    onClick={() => setCartonCondition('Carton Damaged')}
                    className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                      cartonCondition === 'Carton Damaged'
                        ? 'bg-amber-500/15 border-amber-500 text-white shadow-lg'
                        : 'bg-[#101a35] border-[#1c2b53] text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-xs text-amber-300">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      Carton Damaged
                    </div>
                    <p className="text-[11px] text-slate-300 mt-1">
                      Box crushed, punctured, torn, or wet during courier transit.
                    </p>
                  </div>

                  <div
                    onClick={() => setCartonCondition('Tampered Tape / Cut Seal')}
                    className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                      cartonCondition === 'Tampered Tape / Cut Seal'
                        ? 'bg-rose-500/15 border-rose-500 text-white shadow-lg'
                        : 'bg-[#101a35] border-[#1c2b53] text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-xs text-rose-300">
                      <ShieldAlert className="w-4 h-4 text-rose-400" />
                      Tampered / Cut Seal
                    </div>
                    <p className="text-[11px] text-slate-300 mt-1">
                      Tape broken, opened en route, or re-taped with unauthorized tape.
                    </p>
                  </div>
                </div>
              </div>

              {/* Package Notes */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Package Condition Notes (Optional):
                </label>
                <input
                  type="text"
                  value={qtyDiscrepancyNote}
                  onChange={(e) => setQtyDiscrepancyNote(e.target.value)}
                  placeholder="e.g. Courier outer flyer had slit on bottom; 1 unit box was crushed inside..."
                  className="w-full bg-[#0b1329] border border-[#1f2e5a] rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Next Stage Button */}
              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setActiveStage('stage2_parts')}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg transition-all cursor-pointer"
                >
                  <span>Proceed to Stage 2: Part-wise Matching &amp; Inspection</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STAGE 2: PART-WISE MATCHING & DISCREPANCY REMARKS */}
          {activeStage === 'stage2_parts' && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-[#1c2b53] gap-2">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-400" />
                    Stage 2: Part-wise Matching &amp; Condition Inspection
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Match physical parts against challan line items and flag any damage, shortage, or wrong parts.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveStage('stage1_qty')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#101a35] hover:bg-slate-800 text-slate-300 border border-[#1c2b53] transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Stage 1
                  </button>

                  <button
                    type="button"
                    onClick={handleMarkAllPassed}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Mark All Matched &amp; Passed
                  </button>
                </div>
              </div>

              {/* Line Items Inspection Checklist */}
              <div className="space-y-3">
                {orderItems.map((item, idx) => {
                  const currentScreen = screeningMap[item.id] || { status: 'Passed', remarks: '', partMatched: true };
                  const isItemIssue = ['Damaged', 'Missing', 'Failed'].includes(currentScreen.status) || currentScreen.partMatched === false;

                  return (
                    <div
                      key={item.id}
                      className={`p-4 rounded-xl border transition-colors ${
                        isItemIssue
                          ? 'bg-rose-950/20 border-rose-500/40 shadow-sm'
                          : 'bg-[#101a35] border-[#1c2b53]'
                      }`}
                    >
                      {/* Item Header & Details */}
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-[#1c2b53]/60">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-white">
                              #{idx + 1} SR: {item.sr_number}
                            </span>
                            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-semibold">
                              Part No: {item.sr_part_number}
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono">
                              (Qty: {item.quantity || 1})
                            </span>
                          </div>
                          <div className="text-xs text-slate-300 mt-1 font-medium">
                            {item.part_category}: {item.part_description}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Model: {item.sr_model_name || '-'} • Reported Fault: {item.sr_fault_description || 'Defective part return'}
                          </div>
                        </div>

                        {/* Part Number Match Toggle */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400">Part Matched?</span>
                          <button
                            type="button"
                            onClick={() => handlePartMatchedToggle(item.id, true)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                              currentScreen.partMatched !== false
                                ? 'bg-emerald-600 text-white shadow font-semibold'
                                : 'bg-[#0b1329] text-slate-400 border border-[#1f2e5a] hover:text-slate-200'
                            }`}
                          >
                            ✓ Matched
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePartMatchedToggle(item.id, false)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                              currentScreen.partMatched === false
                                ? 'bg-rose-600 text-white shadow font-semibold'
                                : 'bg-[#0b1329] text-slate-400 border border-[#1f2e5a] hover:text-slate-200'
                            }`}
                          >
                            ✗ Wrong Part
                          </button>
                        </div>
                      </div>

                      {/* Physical Condition Screening Selector */}
                      <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="text-xs font-semibold text-slate-300">
                          Physical Inspection Verdict:
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          {(['Passed', 'Damaged', 'Missing', 'Failed'] as ScreeningStatus[]).map((st) => (
                            <button
                              key={st}
                              type="button"
                              onClick={() => handleStatusChange(item.id, st)}
                              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                currentScreen.status === st
                                  ? st === 'Passed'
                                    ? 'bg-emerald-600 text-white shadow'
                                    : st === 'Damaged'
                                    ? 'bg-amber-600 text-white shadow'
                                    : 'bg-rose-600 text-white shadow'
                                  : 'bg-[#0b1329] border border-[#1f2e5a] text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              {st === 'Passed' ? '✓ Passed (As Declared)' : st === 'Damaged' ? '⚠️ Transit Damage' : st === 'Missing' ? '✗ Missing' : '✗ Failed'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Discrepancy Remarks & Quick Tags (shown if any issue) */}
                      {isItemIssue && (
                        <div className="mt-3 pt-3 border-t border-rose-500/20 space-y-2">
                          <div className="flex items-center gap-1.5 text-xs text-rose-300 font-semibold">
                            <Tag className="w-3.5 h-3.5" />
                            <span>Quick Reason Tags:</span>
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap">
                            {COMMON_DISCREPANCY_TAGS.map((tag) => (
                              <button
                                key={tag}
                                type="button"
                                onClick={() => handleAddTag(item.id, tag)}
                                className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#0b1329] hover:bg-rose-950/40 text-rose-200 border border-rose-500/30 transition-colors cursor-pointer"
                              >
                                + {tag}
                              </button>
                            ))}
                          </div>

                          <div>
                            <input
                              type="text"
                              value={currentScreen.remarks || ''}
                              onChange={(e) => handleRemarksChange(item.id, e.target.value)}
                              placeholder="Enter specific discrepancy details (e.g. PCB fractured, cracked screen glass, pins bent...)"
                              className="w-full bg-[#0b1329] border border-rose-500/40 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rose-400"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {orderItems.length === 0 && (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    {isLoadingItems ? (
                      <div className="flex flex-col items-center justify-center gap-3">
                        <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
                        <span className="font-medium text-slate-300">
                          Retrieving constituent defective line items for <strong className="text-white font-mono">{order.so_code}</strong>...
                        </span>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="font-medium text-slate-300">No individual line items registered for this shipping order.</p>
                        <p className="text-[11px] text-slate-500">Please verify if defective items were uploaded with SO Code: {order.so_code}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Outcome & Routing Banner */}
          {isDiscrepancy ? (
            <div className="p-4 rounded-xl bg-gradient-to-r from-rose-950/40 via-amber-950/20 to-[#101a35] border border-rose-500/50 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5 animate-pulse" />
              <div className="text-xs">
                <h4 className="font-bold text-rose-300 text-sm">
                  ⚠️ Discrepancy Flagged — Routing to &quot;Discrepancies&quot; Queue
                </h4>
                <p className="text-slate-200 mt-1">
                  Discrepancies have been recorded during CCTV inspection (Quantity mismatch, carton issues, or item damages/missing).
                  Upon submission, this shipping order will be tagged with status{' '}
                  <strong className="text-rose-400 font-mono">Discrepancy Tagged</strong> (Motorola status:{' '}
                  <strong className="text-amber-300 font-mono">6. RC Received ASP(Negative)</strong>) and moved to the{' '}
                  <strong className="text-white">⚠️ Discrepancies</strong> queue at CWH.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/40 via-teal-950/20 to-[#101a35] border border-emerald-500/40 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-xs">
                <h4 className="font-bold text-emerald-300 text-sm">
                  ✓ Clean Inward Verification — Routing to &quot;At CWH → Create DC to RC&quot; Queue
                </h4>
                <p className="text-slate-200 mt-1">
                  All package quantities and parts have been verified clean under CCTV surveillance.
                  Upon submission, this consignment will be marked as{' '}
                  <strong className="text-emerald-400 font-mono">CWH Received</strong> (Motorola status:{' '}
                  <strong className="text-cyan-300 font-mono">3. CWH Received</strong>) and moved to the{' '}
                  <strong className="text-white">🏢 At CWH → Create DC to RC</strong> queue for outbound dispatch in Lenovo CRM.
                </p>
              </div>
            </div>
          )}

          {/* Modal Footer Controls */}
          <div className="flex items-center justify-between pt-4 border-t border-[#1f2e5a]">
            <div className="text-xs text-slate-400">
              Logged in supervisor: <strong className="text-slate-200">{user.full_name}</strong>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="submit"
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-lg transition-all cursor-pointer ${
                  isDiscrepancy
                    ? 'bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 shadow-rose-900/30 hover:scale-[1.01]'
                    : 'bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 shadow-emerald-900/30 hover:scale-[1.01]'
                }`}
              >
                <FileCheck className="w-4 h-4" />
                {isDiscrepancy 
                  ? 'Flag Discrepancies & Route to Discrepancies Queue'
                  : 'Verify Clean Inward & Move to CWH DC to RC Queue'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
