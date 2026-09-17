import { CRMStatus, ShippingOrder, DefectiveItem } from '../types/crm';

export interface MotorolaStatusDefinition {
  statusKey: string;
  code: number;
  label: string;
  meaning: string;
  responsibleRole: 'CCI' | 'CWH' | 'RC' | 'NONE';
  badgeClass: string;
  isDelivered: boolean;
  isAwbRequired: boolean;
  actionPrompt?: string;
}

export const MOTOROLA_STATUS_DEFINITIONS: Record<string, MotorolaStatusDefinition> = {
  'not return': {
    statusKey: 'Not Return',
    code: 1,
    label: 'Not Return',
    meaning: 'CCI to Create DC in Moto CRM',
    responsibleRole: 'CCI',
    badgeClass: 'bg-amber-50 text-amber-900 border-amber-300 font-medium',
    isDelivered: false,
    isAwbRequired: false,
    actionPrompt: 'Action required by CCI: Create DC in Moto CRM to dispatch parts',
  },
  'cci send to cwh': {
    statusKey: 'CCI Send To CWH',
    code: 2,
    label: 'CCI Send to CWH',
    meaning: 'DC created by CCI in Moto CRM (Active Logistics)',
    responsibleRole: 'CCI',
    badgeClass: 'bg-sky-50 text-sky-800 border-sky-300 font-medium',
    isDelivered: false,
    isAwbRequired: true,
    actionPrompt: 'Active logistics: CWH to issue AWB -> CCI to handover (Pickup Done)',
  },
  'cwh received': {
    statusKey: 'CWH Received',
    code: 3,
    label: 'CWH Received',
    meaning: 'Received by CWH in Moto CRM (Physical verification complete)',
    responsibleRole: 'CWH',
    badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-300 font-medium',
    isDelivered: false,
    isAwbRequired: false,
    actionPrompt: 'Action required by CWH: Unbox, verify and create DC to RC in Lenovo CRM',
  },
  'cwh received - discrepancies': {
    statusKey: 'CWH Received - Discrepancies',
    code: 35,
    label: 'CWH Received - Discrepancies',
    meaning: 'Inward verified at CWH with Discrepancies (Shortage / Damage / Mismatch)',
    responsibleRole: 'CWH',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-300 font-medium',
    isDelivered: false,
    isAwbRequired: false,
    actionPrompt: 'Discrepancy recorded at CWH unboxing station. Review inspection & escalate.',
  },
  'asp send to rc': {
    statusKey: 'ASP Send To RC',
    code: 4,
    label: 'ASP Send to RC',
    meaning: 'CWH created DC to RC for dispatch in Lenovo CRM',
    responsibleRole: 'CWH',
    badgeClass: 'bg-blue-50 text-blue-800 border-blue-300 font-medium',
    isDelivered: false,
    isAwbRequired: false,
    actionPrompt: 'In Transit from CWH to Repair Center (RC)',
  },
  'rc received asp': {
    statusKey: 'RC Received ASP',
    code: 5,
    label: 'RC Received ASP',
    meaning: 'RC received parts in Moto CRM (Completed / Delivered)',
    responsibleRole: 'RC',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-300 font-medium',
    isDelivered: true,
    isAwbRequired: false,
    actionPrompt: 'Delivered to Repair Center (RC)',
  },
  'rc received asp(negative)': {
    statusKey: 'RC Received ASP(Negative)',
    code: 6,
    label: 'RC Received ASP(Negative)',
    meaning: 'Discrepancy at RC (Sent from CWH to RC, but found missing/damaged)',
    responsibleRole: 'CWH',
    badgeClass: 'bg-rose-100 text-rose-900 border-rose-400 font-bold',
    isDelivered: false,
    isAwbRequired: false,
    actionPrompt: 'Action required by CWH: RC flagged discrepancy. Investigate with courier/RC.',
  },
};

/**
 * Normalizes any variation of Motorola parts status string
 */
