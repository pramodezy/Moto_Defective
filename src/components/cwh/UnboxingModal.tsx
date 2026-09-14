import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  Package, 
  Layers,
  Send,
  Loader2,
  Video,
  CheckSquare
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

export const UnboxingModal: React.FC<UnboxingModalProps> = ({
  order,
  items,
  user,
  onClose,
  onSubmitVerification,
}) => {
  const normalize = (s?: string) => (s || '').trim().toLowerCase();

  // Match items in-memory first
  const initialMatched = useMemo(() => {
    return items.filter(
      (i) =>
        normalize(i.shipping_order_code) === normalize(order.so_code) ||
        (i.shipping_order_id && i.shipping_order_id === order.id)
    );
  }, [items, order.so_code, order.id]);

  const [orderItems, setOrderItems] = useState<DefectiveItem[]>(initialMatched);
  const [isLoadingItems, setIsLoadingItems] = useState<boolean>(initialMatched.length === 0);

  // If not in memory, query on-demand
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

  // Stage 1: Quantity & Carton State
  const [receivedQty, setReceivedQty] = useState<number>(expectedUnits);
  const [cartonCondition, setCartonCondition] = useState<'Intact & Sealed' | 'Carton Damaged' | 'Tampered Tape / Cut Seal'>('Intact & Sealed');
  const [qtyDiscrepancyNote, setQtyDiscrepancyNote] = useState<string>('');

  useEffect(() => {
    setReceivedQty(expectedUnits);
  }, [expectedUnits]);

  // Stage 2: Part-wise Screening State
  const [screeningMap, setScreeningMap] = useState<Record<string, { status: ScreeningStatus; remarks?: string; partMatched?: boolean }>>({});

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

  // CCTV Footage / Evidence Link input
  const [cctvFootageUrl, setCctvFootageUrl] = useState<string>(order.cwh_evidence_ref || '');

  // Quick Action: Match and pass all items
  const handleMarkAllMatchedPassed = () => {
    const updated: Record<string, { status: ScreeningStatus; remarks?: string; partMatched?: boolean }> = {};
    orderItems.forEach((item) => {
      updated[item.id] = {
        status: 'Passed',
        remarks: '',
        partMatched: true,
      };
    });
    setScreeningMap(updated);
  };

  const handleTogglePartMatch = (itemId: string) => {
    setScreeningMap((prev) => {
      const curr = prev[itemId] || { status: 'Passed', remarks: '', partMatched: true };
      const nextMatched = curr.partMatched === false ? true : false;
      return {
        ...prev,
        [itemId]: {
          ...curr,
          partMatched: nextMatched,
          status: !nextMatched && curr.status === 'Passed' ? 'Failed' : curr.status,
          remarks: !nextMatched && !curr.remarks ? 'Wrong part received in box' : curr.remarks,
        },
      };
    });
  };

  const handleStatusChange = (itemId: string, newStatus: ScreeningStatus) => {
    setScreeningMap((prev) => {
      const curr = prev[itemId] || { status: 'Passed', remarks: '', partMatched: true };
      return {
        ...prev,
        [itemId]: {
          ...curr,
          status: newStatus,
          remarks: newStatus !== 'Passed' && !curr.remarks ? `${newStatus} reported during CWH inspection` : curr.remarks,
        },
      };
    });
  };

  const handleRemarksChange = (itemId: string, val: string) => {
    setScreeningMap((prev) => {
      const curr = prev[itemId] || { status: 'Passed', remarks: '', partMatched: true };
      return {
        ...prev,
        [itemId]: {
          ...curr,
          remarks: val,
        },
      };
    });
  };

  // Discrepancy checks
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
      cctvFootageUrl.trim() || null,
      {
        expectedQty: expectedUnits,
        receivedQty,
        cartonCondition,
        qtyDiscrepancyNote: qtyDiscrepancyNote.trim() || undefined,
      }
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-5xl max-h-[92vh] flex flex-col rounded-xl bg-[#0b1329] border border-indigo-500/40 shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1f2e5a] bg-[#101a35]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <Video className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white font-mono">{order.so_code}</h2>
                <span className="text-xs px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-medium">
                  CWH Inward Verification
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Station: <strong className="text-white">{order.station_code}</strong> • Declared Value: <strong className="text-emerald-400 font-mono">{formatINR(order.total_declared_value)}</strong> • Operator: {user.full_name}
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

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          
          {/* Section 1: CCTV Footage Link Input */}
          <div className="p-3.5 rounded-lg bg-[#101a35] border border-[#1f2e5a]">
            <label className="block text-xs font-semibold text-slate-200 mb-1.5 flex items-center gap-1.5">
              <Video className="w-3.5 h-3.5 text-indigo-400" />
              CCTV Footage Link / DVR Reference
              <span className="text-[11px] text-slate-400 font-normal">(Paste Google Drive link, Cloud URL, or DVR timestamp reference)</span>
            </label>
            <input
              type="text"
              value={cctvFootageUrl}
              onChange={(e) => setCctvFootageUrl(e.target.value)}
              placeholder="e.g. https://drive.google.com/file/d/1a2b3c... or CCTV Cam 02 (14:35:00)"
              className="w-full bg-[#0b1329] border border-[#1f2e5a] rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-400 font-mono"
            />
          </div>

          {/* Section 2: Stage 1 - Quantity & Carton Verification */}
          <div className="p-3.5 rounded-lg bg-[#101a35] border border-[#1f2e5a]">
            <div className="flex items-center justify-between border-b border-[#1f2e5a] pb-2 mb-3">
              <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                <Package className="w-4 h-4" />
                Stage 1: Quantity &amp; Carton Verification
              </span>
              {isQtyMismatch && (
                <span className="text-[11px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 font-semibold">
                  ⚠️ Qty Mismatch: Expected {expectedUnits} vs Physical {receivedQty}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Expected Units (Manifest)</label>
                <div className="px-3 py-1.5 rounded-lg bg-[#0b1329] border border-[#1f2e5a] text-xs font-mono font-bold text-white">
                  {expectedUnits} units
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Physical Received Units</label>
                <input
                  type="number"
                  min={0}
                  max={999}
                  required
                  value={receivedQty}
                  onChange={(e) => setReceivedQty(parseInt(e.target.value, 10) || 0)}
                  className={`w-full bg-[#0b1329] border rounded-lg px-3 py-1.5 text-xs font-mono font-bold text-white focus:outline-none ${
                    isQtyMismatch ? 'border-rose-500 text-rose-300' : 'border-[#1f2e5a] focus:border-indigo-400'
                  }`}
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Outer Carton Condition</label>
                <select
                  value={cartonCondition}
                  onChange={(e: any) => setCartonCondition(e.target.value)}
                  className={`w-full bg-[#0b1329] border rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none ${
                    cartonCondition !== 'Intact & Sealed' ? 'border-amber-500 text-amber-300' : 'border-[#1f2e5a] focus:border-indigo-400'
                  }`}
                >
                  <option value="Intact & Sealed">Intact &amp; Sealed (Clean)</option>
                  <option value="Carton Damaged">Carton Damaged / Crushed</option>
                  <option value="Tampered Tape / Cut Seal">Tampered Tape / Cut Seal</option>
                </select>
              </div>
            </div>

            {(isQtyMismatch || isCartonIssue) && (
              <div className="mt-3">
                <label className="block text-[11px] text-rose-300 font-semibold mb-1">
                  Package / Discrepancy Remarks
                </label>
                <input
                  type="text"
                  value={qtyDiscrepancyNote}
                  onChange={(e) => setQtyDiscrepancyNote(e.target.value)}
                  placeholder="e.g. Shortage of 1 unit. Outer box was received in crushed state."
                  className="w-full bg-[#0b1329] border border-rose-500/40 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-400"
                />
              </div>
            )}
          </div>

          {/* Section 3: Stage 2 - Part-wise Matching & Condition Table */}
          <div className="p-3.5 rounded-lg bg-[#101a35] border border-[#1f2e5a]">
            <div className="flex items-center justify-between border-b border-[#1f2e5a] pb-2 mb-3">
              <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-4 h-4" />
                Stage 2: Part-wise Matching &amp; Line Items ({orderItems.length})
              </span>
              <button
                type="button"
                onClick={handleMarkAllMatchedPassed}
                className="px-2.5 py-1 rounded bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <CheckSquare className="w-3.5 h-3.5 text-indigo-300" />
                Mark All Matched &amp; Passed
              </button>
            </div>

            {/* Simple Clean Table */}
            <div className="overflow-x-auto rounded-lg border border-[#1f2e5a]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0b1329] text-slate-400 border-b border-[#1f2e5a]">
                  <tr>
                    <th className="py-2.5 px-3 text-center w-16">Matched?</th>
                    <th className="py-2.5 px-3">SR Number</th>
                    <th className="py-2.5 px-3">Defective Part No</th>
                    <th className="py-2.5 px-3">Category &amp; Description</th>
                    <th className="py-2.5 px-3">SR Fault</th>
                    <th className="py-2.5 px-3 w-40">Condition Verdict</th>
                    <th className="py-2.5 px-3">Discrepancy Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1f2e5a]/60 bg-[#0d1630]">
                  {orderItems.map((item) => {
                    const screen = screeningMap[item.id] || { status: 'Passed', remarks: '', partMatched: true };
                    const isMatched = screen.partMatched !== false;
                    const isProblem = !isMatched || screen.status !== 'Passed';

                    return (
                      <tr 
                        key={item.id} 
                        className={`transition-colors ${isProblem ? 'bg-rose-950/20' : 'hover:bg-slate-800/30'}`}
                      >
                        {/* Matched Checkbox */}
                        <td className="py-2.5 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={isMatched}
                            onChange={() => handleTogglePartMatch(item.id)}
                            className="w-4 h-4 rounded border-slate-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-500"
                            title={isMatched ? 'Part matched' : 'Wrong part'}
                          />
                        </td>

                        {/* SR Number */}
                        <td className="py-2.5 px-3 font-mono text-white whitespace-nowrap">
                          {item.sr_number}
                        </td>

                        {/* Defective Part Number */}
                        <td className="py-2.5 px-3 font-mono text-cyan-300 whitespace-nowrap">
                          {item.sr_part_number}
                          {!isMatched && (
                            <span className="block text-[10px] text-rose-400 font-sans font-semibold">
                              Wrong Part
                            </span>
                          )}
                        </td>

                        {/* Category & Description */}
                        <td className="py-2.5 px-3 max-w-[200px]">
                          <div className="text-slate-200 truncate font-medium">{item.part_category}</div>
                          <div className="text-[11px] text-slate-400 truncate">{item.part_description}</div>
                        </td>

                        {/* Fault Description */}
                        <td className="py-2.5 px-3 max-w-[140px] truncate text-slate-400" title={item.sr_fault_description}>
                          {item.sr_fault_description || '-'}
                        </td>

                        {/* Condition Selector */}
                        <td className="py-2.5 px-3">
                          <select
                            value={screen.status}
                            onChange={(e: any) => handleStatusChange(item.id, e.target.value)}
                            className={`w-full rounded px-2 py-1 text-xs border focus:outline-none ${
                              screen.status === 'Passed'
                                ? 'bg-[#0b1329] border-[#1f2e5a] text-emerald-400'
                                : screen.status === 'Damaged'
                                ? 'bg-amber-950/40 border-amber-500/50 text-amber-300 font-semibold'
                                : 'bg-rose-950/40 border-rose-500/50 text-rose-300 font-semibold'
                            }`}
                          >
                            <option value="Passed">Passed (OK)</option>
                            <option value="Damaged">Transit Damage</option>
                            <option value="Missing">Missing</option>
                            <option value="Failed">Failed Inspection</option>
                          </select>
                        </td>

                        {/* Discrepancy Remarks Input */}
                        <td className="py-2.5 px-3">
                          <input
                            type="text"
                            value={screen.remarks || ''}
                            onChange={(e) => handleRemarksChange(item.id, e.target.value)}
                            placeholder={isProblem ? 'Enter reason (damage, crack, wrong part...)' : 'Optional notes'}
                            className={`w-full rounded px-2 py-1 text-xs bg-[#0b1329] border text-slate-200 placeholder-slate-500 focus:outline-none ${
                              isProblem ? 'border-rose-500/50 focus:border-rose-400' : 'border-[#1f2e5a] focus:border-indigo-400'
                            }`}
                          />
                        </td>
                      </tr>
                    );
                  })}

                  {isLoadingItems && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                          <span>Retrieving line items from database...</span>
                        </div>
                      </td>
                    </tr>
                  )}

                  {!isLoadingItems && orderItems.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                        No constituent defective line items found for this shipping order.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 4: Routing Outcome Banner */}
          <div className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-3 ${
            isDiscrepancy 
              ? 'bg-rose-500/10 border-rose-500/40 text-rose-200'
              : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
          }`}>
            <div className="flex items-center gap-2">
              {isDiscrepancy ? (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              <span>
                {isDiscrepancy ? (
                  <>
                    <strong>Discrepancy Tagged:</strong> Consignment will be moved to <strong className="text-white">⚠️ CWH Received - Discrepancies</strong> queue (Status: <em>CWH Received - Discrepancies</em>).
                  </>
                ) : (
                  <>
                    <strong>Clean Inward:</strong> All units and parts verified clean. Consignment will be moved to <strong className="text-white">🏢 At CWH → Create DC to RC</strong> queue.
                  </>
                )}
              </span>
            </div>
          </div>

          {/* Submit / Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-[#1f2e5a]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`px-5 py-2 rounded-lg text-xs font-semibold text-white shadow-md flex items-center gap-1.5 transition-all ${
                isDiscrepancy 
                  ? 'bg-rose-600 hover:bg-rose-500'
                  : 'bg-indigo-600 hover:bg-indigo-500'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              {isDiscrepancy ? 'Submit with Discrepancies' : 'Submit Clean Inward'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
