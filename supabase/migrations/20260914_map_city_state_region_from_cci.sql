-- =============================================================
-- MIGRATION: Auto-map City, State, and Region from cci_master
-- =============================================================

-- 1. Ensure city and state exist on shipping_orders and defective_master
ALTER TABLE shipping_orders ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE shipping_orders ADD COLUMN IF NOT EXISTS city TEXT;

ALTER TABLE defective_master ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE defective_master ADD COLUMN IF NOT EXISTS city TEXT;

-- 2. Trigger Function: Populate item region, state, and city from cci_master
CREATE OR REPLACE FUNCTION set_item_location_from_cci()
RETURNS TRIGGER AS $$
BEGIN
  SELECT region, state, city 
  INTO NEW.region, NEW.state, NEW.city 
  FROM cci_master 
  WHERE station_code = NEW.station_code;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_item_region ON defective_master;
DROP TRIGGER IF EXISTS trg_set_item_location ON defective_master;
CREATE TRIGGER trg_set_item_location
BEFORE INSERT OR UPDATE OF station_code ON defective_master
FOR EACH ROW
EXECUTE FUNCTION set_item_location_from_cci();

-- 3. Trigger Function: Populate Shipping Order region, state, and city from cci_master
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
  v_state TEXT;
  v_city TEXT;
  v_latest_moto_status TEXT;
  v_latest_excel_awb TEXT;
BEGIN
  v_so_code := COALESCE(NEW.shipping_order_code, OLD.shipping_order_code);
  v_st_code := COALESCE(NEW.station_code, OLD.station_code);

  IF v_so_code IS NULL OR v_so_code = '' THEN
    RETURN NEW;
  END IF;

  -- Always lookup region, state, and city from cci_master
  SELECT region, state, city INTO v_reg, v_state, v_city FROM cci_master WHERE station_code = v_st_code;

  -- Ensure parent SO exists or create it
  INSERT INTO shipping_orders (so_code, station_code, region, state, city, motorola_status, excel_ref_awb)
  VALUES (v_so_code, v_st_code, v_reg, v_state, v_city, NEW.motorola_parts_status, NEW.excel_awb)
  ON CONFLICT (so_code) DO UPDATE SET
    region = COALESCE(EXCLUDED.region, shipping_orders.region),
    state = COALESCE(EXCLUDED.state, shipping_orders.state),
    city = COALESCE(EXCLUDED.city, shipping_orders.city);

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
    region = COALESCE(v_reg, region),
    state = COALESCE(v_state, state),
    city = COALESCE(v_city, city),
    updated_at = NOW()
  WHERE id = v_so_id;

  NEW.shipping_order_id := v_so_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Cascade Trigger on cci_master: When station region, state, or city is updated in Supabase,
-- propagate immediately to all defective_master items and shipping_orders
CREATE OR REPLACE FUNCTION cascade_cci_master_location()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE defective_master
  SET 
    region = NEW.region,
    state = NEW.state,
    city = NEW.city
  WHERE station_code = NEW.station_code;

  UPDATE shipping_orders
  SET 
    region = NEW.region,
    state = NEW.state,
    city = NEW.city
  WHERE station_code = NEW.station_code;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cascade_cci_master_location ON cci_master;
CREATE TRIGGER trg_cascade_cci_master_location
AFTER UPDATE OF region, state, city ON cci_master
FOR EACH ROW
EXECUTE FUNCTION cascade_cci_master_location();

-- 5. One-time backfill: Map existing defective items and shipping orders from cci_master
UPDATE defective_master dm
SET 
  region = cm.region,
  state = cm.state,
  city = cm.city
FROM cci_master cm
WHERE dm.station_code = cm.station_code;

UPDATE shipping_orders so
SET 
  region = cm.region,
  state = cm.state,
  city = cm.city
FROM cci_master cm
WHERE so.station_code = cm.station_code;