export function normalizeMotoStatusKey(status?: string | null): string {
  if (!status) return 'cci send to cwh';
  const clean = status.trim().toLowerCase().replace(/\s+/g, ' ');
  if (clean.includes('discrepanc')) return 'cwh received - discrepancies';
  if (clean.includes('negative') || clean.includes('(negative)')) return 'rc received asp(negative)';
  if (clean.includes('rc received')) return 'rc received asp';
  if (clean.includes('send to rc')) return 'asp send to rc';
  if (clean.includes('cwh received')) return 'cwh received';
  if (clean.includes('not return')) return 'not return';
  if (clean.includes('cci send')) return 'cci send to cwh';
  return clean;
}

/**
 * Checks if a Motorola status represents a completed finished journey (Code 5: RC Received ASP).
 * Excludes RC Received ASP(Negative) which is a discrepancy.
 */
export function isCompletedJourneyStatus(status?: string | null): boolean {
  return normalizeMotoStatusKey(status) === 'rc received asp';
}

/**
 * Returns metadata and actionable rules for a given Motorola parts status
 */
export function getMotorolaStatusInfo(status?: string | null): MotorolaStatusDefinition {
  const key = normalizeMotoStatusKey(status);
  return (
    MOTOROLA_STATUS_DEFINITIONS[key] || {
      statusKey: status || 'Unknown',
      code: 0,
      label: status || 'Unknown',
      meaning: 'Operational parts record',
      responsibleRole: 'NONE',
      badgeClass: 'bg-slate-700/30 text-slate-300 border-slate-600',
      isDelivered: false,
      isAwbRequired: false,
    }
  );
}

/**
 * Derives CRM logistics status accurately from Motorola Parts Status, AWB token, and Operational flags
 */
export function deriveCrmStatusFromMotorolaStatus(
  motoStatus?: string | null,
  awb?: string | null,
  existingCrmStatus?: CRMStatus,
  pickupStatus?: string | null,
  screeningStatus?: string | null
): CRMStatus {
  const norm = normalizeMotoStatusKey(motoStatus);

  // 12. RC Received ASP: Delivered to RC
  if (norm === 'rc received asp') {
    return 'Delivered to RC';
  }

  // 13. RC Received ASP(Negative): Discrepancy at destination RC
  if (norm === 'rc received asp(negative)' || norm.includes('negative')) {
    return 'Delivered to RC (Discrepancies)';
  }

  // 10 & 11. ASP Send To RC: Outbound leg from CWH to RC
  if (norm === 'asp send to rc') {
    if (existingCrmStatus === 'In Transit to RC' || pickupStatus === 'Pickup Done') {
      return 'In Transit to RC';
    }
    return 'Pickup Pending for RC';
  }

  // 9. CWH Received: Formal inward complete -> CWH to Create DC to RC
  if (norm === 'cwh received') {
    return 'CWH to Create DC';
  }

  // 1. Not Return: DC not yet created by CCI in Moto CRM
  if (norm === 'not return') {
    return 'CCI to Create DC';
  }

  // 2 - 8. CCI Send To CWH: Active Inbound Leg (CCI -> CWH)
  if (norm === 'cci send to cwh') {
    // If discrepancy flagged during CWH screening
    if (screeningStatus === 'Damaged' || screeningStatus === 'Missing' || screeningStatus === 'Failed' || existingCrmStatus === 'Discrepancies') {
      return 'Discrepancies';
    }
    // If screening passed / staging for inward
    if (screeningStatus === 'Passed' || existingCrmStatus === 'Pending Inward at CWH') {
      return 'Pending Inward at CWH';
    }
    // If physically arrived at CWH bay
    if (existingCrmStatus === 'Delivered at CWH') {
      return 'Delivered at CWH';
    }
    // If CCI flagged Pickup Not Done -> Pending AWB Re-Issue
    if (pickupStatus === 'Pickup Not Done' || existingCrmStatus === 'Pending AWB Re-Issue') {
      return 'Pending AWB Re-Issue';
    }
    // If CCI confirmed Pickup Done -> In Transit
    if (pickupStatus === 'Pickup Done' || existingCrmStatus === 'In Transit') {
      return 'In Transit';
    }
    // If AWB is issued by CWH -> Pickup Pending
    if (awb && awb.trim()) {
      return 'Pickup Pending';
    }
    // Default initial state awaiting AWB generation
    return 'Pending AWB';
  }

  return existingCrmStatus || (awb && awb.trim() ? 'Pickup Pending' : 'Pending AWB');
}

