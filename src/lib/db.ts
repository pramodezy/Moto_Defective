import { 
  CCIMaster, 
  ShippingOrder, 
  DefectiveItem, 
  AuditLog, 
  AWBHistory, 
  UserProfile, 
  ScreeningStatus,
  IngestionResult,
  CRMStatus,
  PickupStatus
} from '../types/crm';
import { 
  INITIAL_STATIONS, 
  INITIAL_SHIPPING_ORDERS, 
  INITIAL_DEFECTIVE_ITEMS, 
  INITIAL_AUDIT_LOGS 
} from '../data/seedData';
import { supabase, isSupabaseConfigured } from './supabase';
import { deriveCrmStatusFromMotorolaStatus, isCompletedJourneyStatus } from './motorolaStatus';

const STORAGE_KEYS = {
  STATIONS: 'moto_crm_stations_v2',
  SHIPPING_ORDERS: 'moto_crm_shipping_orders_v2',
  DEFECTIVE_ITEMS: 'moto_crm_defective_items_v2',
  AUDIT_LOGS: 'moto_crm_audit_logs_v2',
  AWB_HISTORY: 'moto_crm_awb_history_v2',
};

// Purge legacy v1 demo data from browser storage
try {
  ['moto_crm_stations_v1', 'moto_crm_shipping_orders_v1', 'moto_crm_defective_items_v1', 'moto_crm_audit_logs_v1', 'moto_crm_awb_history_v1'].forEach((k) => {
    localStorage.removeItem(k);
  });
} catch (_) {}

class CRMDatabase {
  private stations: CCIMaster[] = [];
  private shippingOrders: ShippingOrder[] = [];
  private defectiveItems: DefectiveItem[] = [];
  private auditLogs: AuditLog[] = [];
  private awbHistory: AWBHistory[] = [];
  private listeners: Set<() => void> = new Set();

  // Admin on-demand session store for completed journey (RC Received ASP)
  public isCompletedSessionLoaded: boolean = false;
  public isCompletedSessionLoading: boolean = false;
  private completedCountCache: { orders: number; items: number } = { orders: 1375, items: 6223 };

  constructor() {
    this.loadFromStorage();
    this.reapplyStationLocationMappings();
    // Connect directly to Supabase as single source of truth
    this.syncAllFromSupabase();
  }

  // Ensure all defective items and shipping orders have city, state, and region mapped from stations
  public reapplyStationLocationMappings() {
    const normalizeCode = (c: string) => String(c || '').trim().replace(/^0+/, '') || String(c || '').trim();

    const stationMap = new Map<string, CCIMaster>();
    this.stations.forEach((st) => {
      stationMap.set(st.station_code, st);
      stationMap.set(st.station_code.padStart(3, '0'), st);
      stationMap.set(normalizeCode(st.station_code), st);
    });

    let modified = false;

    this.defectiveItems.forEach((item) => {
      const st = stationMap.get(item.station_code) || 
                 stationMap.get(item.station_code.padStart(3, '0')) || 
                 stationMap.get(normalizeCode(item.station_code));
      if (st) {
        if (item.region !== st.region || item.state !== st.state || item.city !== st.city) {
          item.region = st.region;
          item.state = st.state;
          item.city = st.city;
          modified = true;
        }
      }
    });

    this.shippingOrders.forEach((so) => {
      const st = stationMap.get(so.station_code) || 
                 stationMap.get(so.station_code.padStart(3, '0')) || 
                 stationMap.get(normalizeCode(so.station_code));
      if (st) {
        if (so.region !== st.region || so.state !== st.state || so.city !== st.city) {
          so.region = st.region;
          so.state = st.state;
          so.city = st.city;
          modified = true;
        }
      }
    });

    if (modified) {
      this.saveToStorage();
    }
  }

  // Helper to fetch all rows in parallel chunks (bypassing PostgREST 1000-row default limit)
  private async fetchAllRowsParallel(
    tableName: string, 
    orderBy = 'created_at',
    applyFilter?: (query: any) => any
  ): Promise<any[]> {
    if (!isSupabaseConfigured || !supabase) return [];
    try {
      let countQuery = supabase.from(tableName).select('*', { count: 'exact', head: true });
      if (applyFilter) countQuery = applyFilter(countQuery);
      const { count, error: countErr } = await countQuery;

      if (countErr || !count || count <= 1000) {
        let query = supabase.from(tableName).select('*');
        if (applyFilter) query = applyFilter(query);
        if (orderBy) query = query.order(orderBy, { ascending: false });
        const { data } = await query;
        return data || [];
      }
      const BATCH_SIZE = 1000;
      const numBatches = Math.ceil(count / BATCH_SIZE);
      const batchPromises = [];
      for (let i = 0; i < numBatches; i++) {
        const from = i * BATCH_SIZE;
        const to = from + BATCH_SIZE - 1;
        let query = supabase.from(tableName).select('*');
        if (applyFilter) query = applyFilter(query);
        if (orderBy) query = query.order(orderBy, { ascending: false });
        batchPromises.push(query.range(from, to));
      }
      const batchResults = await Promise.all(batchPromises);
      const allRows: any[] = [];
      for (const res of batchResults) {
        if (res.data) allRows.push(...res.data);
      }
      return allRows;
    } catch (err) {
      console.warn(`Error fetching all rows for ${tableName}:`, err);
      return [];
    }
  }

