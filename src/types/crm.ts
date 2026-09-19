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
  | 'CCI to Create DC'
  | 'Pending AWB'
  | 'Pickup Pending'
  | 'Pending AWB Re-Issue'
  | 'In Transit'
  | 'Delivered at CWH'
  | 'Discrepancies'
  | 'Pending Inward at CWH'
  | 'CWH to Create DC'
  | 'Pickup Pending for RC'
  | 'In Transit to RC'
  | 'CWH Shipped to RC'
  | 'Delivered to RC'
  | 'Delivered to RC (Discrepancies)';

export type PickupStatus = 'Pickup Pending' | 'Pickup Done' | 'Pickup Not Done';

export type PriorityTier = 1 | 2 | 3 | 4; // 1: Super Critical (>25D), 2: Critical (16-25D), 3: High (8-15D), 4: Low (0-7D)

export type AgeingCriticality = 'super_critical' | 'critical' | 'high' | 'low';

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
  so_code: string;            // "CCI-ASP Shipping Order Code" (Leg 1 Inbound)
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
  delivery_challan_code?: string; // Leg 1 Delivery Challan Code from Shipping Order

  // Leg 2 Outbound Hub Transfer (CWH -> RC)
  asp_rc_shipping_order_code?: string;
  asp_rc_ship_date?: string;
  asp_outbound_awb?: string;          // "ASP Outbound SO(AWB)" (Leg 2 Docket from CWH to RC)
  asp_rc_pickup_date?: string;        // "ASP-RC Logistics Pickup Date/Time"
  asp_rc_delivered_date?: string;     // "ASP-RC Logistics Delivered Date/Time"
  so_grn_time?: string;               // "SO GRN Time" (When RC received part in Moto CRM)
  rc_receive_remark?: string;

  created_at: string;
  updated_at: string;
}

export interface DefectiveItem {
  id: string;
  composite_key: string;       // srNumber_srPartNumber_soCode
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
  shipping_order_code: string; // Leg 1: CCI-ASP Shipping Order Code
  shipping_order_id?: string;
  sr_close_timestamp?: string;
  sr_model_name?: string;
  sr_fault_description?: string;
  motorola_parts_status: MotorolaPartsStatus | string;
  excel_awb?: string;
  screening_status: ScreeningStatus;
  item_remarks?: string;
  estimated_value: number;

  // Delivery Challan details from Shipping Order File
  delivery_challan_code?: string;
  deliver_qty?: number;
  value?: number;

  // Leg 2 Outbound Hub Transfer (CWH -> RC)
  asp_rc_shipping_order_code?: string;
  asp_rc_ship_date?: string;
  asp_outbound_awb?: string;          // "ASP Outbound SO(AWB)" (Leg 2 Docket from CWH to RC)
  asp_rc_pickup_date?: string;        // "ASP-RC Logistics Pickup Date/Time"
  asp_rc_delivered_date?: string;     // "ASP-RC Logistics Delivered Date/Time"
  so_grn_time?: string;               // "SO GRN Time" (When RC received part in Moto CRM)
  rc_receive_remark?: string;

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

export interface ShippingOrderDetailRecord {
  id?: string;
  shipping_order_code: string;
  delivery_challan_code?: string;
  item_code: string;
  old_pn?: string;
  order_pn?: string;
  description?: string;
  unit_price: number;
  deliver_qty: number;
  received_qty?: number;
  value: number;
  way_bill_no?: string;
  carrier?: string;
  mode_of_transport?: string;
  date_issued?: string;
  shipping_order_status?: string;
  created_at?: string;
}