/**
 * Checks whether an AWB needs to be issued by CWH.
 * Only Leg 1 consignments in Pending AWB or Pending AWB Re-Issue require AWB generation!
 * Consignments already at CWH Received, ASP Send to RC, or RC Received ASP NEVER require inbound AWB!
 */
export function isAwbIssueRequired(order: ShippingOrder): boolean {
  const info = getMotorolaStatusInfo(order.motorola_status);
  
  // Delivered or downstream CWH/RC stages: AWB issue definitely NOT required!
  if (
    info.isDelivered || 
    info.code === 3 || 
    info.code === 4 || 
    info.code === 5 || 
    info.code === 6 ||
    order.crm_status === 'Delivered to RC' ||
    order.crm_status === 'Delivered to RC (Discrepancies)' ||
    order.crm_status === 'In Transit to RC' ||
    order.crm_status === 'Pickup Pending for RC' ||
    order.crm_status === 'CWH to Create DC' ||
    order.crm_status === 'Pending Inward at CWH' ||
    order.crm_status === 'Delivered at CWH' ||
    order.crm_status === 'In Transit'
  ) {
    return false;
  }

  // Not Return: DC not created in Moto CRM yet
  if (info.code === 1 || order.crm_status === 'CCI to Create DC') {
    return false;
  }

  // Pending AWB Re-Issue: CCI reported Pickup Not Done; fresh token required
  if (order.crm_status === 'Pending AWB Re-Issue' || order.pickup_status === 'Pickup Not Done') {
    return true;
  }

  // Active Pending AWB without assigned token
  return order.crm_status === 'Pending AWB' && !order.active_awb && !order.excel_ref_awb;
}

export interface UnifiedStage {
  key: string;
  stageName: string;
  badgeClass: string;
  meaning: string;
  stageNumber: number;
}

/**
 * Single source of truth for the Unified CRM Journey Stage across CCI, CWH, and Admin.
 * Returns consistent stage name, badge styling, and explanation.
 */
