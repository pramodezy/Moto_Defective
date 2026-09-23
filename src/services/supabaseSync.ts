import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { CCIMaster, ShippingOrder, DefectiveItem, AuditLog, ShippingOrderDetailRecord } from '../types/crm';
import { ShippingOrderItemRow } from './shippingOrderIngestor';
import { normalizeMotoStatusKey } from '../lib/motorolaStatus';
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
  onProgress?: (msg: string) => void,
  deletedCompositeKeys: string[] = [],
  deletedSoCodes: string[] = []
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
    // Step 0: Delete superseded pending composite keys and retired SO codes to prevent cloud resurrection
    if (deletedCompositeKeys.length > 0) {
      onProgress?.(`Cleaning up ${deletedCompositeKeys.length} superseded pending records from Supabase...`);
      for (let i = 0; i < deletedCompositeKeys.length; i += 100) {
        const batch = deletedCompositeKeys.slice(i, i + 100);
        await supabase.from('defective_master').delete().in('composite_key', batch);
      }
    }
    if (deletedSoCodes.length > 0) {
      for (let i = 0; i < deletedSoCodes.length; i += 100) {
        const batch = deletedSoCodes.slice(i, i + 100);
        await supabase.from('shipping_orders').delete().in('so_code', batch);
      }
    }

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

    // Step 1: Check which stations already exist in Supabase cci_master to avoid unnecessary triggers
    const { data: existingStations } = await supabase.from('cci_master').select('station_code');
    const existingStationCodes = new Set((existingStations || []).map((s: any) => s.station_code));

    const missingStations = stationsToUpsert.filter((st) => !existingStationCodes.has(st.station_code));

    if (missingStations.length > 0) {
      onProgress?.(`Registering ${missingStations.length} new stations in Supabase cci_master...`);
      for (let i = 0; i < missingStations.length; i += 50) {
        const batch = missingStations.slice(i, i + 50);
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
        if (stErr) {
          if (stErr.message?.includes('profiles')) {
            console.warn('Profile sync trigger notice on cci_master:', stErr.message);
          } else {
            throw stErr;
          }
        }
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
            crm_status: normalizeMotoStatusKey(so.motorola_status) === 'not return'
              ? 'CCI to Create DC'
              : ((so.crm_status as string) === 'AWB Pending' ? 'Pending AWB' : (so.crm_status || 'Pending AWB')),
            excel_ref_awb: so.excel_ref_awb || '',
            active_awb: so.active_awb || '',
            courier: so.courier || 'BlueDart Express',
            eway_bill_required: !!so.eway_bill_required,
            eway_bill_number: so.eway_bill_number || '',
            delivery_challan_code: so.delivery_challan_code || null,
            total_declared_value: so.total_declared_value || 0,
            max_sr_age: so.max_sr_age || 0,
            priority_tier: so.priority_tier || 3,
            asp_rc_shipping_order_code: so.asp_rc_shipping_order_code || null,
            asp_rc_ship_date: so.asp_rc_ship_date || null,
            asp_outbound_awb: so.asp_outbound_awb || null,
            asp_rc_pickup_date: so.asp_rc_pickup_date || null,
            asp_rc_delivered_date: so.asp_rc_delivered_date || null,
            so_grn_time: so.so_grn_time || null,
            rc_receive_remark: so.rc_receive_remark || null,
          })),
          { onConflict: 'so_code' }
        );
        if (soErr) {
          // Graceful fallback if columns not yet migrated in Supabase
          if (soErr.code === '42703' || soErr.message?.includes('does not exist') || soErr.message?.includes('delivery_challan_code') || soErr.code === 'PGRST204') {
            await supabase.from('shipping_orders').upsert(
              batch.map((so) => ({
                so_code: so.so_code,
                station_code: so.station_code,
                crm_status: so.crm_status,
                motorola_status: so.motorola_status || 'CCI Send To CWH',
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
          } else {
            throw soErr;
          }
        }
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
            delivery_challan_code: it.delivery_challan_code || null,
            deliver_qty: it.deliver_qty !== undefined && it.deliver_qty !== null ? it.deliver_qty : (it.quantity || 1),
            value: it.value !== undefined && it.value !== null ? it.value : (it.estimated_value || 8000),
            asp_rc_shipping_order_code: it.asp_rc_shipping_order_code || null,
            asp_rc_ship_date: it.asp_rc_ship_date || null,
            asp_outbound_awb: it.asp_outbound_awb || null,
            asp_rc_pickup_date: it.asp_rc_pickup_date || null,
            asp_rc_delivered_date: it.asp_rc_delivered_date || null,
            so_grn_time: it.so_grn_time || null,
            rc_receive_remark: it.rc_receive_remark || null,
          })),
          { onConflict: 'composite_key' }
        );
        if (itmErr) {
          // Graceful fallback if columns not yet migrated in Supabase
          if (
            itmErr.code === '42703' ||
            itmErr.message?.includes('does not exist') ||
            itmErr.message?.includes('delivery_challan_code') ||
            itmErr.message?.includes('deliver_qty') ||
            itmErr.code === 'PGRST204'
          ) {
            await supabase.from('defective_master').upsert(
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
          } else {
            throw itmErr;
          }
        }
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

export async function pushShippingOrderDetailsToSupabase(
  rows: ShippingOrderItemRow[],
  onProgress?: (msg: string) => void
): Promise<{ success: boolean; insertedCount: number; message: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, insertedCount: 0, message: 'Supabase not configured' };
  }
  if (rows.length === 0) {
    return { success: true, insertedCount: 0, message: 'No rows to ingest' };
  }

  try {
    onProgress?.(`Ingesting ${rows.length} Shipping Order line details to Supabase Cloud...`);
    let inserted = 0;
    const batchSize = 100;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const records = batch.map((r) => ({
        shipping_order_code: r.shippingOrderCode,
        delivery_challan_code: r.deliveryChallanCode || null,
        item_code: r.itemCode,
        old_pn: r.oldPn || null,
        order_pn: r.orderPn || null,
        description: r.description || null,
        unit_price: r.unitPrice || 0,
        deliver_qty: r.deliverQty || 1,
        received_qty: r.receivedQty || 0,
        value: r.value || 0,
        way_bill_no: r.trackingNumber || null,
        carrier: r.carrier || null,
        date_issued: r.dateIssued || null,
        shipping_order_status: r.shippingOrderStatus || null,
      }));

      const { error } = await supabase.from('shipping_order_details').insert(records);
      if (error) {
        if (error.code === 'PGRST205' || error.message?.includes('does not exist')) {
          console.warn('Table shipping_order_details does not exist in Supabase yet. Run the migration SQL.', error);
          return {
            success: false,
            insertedCount: 0,
            message: 'Table shipping_order_details not found. Please execute the migration SQL in Supabase SQL Editor.',
          };
        }
        throw error;
      }
      inserted += batch.length;
      onProgress?.(`Saved ${inserted} / ${rows.length} Shipping Order detail lines in Supabase...`);
    }

    return {
      success: true,
      insertedCount: inserted,
      message: `Successfully stored ${inserted} detail lines in Supabase Cloud`,
    };
  } catch (err: any) {
    console.warn('pushShippingOrderDetailsToSupabase warning:', err);
    return { success: false, insertedCount: 0, message: err.message || 'Failed to save to Supabase' };
  }
}

export async function fetchShippingOrderDetailsBySo(soCode: string): Promise<ShippingOrderDetailRecord[]> {
  if (!isSupabaseConfigured || !supabase || !soCode) return [];
  try {
    const { data, error } = await supabase
      .from('shipping_order_details')
      .select('*')
      .eq('shipping_order_code', soCode.trim());
    if (error || !data) return [];
    return data as ShippingOrderDetailRecord[];
  } catch (_) {
    return [];
  }
}


