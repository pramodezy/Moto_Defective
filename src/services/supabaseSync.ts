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

export async function pushUploadedDataToSupabase(
  orders: ShippingOrder[],
  items: DefectiveItem[],
  stations: CCIMaster[],
  onProgress?: (msg: string) => void
): Promise<{ success: boolean; message: string; ordersCount: number; itemsCount: number }> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase cloud connection is not configured in .env');
  }

  if (orders.length === 0 && items.length === 0) {
    return {
      success: false,
      message: 'No data to ingest. Please upload a Motorola Defective Report or Region Mapping file first.',
      ordersCount: 0,
      itemsCount: 0,
    };
  }

  try {
    // Step 1: Ensure all station codes exist in cci_master before inserting orders/items
    const stationCodeSet = new Set<string>();
    orders.forEach((o) => { if (o.station_code) stationCodeSet.add(o.station_code); });
    items.forEach((it) => { if (it.station_code) stationCodeSet.add(it.station_code); });

    const knownStationMap = new Map<string, CCIMaster>();
    stations.forEach((st) => knownStationMap.set(st.station_code, st));

    const stationsToUpsert: CCIMaster[] = [];
    stationCodeSet.forEach((code) => {
      const existing = knownStationMap.get(code);
      if (existing) {
        stationsToUpsert.push(existing);
      } else {
        // Fallback stub station to satisfy foreign key constraint
        stationsToUpsert.push({
          station_code: code,
          username: `cci_${code}`,
          station_name: `Service Center ${code}`,
          region: 'West',
          state: '',
          city: '',
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    });

    if (stationsToUpsert.length > 0) {
      onProgress?.(`Verifying & syncing ${stationsToUpsert.length} stations in Supabase cci_master...`);
      for (let i = 0; i < stationsToUpsert.length; i += 50) {
        const batch = stationsToUpsert.slice(i, i + 50);
        const { error: stErr } = await supabase.from('cci_master').upsert(
          batch.map((s) => ({
            station_code: s.station_code,
            username: s.username || `cci_${s.station_code}`,
            station_name: s.station_name || `Service Center ${s.station_code}`,
            region: s.region || 'West',
            state: s.state || '',
            city: s.city || '',
            contact_person: s.contact_person || '',
            contact_phone: s.contact_phone || '',
            is_active: s.is_active ?? true,
          })),
          { onConflict: 'station_code' }
        );
        if (stErr) throw stErr;
      }
    }

    // Step 2: Ingest Shipping Orders into Supabase
    if (orders.length > 0) {
      onProgress?.(`Ingesting ${orders.length} shipping orders to Supabase cloud...`);
      for (let i = 0; i < orders.length; i += 50) {
        const batch = orders.slice(i, i + 50);
        const { error: soErr } = await supabase.from('shipping_orders').upsert(
          batch.map((so) => ({
            so_code: so.so_code,
            station_code: so.station_code,
            region: so.region || 'West',
            state: so.state || '',
            city: so.city || '',
            motorola_status: so.motorola_status || 'CCI Send To CWH',
            crm_status: so.crm_status || 'AWB Pending',
            excel_ref_awb: so.excel_ref_awb || '',
            active_awb: so.active_awb || '',
            courier: so.courier || 'BlueDart Express',
            eway_bill_required: !!so.eway_bill_required,
            eway_bill_number: so.eway_bill_number || '',
            eway_bill_url: so.eway_bill_url || '',
            total_declared_value: so.total_declared_value || 0,
            max_sr_age: so.max_sr_age || 0,
            priority_tier: so.priority_tier || 3,
          })),
          { onConflict: 'so_code' }
        );
        if (soErr) throw soErr;
      }
    }

    // Step 3: Ingest Defective line items into Supabase
    if (items.length > 0) {
      onProgress?.(`Ingesting ${items.length} defective items to Supabase cloud...`);
      for (let i = 0; i < items.length; i += 50) {
        const batch = items.slice(i, i + 50);
        const { error: itmErr } = await supabase.from('defective_master').upsert(
          batch.map((it) => ({
            composite_key: it.composite_key,
            sr_number: it.sr_number,
            sr_part_number: it.sr_part_number,
            new_part_number: it.new_part_number || '',
            part_category: it.part_category || 'General Spare',
            part_description: it.part_description || '',
            quantity: it.quantity || 1,
            station_code: it.station_code,
            region: it.region || 'West',
            state: it.state || '',
            city: it.city || '',
            shipping_order_code: it.shipping_order_code,
            sr_close_timestamp: it.sr_close_timestamp || null,
            sr_model_name: it.sr_model_name || '',
            sr_fault_description: it.sr_fault_description || '',
            motorola_parts_status: it.motorola_parts_status || 'Not Return',
            excel_awb: it.excel_awb || '',
            screening_status: it.screening_status || 'Pending',
            item_remarks: it.item_remarks || '',
            estimated_value: it.estimated_value || 8000,
          })),
          { onConflict: 'composite_key' }
        );
        if (itmErr) throw itmErr;
      }
    }

    return {
      success: true,
      message: `Successfully ingested ${orders.length} shipping orders and ${items.length} defective items directly to Supabase Cloud!`,
      ordersCount: orders.length,
      itemsCount: items.length,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Failed to ingest data to Supabase',
      ordersCount: 0,
      itemsCount: 0,
    };
  }
}

// Backward compatibility helper
export async function pushSeedDataToSupabase(
  onProgress?: (msg: string) => void
): Promise<{ success: boolean; message: string }> {
  return pushUploadedDataToSupabase(
    INITIAL_SHIPPING_ORDERS,
    INITIAL_DEFECTIVE_ITEMS,
    INITIAL_STATIONS,
    onProgress
  );
}

export async function pullCciMasterFromSupabase(): Promise<{ success: boolean; count: number; message: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, count: 0, message: 'Supabase client is not configured' };
  }
  try {
    const { data, error } = await supabase.from('cci_master').select('*').order('station_code');
    if (error) throw error;
    return {
      success: true,
      count: data?.length || 0,
      message: `Successfully loaded ${data?.length || 0} stations from Supabase cci_master`,
    };
  } catch (err: any) {
    return {
      success: false,
      count: 0,
      message: err.message || 'Failed to fetch from Supabase cci_master',
    };
  }
}