export function getUnifiedStageDetails(order: {
  crm_status?: string | null;
  motorola_status?: string | null;
  pickup_status?: string | null;
  active_awb?: string | null;
  excel_ref_awb?: string | null;
}): UnifiedStage {
  const normMoto = normalizeMotoStatusKey(order.motorola_status);
  const motoInfo = getMotorolaStatusInfo(order.motorola_status);
  const crm = (order.crm_status || '').trim();

  // Stage 10: Delivered to RC (Discrepancies)
  if (
    motoInfo.code === 6 ||
    crm === 'Delivered to RC (Discrepancies)' ||
    normMoto.includes('negative')
  ) {
    return {
      key: 'delivered_rc_discrepancy',
      stageName: 'Delivered to RC (Discrepancies)',
      badgeClass: 'bg-rose-50 text-rose-800 border-rose-300 font-medium',
      meaning: 'Consignment received at Repair Center with flagged discrepancies.',
      stageNumber: 10,
    };
  }

  // Stage 9: Delivered to RC (Completed)
  if (
    motoInfo.code === 5 ||
    motoInfo.isDelivered ||
    crm === 'Delivered to RC' ||
    normMoto.includes('rc received')
  ) {
    return {
      key: 'delivered_rc',
      stageName: 'Delivered to RC',
      badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-300 font-medium',
      meaning: 'Consignment delivery confirmed and closed at Repair Center.',
      stageNumber: 9,
    };
  }

  // Stage 8: CWH Shipped to RC (ASP Send to RC - Outbound Leg 2)
  if (
    motoInfo.code === 4 ||
    normMoto === 'asp send to rc' ||
    normMoto.includes('send to rc') ||
    crm === 'In Transit to RC' ||
    crm === 'Pickup Pending for RC' ||
    crm === 'CWH Shipped to RC'
  ) {
    return {
      key: 'cwh_shipped_to_rc',
      stageName: 'CWH Shipped to RC',
      badgeClass: 'bg-blue-50 text-blue-800 border-blue-300 font-medium',
      meaning: 'Consignment outbound dispatch created by CWH and shipped to Repair Center.',
      stageNumber: 8,
    };
  }

  // Stage 7: Discrepancy Flagged at CWH Bay
  if (
    motoInfo.code === 35 ||
    crm === 'Discrepancies' ||
    normMoto.includes('discrepanc')
  ) {
    return {
      key: 'discrepancy_cwh',
      stageName: 'Discrepancy Flagged',
      badgeClass: 'bg-rose-50 text-rose-800 border-rose-300 font-medium',
      meaning: 'Physical package or unit count mismatch recorded during CWH screening.',
      stageNumber: 7,
    };
  }

  // Stage 6: At CWH (Inward & Screening)
  if (
    motoInfo.code === 3 ||
    normMoto.includes('cwh received') ||
    crm === 'Delivered at CWH' ||
    crm === 'Pending Inward at CWH' ||
    crm === 'CWH to Create DC'
  ) {
    return {
      key: 'at_cwh',
      stageName: 'At CWH (Inward & Screening)',
      badgeClass: 'bg-purple-50 text-purple-800 border-purple-300 font-medium',
      meaning: 'Consignment arrived at CWH bay for unboxing, CCTV inspection, and staging.',
      stageNumber: 6,
    };
  }

  // Stage 5: In-Transit to CWH (Leg 1 Inbound Transit)
  if (
    order.pickup_status === 'Pickup Done' ||
    crm === 'In Transit'
  ) {
    return {
      key: 'in_transit_cwh',
      stageName: 'In-Transit to CWH',
      badgeClass: 'bg-sky-50 text-sky-800 border-sky-300 font-medium',
      meaning: 'Courier picked up consignment from service center; en route to CWH.',
      stageNumber: 5,
    };
  }

  // Stage 4: Pending AWB Re-Issue (Exception Queue)
  if (
    order.pickup_status === 'Pickup Not Done' ||
    crm === 'Pending AWB Re-Issue'
  ) {
    return {
      key: 'awb_reissue',
      stageName: 'Pending AWB Re-Issue',
      badgeClass: 'bg-rose-50 text-rose-900 border-rose-300 font-bold',
      meaning: 'Service center reported Pickup Not Done. Courier token must be re-issued.',
      stageNumber: 4,
    };
  }

  // Stage 3: Pickup Pending (AWB assigned, awaiting handover)
  if (
    crm === 'Pickup Pending' ||
    (order.active_awb && order.active_awb.trim()) ||
    (order.excel_ref_awb && order.excel_ref_awb.trim())
  ) {
    return {
      key: 'pickup_pending',
      stageName: 'Pickup Pending',
      badgeClass: 'bg-amber-50 text-amber-900 border-amber-300 font-semibold',
      meaning: 'AWB token issued by CWH. Awaiting service center handover to courier.',
      stageNumber: 3,
    };
  }

  // Stage 2: Pending CWH AWB (DC created, awaiting CWH courier token)
  if (
    normMoto === 'cci send to cwh' ||
    crm === 'Pending AWB' ||
    crm === 'AWB Pending'
  ) {
    return {
      key: 'pending_awb',
      stageName: 'Pending CWH AWB',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200 font-medium',
      meaning: 'Delivery Challan created in Motorola CRM. Awaiting AWB token issuance from CWH.',
      stageNumber: 2,
    };
  }

  // Stage 1: CCI to Create DC
  if (
    normMoto === 'not return' ||
    crm === 'CCI to Create DC'
  ) {
    return {
      key: 'create_dc',
      stageName: 'CCI to Create DC',
      badgeClass: 'bg-amber-50 text-amber-900 border-amber-300 font-medium',
      meaning: 'Defective units awaiting Delivery Challan creation by service center in Motorola CRM.',
      stageNumber: 1,
    };
  }

  // Fallback
  return {
    key: 'pending_awb',
    stageName: crm || 'Pending CWH AWB',
    badgeClass: 'bg-slate-50 text-slate-700 border-slate-300 font-medium',
    meaning: 'Consignment processing in CRM.',
    stageNumber: 2,
  };
}