  // Live Bidirectional Sync with Supabase Cloud (Single Source of Truth)
  // NOTE: Completed journey orders (RC Received ASP) are not populated into normal app memory by default.
  // They remain safely stored in Supabase and can be fetched on demand for active session by Admin ID.
  public async syncAllFromSupabase(): Promise<{ stations: number; orders: number; items: number }> {
    if (!isSupabaseConfigured || !supabase) {
      return { stations: this.stations.length, orders: this.shippingOrders.length, items: this.defectiveItems.length };
    }

    try {
      const [stRes, soRows, itemRows, logRes, soCountRes, itemCountRes] = await Promise.all([
        supabase.from('cci_master').select('*').order('station_code', { ascending: true }),
        this.fetchAllRowsParallel('shipping_orders', 'created_at', (q) => q.neq('motorola_status', 'RC Received ASP')),
        this.fetchAllRowsParallel('defective_master', 'created_at', (q) => q.neq('motorola_parts_status', 'RC Received ASP')),
        supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('shipping_orders').select('id', { count: 'exact', head: true }).eq('motorola_status', 'RC Received ASP'),
        supabase.from('defective_master').select('id', { count: 'exact', head: true }).eq('motorola_parts_status', 'RC Received ASP'),
      ]);

      if (typeof soCountRes.count === 'number') {
        this.completedCountCache.orders = soCountRes.count;
      }
      if (typeof itemCountRes.count === 'number') {
        this.completedCountCache.items = itemCountRes.count;
      }

      if (stRes.data && stRes.data.length > 0) {
        this.stations = stRes.data.map((d: any) => ({
          station_code: d.station_code,
          username: d.username || `cci_${d.station_code}`,
          station_name: d.station_name,
          region: d.region || 'West',
          state: d.state || '',
          city: d.city || '',
          contact_person: d.contact_person || '',
          contact_phone: d.contact_phone || '',
          is_active: d.is_active ?? true,
          created_at: d.created_at,
          updated_at: d.updated_at,
        }));
      }

      // Populate active shipping orders (strictly excluding Code 5 RC Received ASP)
      const activeSoRows = (soRows || []).filter((so: any) => !isCompletedJourneyStatus(so.motorola_status));
      const activeMappedOrders: ShippingOrder[] = activeSoRows.map((so: any) => ({
        id: so.id,
        so_code: so.so_code,
        station_code: so.station_code,
        region: so.region || 'West',
        state: so.state || '',
        city: so.city || '',
        motorola_status: so.motorola_status || 'CCI Send To CWH',
        crm_status: (so.crm_status as CRMStatus) || 'AWB Pending',
        excel_ref_awb: so.excel_ref_awb,
        active_awb: so.active_awb,
        courier: so.courier || 'BlueDart Express',
        eway_bill_required: Boolean(so.eway_bill_required),
        eway_bill_number: so.eway_bill_number,
        eway_bill_url: so.eway_bill_url,
        cwh_evidence_ref: so.cwh_evidence_ref,
        total_declared_value: parseFloat(so.total_declared_value || 0),
        max_sr_age: parseInt(so.max_sr_age || 0, 10),
        priority_tier: parseInt(so.priority_tier || 3, 10) as any,
        total_items: parseInt(so.total_items || 1, 10),
        created_at: so.created_at,
        updated_at: so.updated_at,
      }));

      // Populate active defective master items (strictly excluding Code 5 RC Received ASP)
      const activeItemRows = (itemRows || []).filter((it: any) => !isCompletedJourneyStatus(it.motorola_parts_status));
      const activeMappedItems: DefectiveItem[] = activeItemRows.map((it: any) => ({
        id: it.id,
        composite_key: it.composite_key,
        sr_number: it.sr_number,
        sr_part_number: it.sr_part_number,
        new_part_number: it.new_part_number || '',
        part_category: it.part_category || 'General Spare',
        part_description: it.part_description || '',
        quantity: parseInt(it.quantity || 1, 10),
        station_code: it.station_code,
        region: it.region,
        state: it.state,
        city: it.city,
        shipping_order_code: it.shipping_order_code,
        shipping_order_id: it.shipping_order_id,
        sr_close_timestamp: it.sr_close_timestamp,
        sr_model_name: it.sr_model_name,
        sr_fault_description: it.sr_fault_description,
        motorola_parts_status: it.motorola_parts_status || 'CCI Send To CWH',
        excel_awb: it.excel_awb,
        screening_status: it.screening_status || 'Pending',
        item_remarks: it.item_remarks,
        estimated_value: parseFloat(it.estimated_value || 8000),
        last_synced_at: it.last_synced_at || it.created_at,
        created_at: it.created_at,
        updated_at: it.updated_at,
      }));

      if (this.isCompletedSessionLoaded) {
        // If the Admin already loaded completed session data, preserve those completed records in memory
        const existingCompletedOrders = this.shippingOrders.filter(so => isCompletedJourneyStatus(so.motorola_status));
        const existingCompletedItems = this.defectiveItems.filter(it => isCompletedJourneyStatus(it.motorola_parts_status));
        this.shippingOrders = [...activeMappedOrders, ...existingCompletedOrders];
        this.defectiveItems = [...activeMappedItems, ...existingCompletedItems];
      } else {
        this.shippingOrders = activeMappedOrders;
        this.defectiveItems = activeMappedItems;
      }

      if (logRes.data && logRes.data.length > 0) {
        this.auditLogs = logRes.data.map((l: any) => ({
          id: l.id,
          shipping_order_id: l.shipping_order_id,
          so_code: l.so_code,
          user_name: l.user_name,
          user_role: l.user_role,
          action: l.action,
          old_status: l.old_status,
          new_status: l.new_status,
          awb: l.awb,
          remarks: l.remarks,
          created_at: l.created_at,
        }));
      }

      this.reapplyStationLocationMappings();
      this.saveToStorage();
      this.notify();

      return {
        stations: this.stations.length,
        orders: this.shippingOrders.length,
        items: this.defectiveItems.length,
      };
    } catch (e) {
      console.warn('Supabase full sync error:', e);
      return { stations: this.stations.length, orders: this.shippingOrders.length, items: this.defectiveItems.length };
    }
  }

  public getCompletedArchivedCounts(): { orders: number; items: number } {
    return { ...this.completedCountCache };
  }

