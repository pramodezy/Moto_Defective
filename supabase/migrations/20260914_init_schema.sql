-- =============================================================
-- MOTOROLA DEFECTIVE RETURNS CRM - SUPABASE INITIAL SCHEMA
-- =============================================================

-- ENABLE EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. CCI MASTER & REGIONAL MAPPINGS
CREATE TABLE IF NOT EXISTS cci_master (
  station_code TEXT PRIMARY KEY,               -- e.g. '65', 'BLR_01'
  username TEXT UNIQUE NOT NULL,               -- Computed/uploaded: 'cci_65'
  station_name TEXT NOT NULL,
  region TEXT NOT NULL,                        -- e.g. 'South', 'North', 'West', 'East'
  state TEXT,
  city TEXT,
  contact_person TEXT,
  contact_phone TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. USER PROFILES & AUTH RBAC
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,               -- e.g. 'cci_65', 'cwh_nilesh', 'admin_pramod'
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'CWH', 'CCI')),
  station_code TEXT REFERENCES cci_master(station_code) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. SHIPPING ORDERS MASTER
CREATE TABLE IF NOT EXISTS shipping_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  so_code TEXT UNIQUE NOT NULL,               -- "CCI-ASP Shipping Order Code"
  station_code TEXT NOT NULL REFERENCES cci_master(station_code),
  region TEXT,                                -- Denormalized for rapid regional filtering
  motorola_status TEXT DEFAULT 'CCI Send To CWH',
  crm_status TEXT NOT NULL DEFAULT 'AWB Pending',
  excel_ref_awb TEXT,
  active_awb TEXT,
  courier TEXT DEFAULT 'BlueDart Express',
  eway_bill_required BOOLEAN DEFAULT FALSE,
  eway_bill_number TEXT,
  eway_bill_url TEXT,
  cwh_evidence_ref TEXT,
  total_declared_value NUMERIC(10, 2) DEFAULT 0,
  max_sr_age INT DEFAULT 0,
  priority_tier INT DEFAULT 3,                -- 1: Critical (>=15D), 2: High (8-14D), 3: Normal
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. DEFECTIVE MASTER (Item-Level Vault)
CREATE TABLE IF NOT EXISTS defective_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  composite_key TEXT UNIQUE NOT NULL,         -- srNumber_srPartNumber_newPartNumber
  sr_number TEXT NOT NULL,
  sr_part_number TEXT NOT NULL,
  new_part_number TEXT NOT NULL,
  part_category TEXT,
  part_description TEXT,
  quantity INT DEFAULT 1,
  station_code TEXT NOT NULL REFERENCES cci_master(station_code),
  region TEXT,
  shipping_order_code TEXT NOT NULL,
  shipping_order_id UUID REFERENCES shipping_orders(id) ON DELETE SET NULL,
  sr_close_timestamp TIMESTAMPTZ,
  sr_model_name TEXT,
  sr_fault_description TEXT,
  motorola_parts_status TEXT DEFAULT 'Not Return',
  excel_awb TEXT,
  screening_status TEXT DEFAULT 'Pending' CHECK (
    screening_status IN ('Pending', 'Passed', 'Failed', 'Missing', 'Damaged')
  ),
  item_remarks TEXT,
  estimated_value NUMERIC(10, 2) DEFAULT 8000,
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. AWB DISPATCH LOG (Cancellations & Re-tokens)
CREATE TABLE IF NOT EXISTS awb_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipping_order_id UUID NOT NULL REFERENCES shipping_orders(id) ON DELETE CASCADE,
  awb_number TEXT NOT NULL,
  courier TEXT NOT NULL,
  label_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  cancellation_reason TEXT,
  pickup_date TIMESTAMPTZ,
  delivery_date TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. SYSTEM AUDIT LOG
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipping_order_id UUID REFERENCES shipping_orders(id) ON DELETE SET NULL,
  so_code TEXT,
  user_name TEXT NOT NULL,
  user_role TEXT NOT NULL,
  action TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT,
  awb TEXT,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------------
-- AUTOMATED TRIGGERS & BUSINESS LOGIC
-- -------------------------------------------------------------

-- Trigger A: Inherit Region from cci_master into defective_master
CREATE OR REPLACE FUNCTION set_item_region()
RETURNS TRIGGER AS $$
BEGIN
  SELECT region INTO NEW.region 
  FROM cci_master 
  WHERE station_code = NEW.station_code;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_item_region ON defective_master;
CREATE TRIGGER trg_set_item_region
BEFORE INSERT OR UPDATE OF station_code ON defective_master
FOR EACH ROW
EXECUTE FUNCTION set_item_region();

-- Trigger B: Automatically Aggregate Parent Shipping Order SLA & Value
CREATE OR REPLACE FUNCTION sync_shipping_order_metrics()
RETURNS TRIGGER AS $$
DECLARE
  v_so_code TEXT;
  v_so_id UUID;
  v_max_age INT := 0;
  v_total_val NUMERIC(10, 2) := 0;
  v_tier INT := 3;
  v_st_code TEXT;
  v_reg TEXT;
  v_latest_moto_status TEXT;
  v_latest_excel_awb TEXT;