/**
 * Single source of truth for Pickup Status across all roles.
 * Once shipment reaches CWH Received or further, Pickup Status is '-' for everyone.
 */
export function getUnifiedPickupStatus(order: {
  motorola_status?: string | null;
  crm_status?: string | null;
  pickup_status?: string | null;
}): string {
  const moto = (order.motorola_status || '').toLowerCase();
  const motoInfo = getMotorolaStatusInfo(order.motorola_status);

  // STRICT RULE: Once shipment reaches CWH Received or further (Code >= 3, CWH Received, ASP Send to RC, RC Received),
  // Pickup from CCI has concluded -> return '-' across all roles
  if (
    motoInfo.code >= 3 ||
    motoInfo.code === 35 ||
    motoInfo.isDelivered ||
    moto.includes('cwh received') ||
    moto.includes('send to rc') ||
    moto.includes('rc received')
  ) {
    return '-';
  }

  // If Code 1 (Not Return): DC not created yet -> '-'
  if (motoInfo.code === 1 || moto.includes('not return')) {
    return '-';
  }

  // During Leg 1 (CCI Send to CWH):
  if (order.pickup_status === 'Pickup Done') {
    return 'Pickup Done';
  }
  if (order.pickup_status === 'Pickup Not Done' || order.crm_status === 'Pending AWB Re-Issue') {
    return 'Pickup Not Done';
  }
  if (order.pickup_status === 'Pickup Pending' || order.crm_status === 'Pickup Pending') {
    return 'Pickup Pending';
  }

  return '-';
}

export type CciActionType = 
  | 'CREATE_DC' 
  | 'PICKUP_HANDOVER_PENDING' 
  | 'AWAITING_CWH_AWB' 
  | 'AWAITING_REISSUE'
  | 'IN_TRANSIT_MONITOR' 
  | 'DELIVERED_CWH'
  | 'DISPATCHED_TO_RC'
  | 'DELIVERED_RC';

/**
 * Action evaluation for CCI Service Centers based on the 13 canonical stages
 */
