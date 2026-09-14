export type UserRole = 'ADMIN' | 'CWH' | 'CCI';

export type ScreeningStatus = 'Pending' | 'Passed' | 'Failed' | 'Missing' | 'Damaged';

export type MotorolaPartsStatus = 
  | 'CCI Send To CWH'
  | 'CWH Received'
  | 'CWH Received - Discrepancies'
  | 'ASP Send To RC'
  | 'RC Received ASP'
  | 'RC Received ASP(Negative)'
  | 'Not Return';

export type CRMStatus = 
  | 'AWB Pending'
  | 'In Transit'
  | 'CWH Received'
  | 'CWH Received - Discrepancies'
  | 'Screening In Progress'
  | 'Discrepancy Tagged'
  | 'Dispatched to RC'
  | 'Closed';

export type PickupStatus = 'Pickup Pending' | 'Pickup Done' | 'Pickup Not Done';

export type PriorityTier = 1 | 2 | 3; // 1: Critical (>=15D), 2: High (8-14D), 3: Normal (<8D)

export interface CCIMaster {
  station_code: string;       // e.g. '068', '071', '65'
  username: string;           // e.g. 'cci_068', 'cci_65'
  station_name: string;       // e.g. 'RRLC-068-Noble Sales And Services'
  region: string;             // 'North' | 'South' | 'East' | 'West'
  state?: string;
  city?: string;
  contact_person?: string;
  contact_phone?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface UserProfile {
  id: string;
  username: string;
  full_name: string;
  role: UserRole;
  station_code?: string;      // if role === 'CCI'
  created_at?: string;
}

export interface ShippingOrder {
  id: string;
  so_code: string;            // "CCI-ASP Shipping Order Code"
  station_code: string;
  region: string;
  state?: string;
  city?: string;
  motorola_status: string;
  crm_status: CRMStatus;
  excel_ref_awb?: string;
  active_awb?: string;
  courier: string;
  eway_bill_required: boolean;
  eway_bill_number?: string;
  eway_bill_url?: string;
  cwh_evidence_ref?: string;
  total_declared_value: number;
  max_sr_age: number;
  priority_tier: PriorityTier;
  total_items?: number;
  pickup_status?: PickupStatus;
  pickup_date?: string;
  pickup_remarks?: string;
  created_at: string;
  updated_at: string;
}

export interface DefectiveItem {
  id: string;
  composite_key: string;       // srNumber_srPartNumber_newPartNumber
  sr_number: string;
  sr_part_number: string;
  new_part_number: string;
  part_category: string;
  part_description: string;
  quantity: number;
  station_code: string;
  region?: string;
  state?: string;
  city?: string;
  shipping_order_code: string;
  shipping_order_id?: string;
  sr_close_timestamp?: string;
  sr_model_name?: string;
  sr_fault_description?: string;
  motorola_parts_status: MotorolaPartsStatus | string;
  excel_awb?: string;
  screening_status: ScreeningStatus;
  item_remarks?: string;
  estimated_value: number;
  last_synced_at: string;
  created_at: string;
  updated_at: string;
}

export interface AWBHistory {
  id: string;
  shipping_order_id: string;
  awb_number: string;
  courier: string;
  label_url?: string;
  is_active: boolean;
  cancellation_reason?: string;
  pickup_date?: string;
  delivery_date?: string;
  created_by?: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  shipping_order_id?: string;
  so_code?: string;
  user_name: string;
  user_role: string;
  action: string;
  old_status?: string;
  new_status?: string;
  awb?: string;
  remarks?: string;
  created_at: string;
}

export interface IngestionResult {
  totalRows: number;
  inserted: number;
  updated: number;
  skipped: number;
  shippingOrdersCreated: number;
  shippingOrdersUpdated: number;
  errors: string[];
  timestamp: string;
}