  // Load completed journey orders (RC Received ASP) for the active session in Admin ID only
  public async loadCompletedSessionData(): Promise<{ orders: number; items: number }> {
    if (!isSupabaseConfigured || !supabase) {
      return { orders: 0, items: 0 };
    }
    this.isCompletedSessionLoading = true;
    this.listeners.forEach((l) => l());

    try {
      const [completedSoRows, completedItemRows] = await Promise.all([
        this.fetchAllRowsParallel('shipping_orders', 'created_at', (q) => q.eq('motorola_status', 'RC Received ASP')),
        this.fetchAllRowsParallel('defective_master', 'created_at', (q) => q.eq('motorola_parts_status', 'RC Received ASP')),
      ]);

      const mappedCompletedOrders: ShippingOrder[] = (completedSoRows || []).map((so: any) => ({
        id: so.id,
        so_code: so.so_code,
        station_code: so.station_code,
        region: so.region || 'West',
        state: so.state || '',
        city: so.city || '',
        motorola_status: so.motorola_status || 'RC Received ASP',
        crm_status: (so.crm_status as CRMStatus) || 'Closed',
        excel_ref_awb: so.excel_ref_awb,
        active_awb: so.active_awb,
        courier: so.courier || 'BlueDart Express',
        eway_bill_required: Boolean(so.eway_bill_required),
        eway_bill_number: so.eway_bill_number,
        eway_bill_url: so.eway_bill_url,
        cwh_evidence_ref: so.cwh_evidence_ref,
        total_declared_value: parseFloat(so.total_declared_value || 0),
        max_sr_age: parseInt(so.max_sr_age || 0, 10),
        priority_tier: parseInt(so.priority_tier || 3, 10) as any,
        total_items: parseInt(so.total_items || 1, 10),
        created_at: so.created_at,
        updated_at: so.updated_at,
      }));

      const mappedCompletedItems: DefectiveItem[] = (completedItemRows || []).map((it: any) => ({
        id: it.id,
        composite_key: it.composite_key,
        sr_number: it.sr_number,
        sr_part_number: it.sr_part_number,
        new_part_number: it.new_part_number || '',
        part_category: it.part_category || 'General Spare',
        part_description: it.part_description || '',
        quantity: parseInt(it.quantity || 1, 10),
        station_code: it.station_code,
        region: it.region,
        state: it.state,
        city: it.city,
        shipping_order_code: it.shipping_order_code,
        shipping_order_id: it.shipping_order_id,
        sr_close_timestamp: it.sr_close_timestamp,
        sr_model_name: it.sr_model_name,
        sr_fault_description: it.sr_fault_description,
        motorola_parts_status: it.motorola_parts_status || 'RC Received ASP',
        excel_awb: it.excel_awb,
        screening_status: it.screening_status || 'Approved',
        item_remarks: it.item_remarks,
        estimated_value: parseFloat(it.estimated_value || 8000),
        last_synced_at: it.last_synced_at || it.created_at,
        created_at: it.created_at,
        updated_at: it.updated_at,
      }));

      // Merge into in-memory store for active session without duplicate ids
      const existingSoIds = new Set(this.shippingOrders.map((o) => o.id));
      const newOrders = mappedCompletedOrders.filter((o) => !existingSoIds.has(o.id));
      this.shippingOrders = [...this.shippingOrders, ...newOrders];

      const existingItemIds = new Set(this.defectiveItems.map((i) => i.id));
      const newItems = mappedCompletedItems.filter((i) => !existingItemIds.has(i.id));
      this.defectiveItems = [...this.defectiveItems, ...newItems];

      this.isCompletedSessionLoaded = true;
      this.completedCountCache.orders = mappedCompletedOrders.length;
      this.completedCountCache.items = mappedCompletedItems.length;

      this.reapplyStationLocationMappings();
      this.listeners.forEach((l) => l());

      return { orders: mappedCompletedOrders.length, items: mappedCompletedItems.length };
    } catch (err) {
      console.error('Failed to fetch completed session data:', err);
      return { orders: 0, items: 0 };
    } finally {
      this.isCompletedSessionLoading = false;
      this.listeners.forEach((l) => l());
    }
  }

  // Unload completed session data (reverts in-memory view to active operational pipeline only)
  public unloadCompletedSessionData(): void {
    this.shippingOrders = this.shippingOrders.filter((so) => !isCompletedJourneyStatus(so.motorola_status));
    this.defectiveItems = this.defectiveItems.filter((it) => !isCompletedJourneyStatus(it.motorola_parts_status));
    this.isCompletedSessionLoaded = false;
    this.saveToStorage();
    this.listeners.forEach((l) => l());
  }

  // Synchronize stations from Supabase cci_master table
  public async syncStationsFromSupabase(): Promise<number> {
    const res = await this.syncAllFromSupabase();
    return res.stations;
  }

