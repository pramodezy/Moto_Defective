import React, { useState, useMemo } from 'react';
import {
  X,
  Truck,
  CheckCircle2,
  AlertTriangle,
  Barcode,
  Layers,
  Calendar,
  FileSpreadsheet,
  Building2,
  ShieldCheck,
  Search,
  CheckSquare,
  Square,
  Sparkles
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { ShippingOrder, DefectiveItem, CCIMaster, UserProfile } from '../../types/crm';
import { formatINR, formatDate } from '../../lib/utils';
import { getMotorolaStatusInfo } from '../../lib/motorolaStatus';
import { crmDb } from '../../lib/db';
import { toast } from 'sonner';

interface BulkPickupModalProps {
  initialSelectedOrders: ShippingOrder[];
  allOrders: ShippingOrder[];
  items: DefectiveItem[];
  stations: CCIMaster[];
  user: UserProfile;
  onClose: () => void;
  onSuccess: (updatedCount: number) => void;
}

const COURIER_OPTIONS = [
  'Keep Existing Assigned Couriers',
  'BlueDart Express',
  'Delhivery Surface',
  'DTDC Express',
  'FedEx India',
  'Shadowfax Logistics',
  'XpressBees',
  'Safechem Logistics',
  'Other Regional Courier',
];

export const BulkPickupModal: React.FC<BulkPickupModalProps> = ({
  initialSelectedOrders,
  allOrders,
  items,
  stations,
  user,
  onClose,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'selected' | 'paste'>('selected');
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(() => {
    return new Set(initialSelectedOrders.map((o) => o.id));
  });

  const [pastedText, setPastedText] = useState('');
  const [pickupDate, setPickupDate] = useState(() => new Date().toISOString().slice(0, 16));
  const [courierOverride, setCourierOverride] = useState<string>('Keep Existing Assigned Couriers');
  const [runSheetRef, setRunSheetRef] = useState('');
  const [remarks, setRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Station mapping
  const stationMap = useMemo(() => {
    const map = new Map<string, CCIMaster>();
    stations.forEach((st) => {
      map.set(st.station_code, st);
      map.set(st.station_code.padStart(3, '0'), st);
    });
    return map;
  }, [stations]);

  // Selected orders array
  const selectedOrders = useMemo(() => {
    return allOrders.filter((o) => selectedOrderIds.has(o.id));
  }, [allOrders, selectedOrderIds]);

  // Item counts & values
  const totalUnits = useMemo(() => {
    const selectedCodes = new Set(selectedOrders.map((o) => o.so_code));
    return items
      .filter((it) => selectedCodes.has(it.shipping_order_code))
      .reduce((sum, it) => sum + (it.quantity || 1), 0);
  }, [selectedOrders, items]);

  const totalValue = useMemo(() => {
    return selectedOrders.reduce((sum, o) => sum + (o.total_declared_value || 0), 0);
  }, [selectedOrders]);

  // Analyze eligibility of selected orders
  const eligibilityAnalysis = useMemo(() => {
    const eligible: ShippingOrder[] = [];
    const ineligible: { order: ShippingOrder; reason: string }[] = [];

    for (const order of selectedOrders) {
      const activeAwb = order.active_awb || order.excel_ref_awb;
      const motoInfo = getMotorolaStatusInfo(order.motorola_status);

      if (!activeAwb) {
        ineligible.push({ order, reason: 'Pending AWB: CWH has not issued an AWB token yet' });
        continue;
      }
      if (
        order.crm_status === 'Delivered at CWH' ||
        order.crm_status === 'Pending Inward at CWH' ||
        order.crm_status === 'CWH to Create DC' ||
        order.crm_status === 'Pickup Pending for RC' ||
        order.crm_status === 'In Transit to RC' ||
        order.crm_status === 'CWH Shipped to RC' ||
        order.crm_status === 'Delivered to RC' ||
        order.crm_status === 'Delivered to RC (Discrepancies)' ||
        motoInfo.isDelivered
      ) {
        ineligible.push({ order, reason: `Already arrived at CWH or downstream stage (${order.crm_status})` });
        continue;
      }

      eligible.push(order);
    }

    return { eligible, ineligible };
  }, [selectedOrders]);

  // Handler for parsing pasted codes
  const handleApplyPaste = () => {
    const tokens = pastedText
      .split(/[\n,;\t\s]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);

    if (tokens.length === 0) {
      toast.error('Please paste at least one SO Code or AWB number');
      return;
    }

    const tokenSet = new Set(tokens);
    const matched = allOrders.filter((o) => {
      if (tokenSet.has(o.so_code.toUpperCase()) || tokenSet.has(o.id.toUpperCase())) return true;
      if (o.active_awb && tokenSet.has(o.active_awb.trim().toUpperCase())) return true;
      if (o.excel_ref_awb && tokenSet.has(o.excel_ref_awb.trim().toUpperCase())) return true;
      return false;
    });

    if (matched.length === 0) {
      toast.error(`No consignments matched the ${tokens.length} pasted codes/AWBs.`);
      return;
    }

    const newSet = new Set(selectedOrderIds);
    matched.forEach((o) => newSet.add(o.id));
    setSelectedOrderIds(newSet);
    toast.success(`Matched and added ${matched.length} consignments to batch!`);
    setActiveTab('selected');
    setPastedText('');
  };

  const toggleOrderSelection = (id: string) => {
    const next = new Set(selectedOrderIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedOrderIds(next);
  };

  const removeIneligible = () => {
    const eligibleIds = new Set(eligibilityAnalysis.eligible.map((o) => o.id));
    setSelectedOrderIds(eligibleIds);
    toast.success(`Removed ${eligibilityAnalysis.ineligible.length} ineligible consignments from selection`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (eligibilityAnalysis.eligible.length === 0) {
      toast.error('No eligible consignments selected for pickup confirmation.');
      return;
    }

    setIsSubmitting(true);
    try {
      const courier = courierOverride !== 'Keep Existing Assigned Couriers' ? courierOverride : undefined;
      const combinedRemarks = [
        runSheetRef ? `Run Sheet / Docket: ${runSheetRef}` : '',
        remarks ? remarks.trim() : '',
      ]
        .filter(Boolean)
        .join(' | ');

      const eligibleCodes = eligibilityAnalysis.eligible.map((o) => o.so_code);
      const result = crmDb.bulkConfirmPickupDone(eligibleCodes, user, {
        pickupDate: pickupDate ? new Date(pickupDate).toISOString() : new Date().toISOString(),
        courier,
        remarks: combinedRemarks || 'Bulk pickup verified and confirmed by Admin',
      });

      confetti({
        particleCount: 75,
        spread: 70,
        origin: { y: 0.6 },
      });

      toast.success(
        `Successfully marked ${result.successCount} consignments as Pickup Done (In Transit)!`
      );

      if (result.skippedOrders.length > 0) {
        toast.warning(`Skipped ${result.skippedOrders.length} orders that were ineligible`);
      }

      onSuccess(result.successCount);
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to complete bulk pickup confirmation');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#0f172a] border border-[#1e293b] rounded-2xl w-full max-w-4xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden text-slate-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#1e293b] flex items-center justify-between bg-[#131d36]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">
                  Admin Bulk Pickup Confirmation
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  ADMIN RIGHTS
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Acknowledge courier physical collection & transition multiple consignments to In Transit in one batch
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-3 bg-[#0b1329] border-b border-[#1e293b] text-xs">
          <div className="bg-[#131d36] p-2.5 rounded-lg border border-[#1e293b]">
            <span className="text-slate-400 block text-[11px]">Selected Consignments</span>
            <span className="text-base font-bold text-white font-mono">{selectedOrders.length}</span>
          </div>
          <div className="bg-[#131d36] p-2.5 rounded-lg border border-[#1e293b]">
            <span className="text-slate-400 block text-[11px]">Defective Units</span>
            <span className="text-base font-bold text-cyan-400 font-mono">{totalUnits} units</span>
          </div>
          <div className="bg-[#131d36] p-2.5 rounded-lg border border-[#1e293b]">
            <span className="text-slate-400 block text-[11px]">Total Declared Value</span>
            <span className="text-base font-bold text-emerald-400 font-mono">{formatINR(totalValue)}</span>
          </div>
          <div className="bg-[#131d36] p-2.5 rounded-lg border border-[#1e293b]">
            <span className="text-slate-400 block text-[11px]">Eligible for Pickup</span>
            <span className="text-base font-bold text-blue-400 font-mono">
              {eligibilityAnalysis.eligible.length}
              {eligibilityAnalysis.ineligible.length > 0 && (
                <span className="text-xs text-amber-400 font-normal ml-1">
                  ({eligibilityAnalysis.ineligible.length} invalid)
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Ineligible warning banner if any */}
        {eligibilityAnalysis.ineligible.length > 0 && (
          <div className="px-6 py-2 bg-amber-950/40 border-b border-amber-900/50 flex items-center justify-between text-xs text-amber-300">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                {eligibilityAnalysis.ineligible.length} selected consignment(s) cannot be confirmed (missing AWB or already at CWH).
              </span>
            </div>
            <button
              onClick={removeIneligible}
              type="button"
              className="px-2 py-0.5 rounded bg-amber-800/50 hover:bg-amber-800 text-amber-200 text-[11px] font-semibold transition-colors"
            >
              Deselect Ineligible
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-[#1e293b] bg-[#0d1527]">
          <button
            type="button"
            onClick={() => setActiveTab('selected')}
            className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'selected'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Selected Consignments ({selectedOrders.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('paste')}
            className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'paste'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Paste SO Codes / AWBs
          </button>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {activeTab === 'paste' ? (
            <div className="space-y-3">
              <div className="bg-[#131d36] border border-[#1e293b] p-4 rounded-xl">
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Bulk Quick Entry (Paste SO Codes or Courier AWB Numbers)
                </label>
                <p className="text-[11px] text-slate-400 mb-3">
                  Paste a list copied from your Excel run sheet, courier docket, or manifest. Separate with commas, tabs, or newlines.
                </p>
                <textarea
                  rows={6}
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder="Example:&#10;SORLC26091400342&#10;SORLC26091400343&#10;114589204481&#10;114589204482"
                  className="w-full bg-[#0b1329] border border-[#1e293b] rounded-lg p-3 text-xs font-mono text-cyan-300 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <div className="flex justify-end gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => setPastedText('')}
                    className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700"
                  >
                    Clear Text
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyPaste}
                    className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 flex items-center gap-1.5 shadow-md shadow-blue-900/30"
                  >
                    <Search className="w-3.5 h-3.5" />
                    Match & Add to Batch
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Consignments Table */}
              <div className="border border-[#1e293b] rounded-xl overflow-hidden bg-[#131d36]/60">
                <div className="max-h-60 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-[#0b1329] text-slate-400 uppercase text-[10px] tracking-wider border-b border-[#1e293b]">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={selectedOrders.length > 0 && selectedOrders.every((o) => selectedOrderIds.has(o.id))}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedOrderIds(new Set(allOrders.map((o) => o.id)));
                              } else {
                                setSelectedOrderIds(new Set());
                              }
                            }}
                            className="rounded border-slate-700 text-blue-600 focus:ring-0 cursor-pointer"
                          />
                        </th>
                        <th className="py-2.5 px-3">SO Code</th>
                        <th className="py-2.5 px-3">Station</th>
                        <th className="py-2.5 px-3">Courier & AWB</th>
                        <th className="py-2.5 px-3">Current Status</th>
                        <th className="py-2.5 px-3">Eligibility</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1e293b]/60">
                      {selectedOrders.map((so) => {
                        const activeAwb = so.active_awb || so.excel_ref_awb;
                        const motoInfo = getMotorolaStatusInfo(so.motorola_status);
                        const isEligible =
                          activeAwb &&
                          so.crm_status !== 'Delivered at CWH' &&
                          so.crm_status !== 'Pending Inward at CWH' &&
                          so.crm_status !== 'CWH to Create DC' &&
                          so.crm_status !== 'Pickup Pending for RC' &&
                          so.crm_status !== 'In Transit to RC' &&
                          so.crm_status !== 'CWH Shipped to RC' &&
                          so.crm_status !== 'Delivered to RC' &&
                          so.crm_status !== 'Delivered to RC (Discrepancies)' &&
                          !motoInfo.isDelivered;

                        const station = stationMap.get(so.station_code);

                        return (
                          <tr
                            key={so.id}
                            className={`hover:bg-slate-800/40 transition-colors ${
                              !isEligible ? 'opacity-60 bg-amber-950/10' : ''
                            }`}
                          >
                            <td className="py-2 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={selectedOrderIds.has(so.id)}
                                onChange={() => toggleOrderSelection(so.id)}
                                className="rounded border-slate-700 text-blue-600 focus:ring-0 cursor-pointer"
                              />
                            </td>
                            <td className="py-2 px-3 font-mono font-semibold text-white">
                              {so.so_code}
                            </td>
                            <td className="py-2 px-3 text-slate-300">
                              <span className="font-mono text-[11px] text-cyan-300 mr-1.5">
                                {so.station_code}
                              </span>
                              <span className="text-slate-400 text-[11px]">
                                {station?.station_name || so.station_code}
                              </span>
                            </td>
                            <td className="py-2 px-3">
                              {activeAwb ? (
                                <div>
                                  <span className="font-mono text-emerald-400 font-semibold block text-[11px]">
                                    {activeAwb}
                                  </span>
                                  <span className="text-[10px] text-slate-400">
                                    {so.courier || 'BlueDart'}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-amber-400 text-[11px] font-semibold">
                                  No AWB
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3">
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                                {so.crm_status}
                              </span>
                            </td>
                            <td className="py-2 px-3">
                              {isEligible ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                  Ready
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] text-amber-400 font-semibold" title={!activeAwb ? 'Missing AWB' : 'Already at/past CWH'}>
                                  <AlertTriangle className="w-3 h-3 text-amber-500" />
                                  {!activeAwb ? 'Needs AWB' : 'At CWH'}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}

                      {selectedOrders.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-500">
                            No consignments currently selected. Choose from table or paste codes.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Handover Parameters Form */}
              <div className="bg-[#131d36] border border-[#1e293b] p-4 rounded-xl space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
                  <ShieldCheck className="w-4 h-4 text-cyan-400" />
                  Courier Handover Parameters
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  {/* Pickup Date & Time */}
                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">
                      Physical Pickup Date & Time
                    </label>
                    <input
                      type="datetime-local"
                      value={pickupDate}
                      onChange={(e) => setPickupDate(e.target.value)}
                      className="w-full bg-[#0b1329] border border-[#1e293b] rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* Courier Override */}
                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">
                      Courier Partner
                    </label>
                    <select
                      value={courierOverride}
                      onChange={(e) => setCourierOverride(e.target.value)}
                      className="w-full bg-[#0b1329] border border-[#1e293b] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                    >
                      {COURIER_OPTIONS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Courier Run Sheet / Docket */}
                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">
                      Courier Run Sheet / Docket Ref (Optional)
                    </label>
                    <input
                      type="text"
                      value={runSheetRef}
                      onChange={(e) => setRunSheetRef(e.target.value)}
                      placeholder="e.g. BD-DEL-RUN-98431"
                      className="w-full bg-[#0b1329] border border-[#1e293b] rounded-lg px-3 py-2 text-xs font-mono text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* Operation Notes */}
                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">
                      Admin Notes / Handover Remarks
                    </label>
                    <input
                      type="text"
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      placeholder="e.g. Verified against physical courier handover sheet"
                      className="w-full bg-[#0b1329] border border-[#1e293b] rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-[#1e293b] bg-[#0b1329] flex items-center justify-between">
          <div className="text-xs text-slate-400">
            {eligibilityAnalysis.eligible.length > 0 ? (
              <span className="text-emerald-400 font-semibold">
                ✓ {eligibilityAnalysis.eligible.length} consignment(s) will transition to 'In Transit'
              </span>
            ) : (
              <span className="text-slate-500">Select at least one eligible consignment</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || eligibilityAnalysis.eligible.length === 0}
              className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-blue-900/40 flex items-center gap-2 cursor-pointer transition-all"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Processing Bulk Confirmation...</span>
                </>
              ) : (
                <>
                  <Truck className="w-4 h-4" />
                  <span>
                    Confirm Pickup Done ({eligibilityAnalysis.eligible.length} Orders)
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