export function getCciActionDetails(order: ShippingOrder): {
  isActionable: boolean;
  actionType: CciActionType;
  title: string;
  description: string;
  badgeClass: string;
} {
  const normMoto = normalizeMotoStatusKey(order.motorola_status);
  const motoInfo = getMotorolaStatusInfo(order.motorola_status);

  // 12 & 13. Delivered & Closed at RC (Code 5 & 6)
  if (
    motoInfo.code === 5 ||
    motoInfo.code === 6 ||
    motoInfo.isDelivered ||
    order.crm_status === 'Delivered to RC' ||
    order.crm_status === 'Delivered to RC (Discrepancies)' ||
    normMoto.includes('rc received')
  ) {
    return {
      isActionable: false,
      actionType: 'DELIVERED_RC',
      title: order.crm_status === 'Delivered to RC' ? 'Delivered to RC (Completed)' : 'Delivered to RC (Discrepancies)',
      description: 'Consignment delivery confirmed at Repair Center. Journey completed; CCI has no action to take.',
      badgeClass: order.crm_status === 'Delivered to RC' 
        ? 'bg-emerald-50 text-emerald-800 border-emerald-300' 
        : 'bg-rose-50 text-rose-900 border-rose-300',
    };
  }

  // 10 & 11. ASP Send to RC (Leg 2 CWH -> RC) (Code 4)
  if (
    motoInfo.code === 4 ||
    order.crm_status === 'In Transit to RC' ||
    order.crm_status === 'Pickup Pending for RC' ||
    normMoto === 'asp send to rc'
  ) {
    return {
      isActionable: false,
      actionType: 'DISPATCHED_TO_RC',
      title: 'CWH Shipped to RC',
      description: 'Dispatched from CWH to Repair Center (RC) in Lenovo CRM. CCI has no action to take.',
      badgeClass: 'bg-blue-50 text-blue-800 border-blue-200',
    };
  }

  // 6, 7, 8, 9. At CWH Hub (CWH Received, Screening, Inward, or CWH to Create DC) (Code 3 & 35)
  // STRICT RULE: Once updated to CWH Received or further, CCI has NO action to take!
  if (
    motoInfo.code === 3 || 
    motoInfo.code === 35 || 
    normMoto.includes('cwh received') ||
    order.crm_status === 'Delivered at CWH' || 
    order.crm_status === 'Pending Inward at CWH' || 
    order.crm_status === 'Discrepancies' || 
    order.crm_status === 'CWH to Create DC'
  ) {
    return {
      isActionable: false,
      actionType: 'DELIVERED_CWH',
      title: 'CWH Received (No CCI Action)',
      description: 'Consignment received at CWH bay. Handover complete; CCI has no action to take.',
      badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    };
  }

  // 1. Not Return: CCI to Create DC
  if (normMoto === 'not return' || order.crm_status === 'CCI to Create DC') {
    return {
      isActionable: true,
      actionType: 'CREATE_DC',
      title: 'Action: Create DC in Moto CRM',
      description: 'Defective units awaiting Delivery Challan creation by CCI in Motorola CRM',
      badgeClass: 'bg-amber-50 text-amber-900 border-amber-300 font-bold',
    };
  }

  // 4. Pending AWB Re-Issue: Pickup was not done, waiting on CWH to re-issue
  if (order.crm_status === 'Pending AWB Re-Issue' || order.pickup_status === 'Pickup Not Done') {
    return {
      isActionable: false,
      actionType: 'AWAITING_REISSUE',
      title: 'Pickup Delayed - Waiting CWH Re-issue',
      description: 'Pickup delay logged. Awaiting Central Warehouse (CWH) to issue fresh AWB docket.',
      badgeClass: 'bg-orange-50 text-orange-900 border-orange-300 font-medium',
    };
  }

  // 5. In Transit: Handed over to courier
  if (order.crm_status === 'In Transit' || order.pickup_status === 'Pickup Done') {
    return {
      isActionable: false,
      actionType: 'IN_TRANSIT_MONITOR',
      title: 'In Transit to CWH',
      description: 'Consignment picked up by courier. Monitor parcel until Delivered at CWH is confirmed.',
      badgeClass: 'bg-sky-50 text-sky-800 border-sky-300 font-medium',
    };
  }

  // 3. Pickup Pending: AWB issued, courier handover pending
  // STRICT RULE: CCI will only handover shipments where Motorola Status is "CCI Send to CWH" (Code 2)!
  if (
    normMoto === 'cci send to cwh' &&
    (order.crm_status === 'Pickup Pending' || order.active_awb || order.excel_ref_awb)
  ) {
    return {
      isActionable: true,
      actionType: 'PICKUP_HANDOVER_PENDING',
      title: 'Action: Handover to Courier',
      description: 'Motorola Status is "CCI Send to CWH". AWB issued by CWH. Handover parcel to courier & record pickup.',
      badgeClass: 'bg-amber-100 text-amber-950 border-amber-400 font-bold',
    };
  }

  // 2. Pending AWB: DC created in Moto CRM, awaiting CWH to assign AWB
  return {
    isActionable: false,
    actionType: 'AWAITING_CWH_AWB',
    title: 'DC Created - Pending AWB',
    description: 'DC created in Moto CRM. Awaiting Central Warehouse (CWH) to assign courier AWB token.',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
  };
}

