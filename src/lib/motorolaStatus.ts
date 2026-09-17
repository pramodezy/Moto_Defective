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
  // 12 & 13. Delivered & Closed at RC
  if (order.crm_status === 'Delivered to RC' || order.crm_status === 'Delivered to RC (Discrepancies)') {
    return {
      isActionable: false,
      actionType: 'DELIVERED_RC',
      title: order.crm_status === 'Delivered to RC' ? 'Delivered to RC (Completed)' : 'Delivered to RC (Discrepancies)',
      description: 'Consignment delivery confirmed at Repair Center. Journey completed.',
      badgeClass: order.crm_status === 'Delivered to RC' 
        ? 'bg-emerald-50 text-emerald-800 border-emerald-300' 
        : 'bg-rose-50 text-rose-900 border-rose-300',
    };
  }

  // 10 & 11. ASP Send to RC (Leg 2 CWH -> RC)
  if (order.crm_status === 'In Transit to RC' || order.crm_status === 'Pickup Pending for RC') {
    return {
      isActionable: false,
      actionType: 'DISPATCHED_TO_RC',
      title: 'Dispatched CWH → RC (No CCI Action)',
      description: 'Dispatched from CWH to Repair Center (RC) in Lenovo CRM. Not actionable for CCI.',
      badgeClass: 'bg-blue-50 text-blue-800 border-blue-200',
    };
  }

  // 6, 7, 8, 9. At CWH Hub (Screening, Inward, or CWH to Create DC)
  if (
    order.crm_status === 'Delivered at CWH' || 
    order.crm_status === 'Pending Inward at CWH' || 
    order.crm_status === 'Discrepancies' || 
    order.crm_status === 'CWH to Create DC'
  ) {
    return {
      isActionable: false,
      actionType: 'DELIVERED_CWH',
      title: 'Delivered at CWH (Inward Verification)',
      description: 'Consignment arrived at CWH bay. Physical inwarding in progress; CCI monitoring complete.',
      badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    };
  }

  // 1. Not Return: CCI to Create DC
  if (order.crm_status === 'CCI to Create DC' || order.motorola_status?.toLowerCase().includes('not return')) {
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
  if (order.crm_status === 'Pickup Pending' || order.active_awb || order.excel_ref_awb) {
    return {
      isActionable: true,
      actionType: 'PICKUP_HANDOVER_PENDING',
      title: 'Action: Handover Pending',
      description: 'AWB issued by CWH. Handover parcel to courier executive and confirm Pickup Done.',
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
