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
    badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
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
    badgeClass: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
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
    badgeClass: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    isDelivered: false,
    isAwbRequired: false,
    actionPrompt: 'Action required by CWH: Unbox, verify and create DC to RC in Lenovo CRM',
  },
  'asp send to rc': {
    statusKey: 'ASP Send To RC',
    code: 4,
    label: 'ASP Send to RC',
    meaning: 'CWH created DC to RC for dispatch in Lenovo CRM',
    responsibleRole: 'CWH',
    badgeClass: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    isDelivered: false,
    isAwbRequired: false,
    actionPrompt: 'In Transit from CWH to Repair Center (RC)',
  },
  'rc received asp': {
    statusKey: 'RC Received ASP',
    code: 5,
    label: 'RC Received ASP',
    meaning: 'RC received parts in Moto CRM (Completed / Delivered)',
    responsibleRole: 'NONE',
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    isDelivered: true,
    isAwbRequired: false,
    actionPrompt: 'Delivered & Closed: Lifecycle successfully completed in Moto CRM',
  },
  'rc received asp(negative)': {
    statusKey: 'RC Received ASP(Negative)',
    code: 6,
    label: 'RC Received ASP (Negative)',
    meaning: 'Received short / damaged parts at RC (Discrepancy Tagged)',
    responsibleRole: 'NONE',
    badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    isDelivered: true,
    isAwbRequired: false,
    actionPrompt: 'Delivered with Discrepancy: Shortage or physical damage flagged at RC',
  },
};

/**
 * Normalizes any variation of Motorola parts status string
 */