BEGIN
  v_so_code := COALESCE(NEW.shipping_order_code, OLD.shipping_order_code);
  v_st_code := COALESCE(NEW.station_code, OLD.station_code);

  IF v_so_code IS NULL OR v_so_code = '' THEN
    RETURN NEW;
  END IF;

  SELECT region INTO v_reg FROM cci_master WHERE station_code = v_st_code;

  -- Ensure parent SO exists or create it
  INSERT INTO shipping_orders (so_code, station_code, region, motorola_status, excel_ref_awb)
  VALUES (v_so_code, v_st_code, v_reg, NEW.motorola_parts_status, NEW.excel_awb)
  ON CONFLICT (so_code) DO NOTHING;

  SELECT id INTO v_so_id FROM shipping_orders WHERE so_code = v_so_code;

  -- Compute SLA Age and Consignment Value across all constituent items
  SELECT 
    COALESCE(MAX(EXTRACT(DAY FROM (NOW() - sr_close_timestamp)))::INT, 0),
    COALESCE(SUM(estimated_value * quantity), 0),
    MAX(motorola_parts_status),
    MAX(excel_awb)
  INTO v_max_age, v_total_val, v_latest_moto_status, v_latest_excel_awb
  FROM defective_master
  WHERE shipping_order_code = v_so_code;

  IF v_max_age >= 15 THEN
    v_tier := 1; -- Critical SLA breach risk
  ELSIF v_max_age >= 8 THEN
    v_tier := 2; -- High Priority
  ELSE
    v_tier := 3; -- Normal
  END IF;

  UPDATE shipping_orders
  SET 
    max_sr_age = v_max_age,
    total_declared_value = v_total_val,
    priority_tier = v_tier,
    eway_bill_required = (v_total_val >= 50000),
    motorola_status = COALESCE(v_latest_moto_status, motorola_status),
    excel_ref_awb = COALESCE(v_latest_excel_awb, excel_ref_awb),
    updated_at = NOW()
  WHERE id = v_so_id;

  NEW.shipping_order_id := v_so_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_shipping_order_metrics ON defective_master;
CREATE TRIGGER trg_sync_shipping_order_metrics
BEFORE INSERT OR UPDATE ON defective_master
FOR EACH ROW
EXECUTE FUNCTION sync_shipping_order_metrics();

-- -------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS) POLICIES
-- -------------------------------------------------------------
ALTER TABLE cci_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE defective_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE awb_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION get_user_role() 
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_user_station() 
RETURNS TEXT AS $$
  SELECT station_code FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- CCI Master visibility
DROP POLICY IF EXISTS "CCI Master viewable by all authenticated users" ON cci_master;
CREATE POLICY "CCI Master viewable by all authenticated users" 
ON cci_master FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "CCI Master updates limited to Admin" ON cci_master;
CREATE POLICY "CCI Master updates limited to Admin" 
ON cci_master FOR ALL TO authenticated USING (get_user_role() = 'ADMIN');

-- Shipping Orders access: Admin & CWH see all; CCI restricted to station code
DROP POLICY IF EXISTS "SO visibility policy" ON shipping_orders;
CREATE POLICY "SO visibility policy" ON shipping_orders
FOR SELECT TO authenticated USING (
  get_user_role() IN ('ADMIN', 'CWH') 
  OR station_code = get_user_station()
);

DROP POLICY IF EXISTS "SO update policy" ON shipping_orders;
CREATE POLICY "SO update policy" ON shipping_orders
FOR ALL TO authenticated USING (
  get_user_role() IN ('ADMIN', 'CWH') 
  OR (get_user_role() = 'CCI' AND station_code = get_user_station())
);

-- Defective Master access
DROP POLICY IF EXISTS "Defective Master visibility policy" ON defective_master;
CREATE POLICY "Defective Master visibility policy" ON defective_master
FOR SELECT TO authenticated USING (
  get_user_role() IN ('ADMIN', 'CWH') 
  OR station_code = get_user_station()
);

DROP POLICY IF EXISTS "Defective Master modification policy" ON defective_master;
CREATE POLICY "Defective Master modification policy" ON defective_master
FOR ALL TO authenticated USING (
  get_user_role() IN ('ADMIN', 'CWH') 
  OR (get_user_role() = 'CCI' AND station_code = get_user_station())
);

-- Audit log access
DROP POLICY IF EXISTS "Audit logs read policy" ON audit_logs;
CREATE POLICY "Audit logs read policy" ON audit_logs FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "Audit logs insert policy" ON audit_logs;
CREATE POLICY "Audit logs insert policy" ON audit_logs FOR INSERT TO authenticated WITH CHECK (TRUE);
