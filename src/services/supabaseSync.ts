import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { CCIMaster, ShippingOrder, DefectiveItem, AuditLog } from '../types/crm';
import { 
  INITIAL_STATIONS, 
  INITIAL_SHIPPING_ORDERS, 
  INITIAL_DEFECTIVE_ITEMS, 
  INITIAL_AUDIT_LOGS 
} from '../data/seedData';

export interface SupabaseSyncStatus {
  connected: boolean;
  stationCount: number;
  orderCount: number;
  itemCount: number;
  error?: string;
}

export async function checkSupabaseStatus(): Promise<SupabaseSyncStatus> {
  if (!isSupabaseConfigured || !supabase) {
    return { connected: false, stationCount: 0, orderCount: 0, itemCount: 0 };
  }

  try {
    const [stRes, soRes, itemRes] = await Promise.all([
      supabase.from('cci_master').select('*', { count: 'exact', head: true }),
      supabase.from('shipping_orders').select('*', { count: 'exact', head: true }),
      supabase.from('defective_master').select('*', { count: 'exact', head: true }),
    ]);

    if (stRes.error) throw stRes.error;

    return {
      connected: true,
      stationCount: stRes.count || 0,
      orderCount: soRes.count || 0,
      itemCount: itemRes.count || 0,
    };
  } catch (err: any) {
    return {
      connected: false,
      stationCount: 0,
      orderCount: 0,
      itemCount: 0,
      error: err.message || 'Supabase RLS or connection error',
    };
  }
}

export async function pushSeedDataToSupabase(
  onProgress?: (msg: string) => void
): Promise<{ success: boolean; message: string }> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase client is not configured');
  }

  try {
    onProgress?.('Syncing 64 CCI stations to Supabase...');
    // 1. Stations
    const { error: stErr } = await supabase.from('cci_master').upsert(
      INITIAL_STATIONS.map((s) => ({
        station_code: s.station_code,
        username: s.username,
        station_name: s.station_name,
        region: s.region,
        state: s.state,
        city: s.city,
        contact_person: s.contact_person,
        contact_phone: s.contact_phone,
        is_active: s.is_active,
      })),
      { onConflict: 'station_code' }
    );
    if (stErr) throw stErr;

    onProgress?.('Syncing Shipping Orders to Supabase...');
    // 2. Shipping Orders
    const { error: soErr } = await supabase.from('shipping_orders').upsert(
      INITIAL_SHIPPING_ORDERS.map((so) => ({
        so_code: so.so_code,
        station_code: so.station_code,
        region: so.region,
        motorola_status: so.motorola_status,
        crm_status: so.crm_status,
        excel_ref_awb: so.excel_ref_awb,
        active_awb: so.active_awb,
        courier: so.courier,
        eway_bill_required: so.eway_bill_required,
        total_declared_value: so.total_declared_value,
        max_sr_age: so.max_sr_age,
        priority_tier: so.priority_tier,
      })),
      { onConflict: 'so_code' }
    );
    if (soErr) throw soErr;

    onProgress?.('Syncing Defective line items to Supabase...');
    // 3. Defective Items (in batches of 50)
    for (let i = 0; i < INITIAL_DEFECTIVE_ITEMS.length; i += 50) {
      const batch = INITIAL_DEFECTIVE_ITEMS.slice(i, i + 50);
      const { error: itmErr } = await supabase.from('defective_master').upsert(
        batch.map((it) => ({
          composite_key: it.composite_key,
          sr_number: it.sr_number,
          sr_part_number: it.sr_part_number,
          new_part_number: it.new_part_number,
          part_category: it.part_category,
          part_description: it.part_description,
          quantity: it.quantity,
          station_code: it.station_code,
          region: it.region,
          shipping_order_code: it.shipping_order_code,
          sr_close_timestamp: it.sr_close_timestamp,
          sr_model_name: it.sr_model_name,
          sr_fault_description: it.sr_fault_description,
          motorola_parts_status: it.motorola_parts_status,
          excel_awb: it.excel_awb,
          screening_status: it.screening_status,
          estimated_value: it.estimated_value,
        })),
        { onConflict: 'composite_key' }
      );
      if (itmErr) throw itmErr;
    }

    return {
      success: true,
      message: `Successfully seeded Supabase with ${INITIAL_STATIONS.length} stations, ${INITIAL_SHIPPING_ORDERS.length} shipping orders, and ${INITIAL_DEFECTIVE_ITEMS.length} items!`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Failed to push seed data to Supabase',
    };
  }
}
