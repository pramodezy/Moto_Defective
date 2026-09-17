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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-50 text-[#001489] border border-blue-200">
              <Video className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 font-mono">{order.so_code}</h2>
                <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 font-medium">
                  CWH Inward Verification
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Station: <strong className="text-slate-800">{order.station_code}</strong> • Declared Value: <strong className="text-emerald-700 font-mono">{formatINR(order.total_declared_value)}</strong> • Operator: {user.full_name}
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

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs text-slate-700">
          
          {/* Section 1: CCTV Footage Link Input */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <label className="block text-xs font-semibold text-slate-800 mb-1.5 flex items-center gap-1.5">
              <Video className="w-3.5 h-3.5 text-[#001489]" />
              CCTV Footage Link / DVR Reference
              <span className="text-[11px] text-slate-500 font-normal">(Paste Google Drive link, Cloud URL, or DVR timestamp reference)</span>
            </label>
            <input
              type="text"
              value={cctvFootageUrl}
              onChange={(e) => setCctvFootageUrl(e.target.value)}
              placeholder="e.g. https://drive.google.com/file/d/1a2b3c... or CCTV Cam 02 (14:35:00)"
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#001489] font-mono"
            />
          </div>

          {/* Section 2: Stage 1 - Quantity & Carton Verification */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
              <span className="text-xs font-bold text-[#001489] uppercase tracking-wider flex items-center gap-1.5">
                <Package className="w-4 h-4" />
                Stage 1: Quantity &amp; Carton Verification
              </span>
              {isQtyMismatch && (
                <span className="text-[11px] px-2 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-300 font-semibold">
                  ⚠️ Qty Mismatch: Expected {expectedUnits} vs Physical {receivedQty}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-slate-600 font-medium mb-1">Expected Units (Manifest)</label>
                <div className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-mono font-bold text-slate-900">
                  {expectedUnits} units
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-600 font-medium mb-1">Physical Received Units</label>
                <input
                  type="number"
                  min={0}
                  max={999}
                  required
                  value={receivedQty}
                  onChange={(e) => setReceivedQty(parseInt(e.target.value, 10) || 0)}
                  className={`w-full bg-white border rounded-lg px-3 py-1.5 text-xs font-mono font-bold text-slate-900 focus:outline-none ${
                    isQtyMismatch ? 'border-rose-400 text-rose-800 bg-rose-50/30' : 'border-slate-300 focus:border-[#001489]'
                  }`}
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-600 font-medium mb-1">Outer Carton Condition</label>
                <select
                  value={cartonCondition}
                  onChange={(e: any) => setCartonCondition(e.target.value)}
                  className={`w-full bg-white border rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none ${
                    cartonCondition !== 'Intact & Sealed' ? 'border-amber-400 text-amber-900 bg-amber-50/30' : 'border-slate-300 focus:border-[#001489]'
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
                <label className="block text-[11px] text-rose-800 font-semibold mb-1">
                  Package / Discrepancy Remarks
                </label>
                <input
                  type="text"
                  value={qtyDiscrepancyNote}
                  onChange={(e) => setQtyDiscrepancyNote(e.target.value)}
                  placeholder="e.g. Shortage of 1 unit. Outer box was received in crushed state."
                  className="w-full bg-white border border-rose-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-rose-500"
                />
              </div>
            )}
          </div>

          {/* Section 3: Stage 2 - Part-wise Matching & Condition Table */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
              <span className="text-xs font-bold text-[#001489] uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-4 h-4" />
                Stage 2: Part-wise Matching &amp; Line Items ({orderItems.length})
              </span>
              <button
                type="button"
                onClick={handleMarkAllMatchedPassed}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-blue-50 text-[#001489] border border-blue-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                <CheckSquare className="w-3.5 h-3.5 text-[#001489]" />
                Mark All Matched &amp; Passed
              </button>
            </div>

            {/* Simple Clean Table */}
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/90 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3 text-center w-16">Matched?</th>
                    <th className="py-2.5 px-3 font-semibold">SR Number</th>
                    <th className="py-2.5 px-3 font-semibold">Defective Part No</th>
                    <th className="py-2.5 px-3 font-semibold">Category &amp; Description</th>
                    <th className="py-2.5 px-3 font-semibold">SR Fault</th>
                    <th className="py-2.5 px-3 w-40 font-semibold">Condition Verdict</th>
                    <th className="py-2.5 px-3 font-semibold">Discrepancy Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {orderItems.map((item) => {
                    const screen = screeningMap[item.id] || { status: 'Passed', remarks: '', partMatched: true };
                    const isMatched = screen.partMatched !== false;
                    const isProblem = !isMatched || screen.status !== 'Passed';

                    return (
                      <tr 
                        key={item.id} 
                        className={`transition-colors ${isProblem ? 'bg-rose-50/40 hover:bg-rose-50/70' : 'hover:bg-slate-50'}`}
                      >
                        {/* Matched Checkbox */}
                        <td className="py-2.5 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={isMatched}
                            onChange={() => handleTogglePartMatch(item.id)}
                            className="w-4 h-4 rounded border-slate-300 text-[#001489] focus:ring-[#001489] cursor-pointer accent-[#001489]"
                            title={isMatched ? 'Part matched' : 'Wrong part'}
                          />
                        </td>

                        {/* SR Number */}
                        <td className="py-2.5 px-3 font-mono font-medium text-slate-900 whitespace-nowrap">
                          {item.sr_number}
                        </td>

                        {/* Defective Part Number */}
                        <td className="py-2.5 px-3 font-mono text-[#001489] font-bold whitespace-nowrap">
                          {item.sr_part_number}
                          {!isMatched && (
                            <span className="block text-[10px] text-rose-600 font-sans font-bold">
                              Wrong Part
                            </span>
                          )}
                        </td>

                        {/* Category & Description */}
                        <td className="py-2.5 px-3 max-w-[200px]">
                          <div className="text-slate-900 truncate font-medium">{item.part_category}</div>
                          <div className="text-[11px] text-slate-500 truncate">{item.part_description}</div>
                        </td>

                        {/* Fault Description */}
                        <td className="py-2.5 px-3 max-w-[140px] truncate text-slate-600" title={item.sr_fault_description}>
                          {item.sr_fault_description || '-'}
                        </td>

                        {/* Condition Selector */}
                        <td className="py-2.5 px-3">
                          <select
                            value={screen.status}
                            onChange={(e: any) => handleStatusChange(item.id, e.target.value)}
                            className={`w-full rounded px-2 py-1 text-xs border font-medium focus:outline-none ${
                              screen.status === 'Passed'
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                : screen.status === 'Damaged'
                                ? 'bg-amber-50 border-amber-300 text-amber-800 font-semibold'
                                : 'bg-rose-50 border-rose-300 text-rose-800 font-semibold'
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
                            className={`w-full rounded px-2 py-1 text-xs bg-white border text-slate-800 placeholder-slate-400 focus:outline-none ${
                              isProblem ? 'border-rose-300 focus:border-rose-500' : 'border-slate-300 focus:border-[#001489]'
                            }`}
                          />
                        </td>
                      </tr>
                    );
                  })}

                  {isLoadingItems && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500 text-xs">
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 text-[#001489] animate-spin" />
                          <span>Retrieving line items from database...</span>
                        </div>
                      </td>
                    </tr>
                  )}

                  {!isLoadingItems && orderItems.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500 text-xs">
                        No constituent defective line items found for this shipping order.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 4: Routing Outcome Banner */}
          <div className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 ${
            isDiscrepancy 
              ? 'bg-rose-50 border-rose-300 text-rose-900'
              : 'bg-emerald-50 border-emerald-300 text-emerald-900'
          }`}>
            <div className="flex items-center gap-2">
              {isDiscrepancy ? (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              )}
              <span>
                {isDiscrepancy ? (
                  <>
                    <strong>Discrepancy Tagged:</strong> Consignment will be moved to <strong className="text-slate-900">⚠️ CWH Received - Discrepancies</strong> queue (Status: <em>CWH Received - Discrepancies</em>).
                  </>
                ) : (
                  <>
                    <strong>Clean Inward:</strong> All units and parts verified clean. Consignment will be moved to <strong className="text-slate-900">🏢 At CWH → Create DC to RC</strong> queue.
                  </>
                )}
              </span>
            </div>
          </div>

          {/* Submit / Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`px-5 py-2 rounded-lg text-xs font-semibold text-white shadow-sm flex items-center gap-1.5 transition-all ${
                isDiscrepancy 
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-[#001489] hover:bg-[#08209e]'
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