/**
 * Action evaluation for CWH Central Warehouse based on the 13 canonical stages
 */
export function getCwhActionDetails(order: ShippingOrder): {
  isActionable: boolean;
  actionType: 'ISSUE_AWB' | 'REISSUE_AWB' | 'INWARD_VERIFY' | 'CREATE_DC_RC' | 'DISPATCH_TO_RC' | 'INSPECT_DISCREPANCY' | 'NONE';
  title: string;
  description: string;
} {
  // Delivered cases: No CWH action needed
  if (order.crm_status === 'Delivered to RC' || order.crm_status === 'Delivered to RC (Discrepancies)') {
    return {
      isActionable: false,
      actionType: 'NONE',
      title: 'Delivered to RC',
      description: 'Consignment acknowledged and closed at destination Repair Center.',
    };
  }

  // Discrepancies at CWH
  if (order.crm_status === 'Discrepancies') {
    return {
      isActionable: true,
      actionType: 'INSPECT_DISCREPANCY',
      title: 'Action: Clear Discrepancies',
      description: 'Quantity, part, or carton damage mismatch reported. Clear discrepancy to proceed to inward.',
    };
  }

  // 4. Pending AWB Re-Issue: High priority queue for CWH
  if (order.crm_status === 'Pending AWB Re-Issue' || order.pickup_status === 'Pickup Not Done') {
    return {
      isActionable: true,
      actionType: 'REISSUE_AWB',
      title: 'Action: Re-issue AWB Token',
      description: 'CCI reported courier pickup failure. Cancel previous token and issue fresh AWB.',
    };
  }

  // 2. Pending AWB: CWH to issue initial AWB
  if (order.crm_status === 'Pending AWB' && !order.active_awb && !order.excel_ref_awb) {
    return {
      isActionable: true,
      actionType: 'ISSUE_AWB',
      title: 'Action: Issue AWB Token',
      description: 'DC created by station. Generate and issue logistics AWB token.',
    };
  }

  // 5, 6, 8. In Transit or Delivered at CWH: Inward Unboxing Verification
  if (
    order.crm_status === 'Delivered at CWH' || 
    order.crm_status === 'Pending Inward at CWH' || 
    order.crm_status === 'In Transit'
  ) {
    return {
      isActionable: true,
      actionType: 'INWARD_VERIFY',
      title: 'Action: Inward & CCTV Inspection',
      description: 'Shipment inbound or delivered. Inspect carton, scan barcode, and verify line items.',
    };
  }

  // 9. CWH to Create DC: Outbound secondary SO for RC
  if (order.crm_status === 'CWH to Create DC') {
    return {
      isActionable: true,
      actionType: 'CREATE_DC_RC',
      title: 'Action: CWH to Create DC',
      description: 'Parts verified clean at CWH. Create secondary DC (ASP-RC SO) in Lenovo CRM.',
    };
  }

  // 10. Pickup Pending for RC: Dispatch to RC
  if (order.crm_status === 'Pickup Pending for RC') {
    return {
      isActionable: true,
      actionType: 'DISPATCH_TO_RC',
      title: 'Action: Dispatch to RC',
      description: 'Secondary DC created. Awaiting courier pickup dispatch to Repair Center.',
    };
  }

  return {
    isActionable: false,
    actionType: 'NONE',
    title: 'In Progress',
    description: order.crm_status,
  };
}