  private loadFromStorage() {
    try {
      const savedStations = localStorage.getItem(STORAGE_KEYS.STATIONS);
      const savedOrders = localStorage.getItem(STORAGE_KEYS.SHIPPING_ORDERS);
      const savedItems = localStorage.getItem(STORAGE_KEYS.DEFECTIVE_ITEMS);
      const savedLogs = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS);
      const savedAwbHistory = localStorage.getItem(STORAGE_KEYS.AWB_HISTORY);

      this.stations = savedStations ? JSON.parse(savedStations) : INITIAL_STATIONS;
      // Filter out any previously stored completed orders so default start is always active pipeline only
      const rawOrders = savedOrders ? JSON.parse(savedOrders) : INITIAL_SHIPPING_ORDERS;
      const rawItems = savedItems ? JSON.parse(savedItems) : INITIAL_DEFECTIVE_ITEMS;
      this.shippingOrders = rawOrders.filter((so: any) => !isCompletedJourneyStatus(so.motorola_status));
      this.defectiveItems = rawItems.filter((it: any) => !isCompletedJourneyStatus(it.motorola_parts_status));
      this.auditLogs = savedLogs ? JSON.parse(savedLogs) : INITIAL_AUDIT_LOGS;
      this.awbHistory = savedAwbHistory ? JSON.parse(savedAwbHistory) : [];

      if (!savedStations) this.saveToStorage();
    } catch (e) {
      console.warn('Failed to load from localStorage, using initial seed data', e);
      this.stations = INITIAL_STATIONS;
      this.shippingOrders = INITIAL_SHIPPING_ORDERS;
      this.defectiveItems = INITIAL_DEFECTIVE_ITEMS;
      this.auditLogs = INITIAL_AUDIT_LOGS;
      this.awbHistory = [];
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEYS.STATIONS, JSON.stringify(this.stations));
      // Only persist active operational records to localStorage; completed records stay purely in Supabase and active session
      const activeOrders = this.shippingOrders.filter((so) => !isCompletedJourneyStatus(so.motorola_status));
      const activeItems = this.defectiveItems.filter((it) => !isCompletedJourneyStatus(it.motorola_parts_status));
      localStorage.setItem(STORAGE_KEYS.SHIPPING_ORDERS, JSON.stringify(activeOrders));
      localStorage.setItem(STORAGE_KEYS.DEFECTIVE_ITEMS, JSON.stringify(activeItems));
      localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(this.auditLogs));
      localStorage.setItem(STORAGE_KEYS.AWB_HISTORY, JSON.stringify(this.awbHistory));
    } catch (e) {
      console.error('Storage quota exceeded or error writing to localStorage', e);
    }
  }

  public subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.saveToStorage();
    this.listeners.forEach((listener) => listener());
  }

  // --- QUERY METHODS ---

  public getStations(): CCIMaster[] {
    return [...this.stations];
  }

  public getShippingOrders(stationCode?: string): ShippingOrder[] {
    if (!stationCode) return [...this.shippingOrders];
    return this.shippingOrders.filter((so) => so.station_code === stationCode);
  }

  public getShippingOrderById(id: string): ShippingOrder | undefined {
    return this.shippingOrders.find((so) => so.id === id || so.so_code === id);
  }

  public getDefectiveItems(stationCode?: string, soCode?: string): DefectiveItem[] {
    let result = this.defectiveItems;
    if (stationCode) {
      result = result.filter((item) => item.station_code === stationCode);
    }
    if (soCode) {
      const cleanSo = soCode.trim().toLowerCase();
      result = result.filter((item) => (item.shipping_order_code || '').trim().toLowerCase() === cleanSo);
    }
    return [...result];
  }

  // On-demand fetch for constituent items of a specific shipping order
  public async fetchItemsForOrder(soCode: string, soId?: string): Promise<DefectiveItem[]> {
    const cleanCode = (soCode || '').trim();
    const normalize = (s?: string) => (s || '').trim().toLowerCase();

    // 1. Check if already in memory
    const inMem = this.defectiveItems.filter(
      (i) =>
        normalize(i.shipping_order_code) === normalize(cleanCode) ||
        (soId && i.shipping_order_id === soId)
    );
    if (inMem.length > 0) {
      return inMem;
    }

    // 2. Query Supabase directly on-demand
    if (!isSupabaseConfigured || !supabase) return [];
    try {
      let query = supabase.from('defective_master').select('*');
      if (soId) {
        query = query.or(`shipping_order_code.eq.${cleanCode},shipping_order_id.eq.${soId}`);
      } else {
        query = query.eq('shipping_order_code', cleanCode);
      }
      const { data, error } = await query;
      if (error || !data || data.length === 0) return [];

      const parsed: DefectiveItem[] = data.map((it: any) => ({
        id: it.id,
        composite_key: it.composite_key,
        sr_number: it.sr_number,
        sr_part_number: it.sr_part_number,
        new_part_number: it.new_part_number || '',
        part_category: it.part_category || 'General Spare',
        part_description: it.part_description || '',
        quantity: parseInt(it.quantity || 1, 10),
        station_code: it.station_code,
        region: it.region,
        state: it.state,
        city: it.city,
        shipping_order_code: it.shipping_order_code,
        shipping_order_id: it.shipping_order_id,
        sr_close_timestamp: it.sr_close_timestamp,
        sr_model_name: it.sr_model_name,
        sr_fault_description: it.sr_fault_description,
        motorola_parts_status: it.motorola_parts_status || 'CCI Send To CWH',
        excel_awb: it.excel_awb,
        screening_status: it.screening_status || 'Pending',
        item_remarks: it.item_remarks,
        estimated_value: parseFloat(it.estimated_value || 8000),
        last_synced_at: it.last_synced_at || it.created_at,
        created_at: it.created_at,
        updated_at: it.updated_at,
      }));

      // Merge into local cache so future lookups are instant
      parsed.forEach((newItem) => {
        const existingIdx = this.defectiveItems.findIndex(
          (x) => x.id === newItem.id || x.composite_key === newItem.composite_key
        );
        if (existingIdx >= 0) {
          this.defectiveItems[existingIdx] = newItem;
        } else {
          this.defectiveItems.push(newItem);
        }
      });
      this.notify();
      return parsed;
    } catch (err) {
      console.warn('fetchItemsForOrder failed:', err);
      return [];
    }
  }

  public getAuditLogs(): AuditLog[] {
    return [...this.auditLogs].sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  public getAwbHistory(soId?: string): AWBHistory[] {
    if (!soId) return [...this.awbHistory];
    return this.awbHistory.filter((h) => h.shipping_order_id === soId);
  }

  // --- RECALCULATE SHIPPING ORDER METRICS (Trigger B Simulation) ---
  private recalculateShippingOrder(soCode: string) {
    const items = this.defectiveItems.filter((i) => i.shipping_order_code === soCode);
    const existingSo = this.shippingOrders.find((so) => so.so_code === soCode);
    if (!existingSo && items.length === 0) return;

    let maxAge = 0;
    let totalVal = 0;
    let latestMotoStatus = 'CCI Send To CWH';
    let latestExcelAwb = '';

    const now = new Date().getTime();

    items.forEach((item) => {
      const itemVal = (item.estimated_value || 8000) * (item.quantity || 1);
      totalVal += itemVal;
      if (item.sr_close_timestamp) {
        const closeTime = new Date(item.sr_close_timestamp).getTime();
        if (!isNaN(closeTime)) {
          const ageDays = Math.max(0, Math.floor((now - closeTime) / (1000 * 60 * 60 * 24)));
          if (ageDays > maxAge) maxAge = ageDays;
        }
      }
      if (item.motorola_parts_status) {
        latestMotoStatus = item.motorola_parts_status;
      }
      if (item.excel_awb) {
        latestExcelAwb = item.excel_awb;
      }
    });

    // Priority Tier: 1: >=15D, 2: 8-14D, 3: <8D
    const tier = maxAge >= 15 ? 1 : maxAge >= 8 ? 2 : 3;
    const ewayRequired = totalVal >= 50000;

    const stationCode = items[0]?.station_code || existingSo?.station_code || '000';
    const station = this.stations.find((st) => st.station_code === stationCode);
    const region = station?.region || existingSo?.region || 'West';
    const state = station?.state || existingSo?.state || '';
    const city = station?.city || existingSo?.city || '';

    const derivedCrmStatus = deriveCrmStatusFromMotorolaStatus(
      latestMotoStatus,
      latestExcelAwb || existingSo?.active_awb,
      existingSo?.crm_status
    );

    if (existingSo) {
      existingSo.max_sr_age = maxAge;
      existingSo.total_declared_value = totalVal;
      existingSo.priority_tier = tier;
      existingSo.eway_bill_required = ewayRequired;
      existingSo.total_items = items.reduce((sum, item) => sum + (item.quantity || 1), 0);
      existingSo.motorola_status = latestMotoStatus || existingSo.motorola_status;
      existingSo.crm_status = derivedCrmStatus;
      if (derivedCrmStatus === 'Closed' || latestMotoStatus?.toLowerCase().includes('rc received')) {
        existingSo.pickup_status = 'Pickup Done';
      }
      if (latestExcelAwb) existingSo.excel_ref_awb = latestExcelAwb;
      existingSo.region = region;
      existingSo.state = state;
      existingSo.city = city;
      existingSo.updated_at = new Date().toISOString();
    } else {
      const isDelivered = derivedCrmStatus === 'Closed' || latestMotoStatus?.toLowerCase().includes('rc received');
      const newSo: ShippingOrder = {
        id: `so-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        so_code: soCode,
        station_code: stationCode,
        region,
        state,
        city,
        motorola_status: latestMotoStatus,
        crm_status: derivedCrmStatus,
        excel_ref_awb: latestExcelAwb,
        active_awb: latestExcelAwb,
        courier: 'BlueDart Express',
        pickup_status: isDelivered ? 'Pickup Done' : (latestExcelAwb ? 'Pickup Pending' : undefined),
        eway_bill_required: ewayRequired,
        total_declared_value: totalVal,
        max_sr_age: maxAge,
        priority_tier: tier,
        total_items: items.reduce((sum, item) => sum + (item.quantity || 1), 0),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.shippingOrders.unshift(newSo);
    }
  }

  // --- UPSERT DEFECTIVE MASTER (Dual-Status Ingestion Engine) ---
  public batchUpsertDefectiveItems(
    incomingItems: Partial<DefectiveItem>[],
    user: UserProfile
  ): IngestionResult {
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];
    const affectedSoCodes = new Set<string>();

    const itemMap = new Map<string, DefectiveItem>();
    this.defectiveItems.forEach((item) => {
      itemMap.set(item.composite_key, item);
    });

    incomingItems.forEach((incoming, idx) => {
      try {
        if (!incoming.sr_number || !incoming.sr_part_number || !incoming.shipping_order_code) {
          skipped++;
          return;
        }

        const compositeKey = incoming.composite_key || 
          `${incoming.sr_number}_${incoming.sr_part_number}_${incoming.new_part_number || ''}`;

        const stationCode = incoming.station_code || '068';
        const station = this.stations.find((s) => s.station_code === stationCode);
        const region = station?.region || incoming.region || 'West';
        const state = station?.state || incoming.state || '';
        const city = station?.city || incoming.city || '';

        const existing = itemMap.get(compositeKey);

        if (existing) {
          // Dual-Status Update: Refresh external Motorola fields without overwriting internal CRM logistics data
          existing.motorola_parts_status = incoming.motorola_parts_status || existing.motorola_parts_status;
          existing.excel_awb = incoming.excel_awb !== undefined ? incoming.excel_awb : existing.excel_awb;
          existing.part_category = incoming.part_category || existing.part_category;
          existing.part_description = incoming.part_description || existing.part_description;
          existing.sr_model_name = incoming.sr_model_name || existing.sr_model_name;
          existing.sr_fault_description = incoming.sr_fault_description || existing.sr_fault_description;
          existing.sr_close_timestamp = incoming.sr_close_timestamp || existing.sr_close_timestamp;
          existing.estimated_value = incoming.estimated_value || existing.estimated_value;
          existing.region = region;
          existing.state = state;
          existing.city = city;
          existing.last_synced_at = new Date().toISOString();
          existing.updated_at = new Date().toISOString();
          
          updated++;
        } else {
          // New Line Item
          const newItem: DefectiveItem = {
            id: `item-${Date.now()}-${idx}`,
            composite_key: compositeKey,
            sr_number: incoming.sr_number,
            sr_part_number: incoming.sr_part_number,
            new_part_number: incoming.new_part_number || '',
            part_category: incoming.part_category || 'General Spare',
            part_description: incoming.part_description || '',
            quantity: incoming.quantity || 1,
            station_code: stationCode,
            region,
            state,
            city,
            shipping_order_code: incoming.shipping_order_code,
            sr_close_timestamp: incoming.sr_close_timestamp,
            sr_model_name: incoming.sr_model_name,
            sr_fault_description: incoming.sr_fault_description,
            motorola_parts_status: incoming.motorola_parts_status || 'CCI Send To CWH',
            excel_awb: incoming.excel_awb || '',
            screening_status: incoming.screening_status || 'Pending',
            item_remarks: incoming.item_remarks || '',
            estimated_value: incoming.estimated_value || 8000,
            last_synced_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          itemMap.set(compositeKey, newItem);
          this.defectiveItems.unshift(newItem);
          inserted++;
        }

        affectedSoCodes.add(incoming.shipping_order_code);
      } catch (err: any) {
        errors.push(`Row ${idx + 1}: ${err.message || 'Unknown processing error'}`);
        skipped++;
      }
    });

    // Trigger B: Recalculate each affected parent shipping order
    affectedSoCodes.forEach((soCode) => {
      this.recalculateShippingOrder(soCode);
    });

    // Live push to Supabase Cloud
    if (isSupabaseConfigured && supabase) {
      const client = supabase;
      const itemsToPush = this.defectiveItems.filter((i) => affectedSoCodes.has(i.shipping_order_code));
      const ordersToPush = this.shippingOrders.filter((o) => affectedSoCodes.has(o.so_code));

      (async () => {
        try {
          await client.from('shipping_orders').upsert(
            ordersToPush.map((so) => ({
              so_code: so.so_code,
              station_code: so.station_code,
              region: so.region,
              state: so.state,
              city: so.city,
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

          await client.from('defective_master').upsert(
            itemsToPush.map((it) => ({
              composite_key: it.composite_key,
              sr_number: it.sr_number,
              sr_part_number: it.sr_part_number,
              new_part_number: it.new_part_number || '',
              part_category: it.part_category,
              part_description: it.part_description,
              quantity: it.quantity,
              station_code: it.station_code,
              region: it.region,
              state: it.state,
              city: it.city,
              shipping_order_code: it.shipping_order_code,
              sr_close_timestamp: it.sr_close_timestamp,
              sr_model_name: it.sr_model_name,
              sr_fault_description: it.sr_fault_description,
              motorola_parts_status: it.motorola_parts_status,
              excel_awb: it.excel_awb,
              screening_status: it.screening_status,
              item_remarks: it.item_remarks,
              estimated_value: it.estimated_value,
            })),
            { onConflict: 'composite_key' }
          );
        } catch (e: any) {
          console.warn('Supabase live push error:', e);
        }
      })();
    }

    // Audit log
    this.auditLogs.unshift({
      id: `log-${Date.now()}`,
      user_name: user.full_name,
      user_role: user.role,
      action: 'DEFECTIVE_REPORT_UPLOAD',
      remarks: `Processed ${incomingItems.length} records (${inserted} inserted, ${updated} updated, ${skipped} skipped). ${affectedSoCodes.size} Shipping Orders synchronized.`,
      created_at: new Date().toISOString(),
    });

    this.notify();

    return {
      totalRows: incomingItems.length,
      inserted,
      updated,
      skipped,
      shippingOrdersCreated: 0,
      shippingOrdersUpdated: affectedSoCodes.size,
      errors,
      timestamp: new Date().toISOString(),
    };
  }

  // --- UPSERT CCI REGION MAPPINGS ---
  public batchUpsertStations(
    newStations: CCIMaster[],
    user: UserProfile
  ): { inserted: number; updated: number; stationsAffected: number } {
    let inserted = 0;
    let updated = 0;

    newStations.forEach((st) => {
      const idx = this.stations.findIndex((s) => s.station_code === st.station_code);
      if (idx >= 0) {
        this.stations[idx] = { ...this.stations[idx], ...st, updated_at: new Date().toISOString() };
        updated++;
      } else {
        this.stations.push({
          ...st,
          username: st.username || `cci_${st.station_code}`,
          is_active: st.is_active ?? true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        inserted++;
      }

      // Propagate region, state, and city to existing defective items and shipping orders for this station
      this.defectiveItems.forEach((item) => {
        if (item.station_code === st.station_code) {
          item.region = st.region;
          item.state = st.state;
          item.city = st.city;
        }
      });
      this.shippingOrders.forEach((so) => {
        if (so.station_code === st.station_code) {
          so.region = st.region;
          so.state = st.state;
          so.city = st.city;
        }
      });
    });

    // Also push to Supabase cci_master asynchronously if connected
    if (isSupabaseConfigured && supabase) {
      supabase.from('cci_master').upsert(
        newStations.map((st) => ({
          station_code: st.station_code,
          username: st.username || `cci_${st.station_code}`,
          station_name: st.station_name,
          region: st.region,
          state: st.state || '',
          city: st.city || '',
          contact_person: st.contact_person || '',
          contact_phone: st.contact_phone || '',
          is_active: st.is_active ?? true,
        })),
        { onConflict: 'station_code' }
      ).then(({ error }) => {
        if (error) console.error('Failed to sync uploaded stations to Supabase cci_master:', error);
      });
    }

    this.auditLogs.unshift({
      id: `log-${Date.now()}`,
      user_name: user.full_name,
      user_role: user.role,
      action: 'REGION_MAPPING_UPLOAD',
      remarks: `Synchronized ${newStations.length} station region mappings (${inserted} new, ${updated} updated).`,
      created_at: new Date().toISOString(),
    });

    this.notify();

    return {
      inserted,
      updated,
      stationsAffected: newStations.length,
    };
  }

  // --- CWH INWARD VERIFICATION & CCTV UNBOXING (STAGE 1 QTY & STAGE 2 PART MATCHING) ---
  public inwardVerifyConsignment(
    soId: string,
    screeningMap: Record<string, { status: ScreeningStatus; remarks?: string; partMatched?: boolean }>,
    cwhEvidenceRef: string | null,
    user: UserProfile,
    qtyVerification?: {
      expectedQty: number;
      receivedQty: number;
      cartonCondition: string;
      qtyDiscrepancyNote?: string;
    }
  ) {
    const so = this.shippingOrders.find((o) => o.id === soId || o.so_code === soId);
    if (!so) throw new Error('Shipping Order not found');

    const oldStatus = so.crm_status;
    let hasDiscrepancy = false;
    const discrepancyNotes: string[] = [];

    // Stage 1: Quantity & Carton Discrepancy Evaluation
    if (qtyVerification) {
      if (qtyVerification.receivedQty !== qtyVerification.expectedQty) {
        hasDiscrepancy = true;
        const diff = qtyVerification.receivedQty - qtyVerification.expectedQty;
        discrepancyNotes.push(
          `Stage 1 Qty Mismatch: Expected ${qtyVerification.expectedQty}, Received ${qtyVerification.receivedQty} (${diff > 0 ? `+${diff} Excess` : `${diff} Shortage`})`
        );
      }
      if (qtyVerification.cartonCondition && qtyVerification.cartonCondition !== 'Intact & Sealed') {
        hasDiscrepancy = true;
        discrepancyNotes.push(`Carton Condition: ${qtyVerification.cartonCondition}`);
      }
      if (qtyVerification.qtyDiscrepancyNote?.trim()) {
        discrepancyNotes.push(`Package Notes: ${qtyVerification.qtyDiscrepancyNote.trim()}`);
      }
    }

    // Stage 2: Part-wise Matching & Physical Inspection
    Object.entries(screeningMap).forEach(([itemId, data]) => {
      const item = this.defectiveItems.find((i) => i.id === itemId);
      if (item) {
        item.screening_status = data.status;
        if (data.remarks) item.item_remarks = data.remarks;
        
        const isItemDiscrepancy = ['Failed', 'Damaged', 'Missing'].includes(data.status) || data.partMatched === false;
        item.motorola_parts_status = isItemDiscrepancy
          ? 'CWH Received - Discrepancies'
          : '3. CWH Received';
        item.updated_at = new Date().toISOString();

        if (isItemDiscrepancy) {
          hasDiscrepancy = true;
          discrepancyNotes.push(
            `Part ${item.sr_part_number} (${item.sr_number}): ${data.status}${data.partMatched === false ? ' [Wrong Part]' : ''}${data.remarks ? ` - ${data.remarks}` : ''}`
          );
        }
      }
    });

    const newStatus: CRMStatus = hasDiscrepancy ? 'CWH Received - Discrepancies' : 'CWH Received';
    so.crm_status = newStatus;
    so.motorola_status = hasDiscrepancy ? 'CWH Received - Discrepancies' : '3. CWH Received';
    so.pickup_status = 'Pickup Done';
    if (cwhEvidenceRef) {
      so.cwh_evidence_ref = cwhEvidenceRef;
    }
    so.updated_at = new Date().toISOString();

    this.auditLogs.unshift({
      id: `log-${Date.now()}`,
      shipping_order_id: so.id,
      so_code: so.so_code,
      user_name: user.full_name,
      user_role: user.role,
      action: 'CWH_INWARD_VERIFICATION',
      old_status: oldStatus,
      new_status: newStatus,
      remarks: hasDiscrepancy 
        ? `Consignment inward verified with Discrepancies under CCTV Bay. Notes: ${discrepancyNotes.join('; ')}. Evidence attached.`
        : `Consignment inward verified successfully. All ${qtyVerification?.expectedQty || so.total_items || 1} units and parts passed inspection under CCTV.`,
      created_at: new Date().toISOString(),
    });

    // Live update to Supabase Cloud if configured
    if (isSupabaseConfigured && supabase) {
      const client = supabase;
      client.from('shipping_orders').update({
        crm_status: so.crm_status,
        motorola_status: so.motorola_status,
        pickup_status: so.pickup_status,
        cwh_evidence_ref: so.cwh_evidence_ref,
        updated_at: so.updated_at,
      }).or(`id.eq.${so.id},so_code.eq.${so.so_code}`).then(({ error }) => {
        if (error) console.warn('Live Supabase update for inward verification failed:', error.message);
      });

      // Update constituent defective line items
      client.from('defective_master').update({
        motorola_parts_status: so.motorola_status,
        updated_at: so.updated_at,
      }).eq('shipping_order_code', so.so_code).then(({ error }) => {
        if (error) console.warn('Live Supabase defective items update failed:', error.message);
      });
    }

    this.notify();
    return so;
  }

  // --- CWH DISPATCH TO RC (Lenovo CRM Outbound) ---
  public dispatchOrderToRc(
    soId: string,
    data: {
      dcNumber: string;
      courier?: string;
      remarks?: string;
    },
    user: UserProfile
  ): ShippingOrder {
    const so = this.shippingOrders.find((o) => o.id === soId || o.so_code === soId);
    if (!so) throw new Error('Shipping Order not found');

    const oldStatus = so.crm_status;
    so.crm_status = 'Dispatched to RC';
    so.motorola_status = '4. ASP Send to RC';
    if (data.courier) so.courier = data.courier;
    so.updated_at = new Date().toISOString();

    // Update constituent defective items
    this.defectiveItems
      .filter((i) => (i.shipping_order_code || '').trim() === so.so_code.trim())
      .forEach((item) => {
        item.motorola_parts_status = '4. ASP Send to RC';
        item.updated_at = new Date().toISOString();
      });

    this.auditLogs.unshift({
      id: `log-${Date.now()}`,
      shipping_order_id: so.id,
      so_code: so.so_code,
      user_name: user.full_name,
      user_role: user.role,
      action: 'CWH_DISPATCH_TO_RC',
      old_status: oldStatus,
      new_status: 'Dispatched to RC',
      remarks: `CWH created Delivery Challan to RC in Lenovo CRM: ${data.dcNumber} (${data.courier || so.courier}).${data.remarks ? ` Notes: ${data.remarks}` : ''}`,
      created_at: new Date().toISOString(),
    });

    if (isSupabaseConfigured && supabase) {
      const client = supabase;
      client.from('shipping_orders').update({
        crm_status: so.crm_status,
        motorola_status: so.motorola_status,
        courier: so.courier,
        updated_at: so.updated_at,
      }).or(`id.eq.${so.id},so_code.eq.${so.so_code}`).then(({ error }) => {
        if (error) console.warn('Supabase update for dispatch to RC failed:', error.message);
      });

      client.from('defective_master').update({
        motorola_parts_status: so.motorola_status,
        updated_at: so.updated_at,
      }).eq('shipping_order_code', so.so_code).then(({ error }) => {
        if (error) console.warn('Supabase defective items update failed:', error.message);
      });
    }

    this.notify();
    return so;
  }

  // --- AWB TOKEN ASSIGNMENT & RETOKENING ---
  public assignAwbToken(
    soId: string,
    courier: string,
    newAwb: string,
    user: UserProfile,
    cancellationReason?: string
  ) {
    const so = this.shippingOrders.find((o) => o.id === soId || o.so_code === soId);
    if (!so) throw new Error('Shipping Order not found');

    const oldAwb = so.active_awb;

    // Archive previous AWB if retokening
    if (oldAwb && oldAwb !== newAwb) {
      this.awbHistory.unshift({
        id: `awb-${Date.now()}`,
        shipping_order_id: so.id,
        awb_number: oldAwb,
        courier: so.courier,
        is_active: false,
        cancellation_reason: cancellationReason || 'Retokened / Courier Rescheduled',
        created_by: user.id,
        created_at: new Date().toISOString(),
      });
    }

    // Add new AWB into history
    this.awbHistory.unshift({
      id: `awb-${Date.now() + 1}`,
      shipping_order_id: so.id,
      awb_number: newAwb,
      courier,
      is_active: true,
      created_by: user.id,
      created_at: new Date().toISOString(),
    });

    so.active_awb = newAwb;
    so.courier = courier;
    so.pickup_status = 'Pickup Pending'; // AWB assigned by CWH; awaiting handover from CCI
    so.updated_at = new Date().toISOString();

    this.auditLogs.unshift({
      id: `log-${Date.now()}`,
      shipping_order_id: so.id,
      so_code: so.so_code,
      user_name: user.full_name,
      user_role: user.role,
      action: oldAwb ? 'AWB_RETOKENED' : 'AWB_ASSIGNED',
      awb: newAwb,
      remarks: oldAwb
        ? `AWB retokened from ${oldAwb} to ${newAwb} (${courier}). Reason: ${cancellationReason || 'Courier reassignment'}`
        : `New AWB ${newAwb} generated for ${courier}`,
      created_at: new Date().toISOString(),
    });

    // Live update to Supabase Cloud
    if (isSupabaseConfigured && supabase) {
      supabase.from('shipping_orders').update({
        active_awb: so.active_awb,
        courier: so.courier,
        pickup_status: so.pickup_status,
        updated_at: so.updated_at,
      }).or(`id.eq.${so.id},so_code.eq.${so.so_code}`).then(({ error }) => {
        if (error) console.warn('Live Supabase update for assign AWB failed:', error.message);
      });
    }

    this.notify();
    return so;
  }

  // --- CCI PICKUP & AWB UPDATE ACTION ---
  public updateCciPickupAction(
    soId: string,
    data: {
      pickupStatus: PickupStatus;
      newAwb?: string;
      courier?: string;
      remarks?: string;
    },
    user: UserProfile
  ): ShippingOrder {
    const so = this.shippingOrders.find((o) => o.id === soId || o.so_code === soId);
    if (!so) throw new Error('Shipping Order not found');

    const oldAwb = so.active_awb || so.excel_ref_awb || '';
    let awbChanged = false;
    const cleanNewAwb = data.newAwb?.trim();

    // 1. If AWB is modified by CCI
    if (cleanNewAwb && cleanNewAwb !== oldAwb) {
      awbChanged = true;

      // Archive previous AWB in history
      if (oldAwb) {
        this.awbHistory.unshift({
          id: `awb-${Date.now()}`,
          shipping_order_id: so.id,
          awb_number: oldAwb,
          courier: so.courier,
          is_active: false,
          cancellation_reason: data.remarks || 'Updated by CCI at Service Center during pickup',
          created_by: user.id,
          created_at: new Date().toISOString(),
        });
      }

      // Record new AWB
      this.awbHistory.unshift({
        id: `awb-${Date.now() + 1}`,
        shipping_order_id: so.id,
        awb_number: cleanNewAwb,
        courier: data.courier || so.courier,
        is_active: true,
        pickup_date: data.pickupStatus === 'Pickup Done' ? new Date().toISOString() : undefined,
        created_by: user.id,
        created_at: new Date().toISOString(),
      });

      so.active_awb = cleanNewAwb;
      if (data.courier) so.courier = data.courier;
    }

    // 2. Update Pickup Status & Timestamps
    so.pickup_status = data.pickupStatus;
    so.pickup_remarks = data.remarks || '';

    if (data.pickupStatus === 'Pickup Done') {
      so.pickup_date = new Date().toISOString();
      so.crm_status = 'In Transit'; // Consignment is now moving with the courier
    } else if (data.pickupStatus === 'Pickup Not Done') {
      // Remain at station pending resolution
      so.crm_status = so.crm_status === 'In Transit' ? 'AWB Pending' : so.crm_status;
    }

    so.updated_at = new Date().toISOString();

    // 3. System Audit Log
    this.auditLogs.unshift({
      id: `log-${Date.now()}`,
      shipping_order_id: so.id,
      so_code: so.so_code,
      user_name: user.full_name,
      user_role: user.role,
      action: data.pickupStatus === 'Pickup Done' ? 'CCI_PICKUP_DONE' : 'CCI_PICKUP_NOT_DONE',
      awb: so.active_awb,
      remarks: `CCI ${user.username} marked status: "${data.pickupStatus}".${
        awbChanged ? ` AWB updated from ${oldAwb || 'None'} to ${so.active_awb} (${so.courier}).` : ''
      }${data.remarks ? ` Notes: ${data.remarks}` : ''}`,
      created_at: new Date().toISOString(),
    });

    // 4. Live update to Supabase Cloud if configured
    if (isSupabaseConfigured && supabase) {
      supabase.from('shipping_orders').update({
        active_awb: so.active_awb,
        courier: so.courier,
        crm_status: so.crm_status,
        pickup_status: so.pickup_status,
        pickup_date: so.pickup_date,
        pickup_remarks: so.pickup_remarks,
        updated_at: so.updated_at,
      }).or(`id.eq.${so.id},so_code.eq.${so.so_code}`).then(({ error }) => {
        if (error) console.warn('Live Supabase update for CCI pickup action failed:', error.message);
      });
    }

    this.notify();
    return so;
  }

  // --- E-WAY BILL ATTACHMENT ---
  public attachEwayBill(soId: string, ewayNumber: string, ewayUrl: string, user: UserProfile) {
    const so = this.shippingOrders.find((o) => o.id === soId || o.so_code === soId);
    if (!so) throw new Error('Shipping Order not found');

    so.eway_bill_number = ewayNumber;
    so.eway_bill_url = ewayUrl;
    so.updated_at = new Date().toISOString();

    this.auditLogs.unshift({
      id: `log-${Date.now()}`,
      shipping_order_id: so.id,
      so_code: so.so_code,
      user_name: user.full_name,
      user_role: user.role,
      action: 'EWAY_BILL_ATTACHED',
      remarks: `Attached E-Way Bill #${ewayNumber} for consignment value ${so.total_declared_value}`,
      created_at: new Date().toISOString(),
    });

    this.notify();
    return so;
  }

  // --- ADMIN DELETION METHODS (Strictly Admin Only) ---
  public deleteShippingOrder(soId: string, user: UserProfile) {
    if (user.role !== 'ADMIN') {
      throw new Error('Unauthorized: Only Administrator is permitted to delete consignments.');
    }

    const orderIdx = this.shippingOrders.findIndex((o) => o.id === soId || o.so_code === soId);
    if (orderIdx === -1) throw new Error('Shipping order not found');

    const target = this.shippingOrders[orderIdx];

    // Remove constituent line items
    const beforeCount = this.defectiveItems.length;
    this.defectiveItems = this.defectiveItems.filter((i) => i.shipping_order_code !== target.so_code);
    const itemsRemoved = beforeCount - this.defectiveItems.length;

    // Remove the shipping order
    this.shippingOrders.splice(orderIdx, 1);

    // Delete in Supabase if configured
    if (isSupabaseConfigured && supabase) {
      const client = supabase;
      (async () => {
        try {
          await client.from('defective_master').delete().eq('shipping_order_code', target.so_code);
          await client.from('shipping_orders').delete().or(`id.eq.${target.id},so_code.eq.${target.so_code}`);
        } catch (e: any) {
          console.warn('Supabase order delete error:', e);
        }
      })();
    }

    // Audit log
    this.auditLogs.unshift({
      id: `log-${Date.now()}`,
      so_code: target.so_code,
      user_name: user.full_name,
      user_role: user.role,
      action: 'CONSIGNMENT_DELETED',
      remarks: `Admin deleted Consignment ${target.so_code} and ${itemsRemoved} associated defective line items.`,
      created_at: new Date().toISOString(),
    });

    this.notify();
    return true;
  }

  public deleteDefectiveItem(itemId: string, user: UserProfile) {
    if (user.role !== 'ADMIN') {
      throw new Error('Unauthorized: Only Administrator is permitted to delete defective items.');
    }

    const itemIdx = this.defectiveItems.findIndex((i) => i.id === itemId);
    if (itemIdx === -1) throw new Error('Defective line item not found');

    const target = this.defectiveItems[itemIdx];
    const parentSoCode = target.shipping_order_code;

    // Remove the line item
    this.defectiveItems.splice(itemIdx, 1);

    // Delete in Supabase if configured
    if (isSupabaseConfigured && supabase) {
      const client = supabase;
      (async () => {
        try {
          await client.from('defective_master').delete().or(`id.eq.${target.id},composite_key.eq.${target.composite_key}`);
        } catch (e: any) {
          console.warn('Supabase item delete error:', e);
        }
      })();
    }

    // Recalculate parent shipping order
    if (parentSoCode) {
      this.recalculateShippingOrder(parentSoCode);
    }

    // Audit log
    this.auditLogs.unshift({
      id: `log-${Date.now()}`,
      so_code: parentSoCode,
      user_name: user.full_name,
      user_role: user.role,
      action: 'DEFECTIVE_ITEM_DELETED',
      remarks: `Admin deleted defective line item ${target.sr_number} (${target.sr_part_number}) from SO ${parentSoCode}.`,
      created_at: new Date().toISOString(),
    });

    this.notify();
    return true;
  }

  public deleteStation(stationCode: string, user: UserProfile) {
    if (user.role !== 'ADMIN') {
      throw new Error('Unauthorized: Only Administrator is permitted to delete stations.');
    }

    const idx = this.stations.findIndex((s) => s.station_code === stationCode);
    if (idx === -1) throw new Error('Station not found');

    const st = this.stations[idx];
    this.stations.splice(idx, 1);

    this.auditLogs.unshift({
      id: `log-${Date.now()}`,
      user_name: user.full_name,
      user_role: user.role,
      action: 'STATION_DELETED',
      remarks: `Admin deleted Station ${st.station_code} (${st.station_name}).`,
      created_at: new Date().toISOString(),
    });

    this.notify();
    return true;
  }
}

export const crmDb = new CRMDatabase();