export function normalizeMotoStatusKey(status?: string | null): string {
  if (!status) return 'cci send to cwh';
  const clean = status.trim().toLowerCase().replace(/\s+/g, ' ');
  if (clean.includes('negative') || clean.includes('(negative)')) return 'rc received asp(negative)';
  if (clean.includes('rc received')) return 'rc received asp';
  if (clean.includes('send to rc')) return 'asp send to rc';
  if (clean.includes('cwh received')) return 'cwh received';
  if (clean.includes('not return')) return 'not return';
  if (clean.includes('cci send')) return 'cci send to cwh';
  return clean;
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
 * Derives CRM logistics status accurately from Motorola Parts Status and AWB token
 */
export function deriveCrmStatusFromMotorolaStatus(
  motoStatus?: string | null,
  awb?: string | null,
  existingCrmStatus?: CRMStatus
): CRMStatus {
  const norm = normalizeMotoStatusKey(motoStatus);

  // 1. RC Received ASP: Completed / Delivered lifecycle
  if (norm === 'rc received asp') {
    return 'Closed';
  }

  // 2. RC Received ASP(Negative): RC received with Shortage / Damage
  if (norm === 'rc received asp(negative)') {
    return 'Discrepancy Tagged';
  }

  // 3. ASP Send To RC: CWH created DC to RC in Lenovo CRM
  if (norm === 'asp send to rc') {
    return 'Dispatched to RC';
  }

  // 4. CWH Received: Consignment physically received at central warehouse
  if (norm === 'cwh received') {
    return 'CWH Received';
  }

  // 5. Not Return: DC not yet created by CCI in Moto CRM
  if (norm === 'not return') {
    return 'AWB Pending';
  }

  // 6. CCI Send To CWH: Active logistics pipeline
  if (norm === 'cci send to cwh') {
    if (existingCrmStatus && existingCrmStatus !== 'AWB Pending') {
      return existingCrmStatus;
    }
    return awb && awb.trim() ? 'In Transit' : 'AWB Pending';
  }

  return existingCrmStatus || (awb && awb.trim() ? 'In Transit' : 'AWB Pending');
}

/**
 * Checks whether an AWB needs to be issued by CWH.
 * Delivered cases (RC Received ASP, CWH Received, ASP Send to RC) DO NOT require AWB generation!
 */
export function isAwbIssueRequired(order: ShippingOrder): boolean {
  const info = getMotorolaStatusInfo(order.motorola_status);
  
  // Delivered or already at CWH/RC: AWB issue definitely not required!
  if (info.isDelivered || info.code === 3 || info.code === 4 || info.code === 5 || info.code === 6) {
    return false;
  }

  if (order.crm_status === 'Closed' || order.crm_status === 'CWH Received' || order.crm_status === 'Dispatched to RC') {
    return false;
  }

  // If Not Return: DC not even created in Moto CRM yet
  if (info.code === 1) {
    return false;
  }

  // Only required if CCI Send to CWH and no AWB has been assigned
  return !order.active_awb && !order.excel_ref_awb;
}

export type CciActionType = 
  | 'CREATE_DC' 
  | 'PICKUP_HANDOVER_PENDING' 
  | 'AWAITING_CWH_AWB' 
  | 'IN_TRANSIT_MONITOR' 
  | 'CWH_RECEIVED' 
  | 'DELIVERED_RC';

/**
 * Action evaluation for CCI Service Centers:
 * 1. "Not Return" -> Actionable to CCI: Create DC in Moto CRM
 * 2. "CCI send to CWH":
 *    - If AWB updated from CWH -> Actionable to CCI: Pickup Handover Pending (Handover to courier, mark Pickup Done/Not Done)
 *    - If AWB not yet updated -> Waiting for CWH to issue AWB
 *    - Once pickup updated -> In-Transit: CCI need to monitor till delivery and updated as CWH Received
 * 3. "CWH Received" onwards -> Arrived at CWH; monitoring completed.
 */
export function getCciActionDetails(order: ShippingOrder): {
  isActionable: boolean;
  actionType: CciActionType;
  title: string;
  description: string;
  badgeClass: string;
} {
  const info = getMotorolaStatusInfo(order.motorola_status);

  // 1. Not Return: CCI to Create DC in Moto CRM
  if (info.code === 1) {
    return {
      isActionable: true,
      actionType: 'CREATE_DC',
      title: 'Action: Create DC in Moto CRM',
      description: 'Defective units awaiting Delivery Challan creation by CCI',
      badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold',
    };
  }

  // 2. CCI send to CWH: Active Logistics
  if (info.code === 2) {
    const hasAwb = !!(order.active_awb || order.excel_ref_awb);

    // If AWB updated from CWH then pickup handover pending
    if (hasAwb && order.pickup_status !== 'Pickup Done') {
      return {
        isActionable: true,
        actionType: 'PICKUP_HANDOVER_PENDING',
        title: 'Action: Pickup Handover Pending',
        description: 'AWB updated from CWH. Handover parcel to courier & update pickup status',
        badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse font-bold',
      };
    }

    // If AWB not yet updated from CWH
    if (!hasAwb) {
      return {
        isActionable: false,
        actionType: 'AWAITING_CWH_AWB',
        title: 'DC Created - Awaiting CWH AWB',
        description: 'DC created in Moto CRM. Waiting for CWH to assign courier AWB token',
        badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
      };
    }

    // Once updated, In-Transit till delivery and updated as CWH Received: CCI need to monitor
    return {
      isActionable: false,
      actionType: 'IN_TRANSIT_MONITOR',
      title: 'In-Transit (Monitor till CWH Received)',
      description: 'Consignment en route to CWH under courier tracking. Monitor until CWH Received is acknowledged',
      badgeClass: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    };
  }

  // 3. CWH Received: Received by CWH in Moto CRM
  if (info.code === 3 || order.crm_status === 'CWH Received') {
    return {
      isActionable: false,
      actionType: 'CWH_RECEIVED',
      title: 'CWH Received & Inwarded',
      description: 'Consignment safely delivered to CWH. Inward verification completed',
      badgeClass: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    };
  }

  // 4, 5, 6: Dispatched to RC / Delivered to RC
  return {
    isActionable: false,
    actionType: 'DELIVERED_RC',
    title: info.isDelivered ? 'Delivered to RC (Closed)' : 'In Progress at CWH/RC',
    description: info.meaning,
    badgeClass: info.badgeClass,
  };
}

/**
 * Action evaluation for CWH Central Warehouse:
 * - AWB Issuance: Consignments with CCI Send to CWH lacking AWB
 * - Inward Verification: Consignments in Transit to CWH
 * - Create DC to RC: Consignments with CWH Received status
 */
export function getCwhActionDetails(order: ShippingOrder): {
  isActionable: boolean;
  actionType: 'ISSUE_AWB' | 'INWARD_VERIFY' | 'DISPATCH_TO_RC' | 'NONE';
  title: string;
  description: string;
} {
  const info = getMotorolaStatusInfo(order.motorola_status);

  // Delivered cases: No CWH action needed
  if (info.isDelivered || order.crm_status === 'Closed') {
    return {
      isActionable: false,
      actionType: 'NONE',
      title: 'Completed at RC',
      description: 'Consignment acknowledged and closed at Repair Center',
    };
  }

  // 1. AWB Issuance required
  if (info.code === 2 && !order.active_awb && !order.excel_ref_awb) {
    return {
      isActionable: true,
      actionType: 'ISSUE_AWB',
      title: 'Action: Issue AWB Token',
      description: 'DC created by station; CWH to issue courier AWB',
    };
  }

  // 2. In Transit or arrived: Inward Verification
  if (order.crm_status === 'In Transit' || (order.active_awb && order.crm_status !== 'CWH Received' && info.code === 2)) {
    return {
      isActionable: true,
      actionType: 'INWARD_VERIFY',
      title: 'Action: Inward & CCTV Unboxing',
      description: 'Parcel inbound/arrived; scan barcode and verify contents',
    };
  }

  // 3. CWH Received: Dispatch to RC
  if (order.crm_status === 'CWH Received' || info.code === 3) {
    return {
      isActionable: true,
      actionType: 'DISPATCH_TO_RC',
      title: 'Action: Create DC to RC',
      description: 'Parts verified at CWH; create DC to RC in Lenovo CRM',
    };
  }

  return {
    isActionable: false,
    actionType: 'NONE',
    title: 'In Progress',
    description: info.meaning,
  };
}
