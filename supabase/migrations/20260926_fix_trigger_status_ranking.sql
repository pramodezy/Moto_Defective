-- Fix PostgreSQL trigger sync_shipping_order_metrics:
-- Replace alphabetical MAX(motorola_parts_status) with operational stage ranking.
-- Alphabetical MAX previously preferred 'CCI Send To CWH' ('C') over 'ASP Send To RC' ('A'),
-- causing parent consignments to show 'CCI Send To CWH' even when all parts advanced to 'ASP Send To RC'.

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
    MAX(excel_awb)
  INTO v_max_age, v_total_val, v_latest_excel_awb
  FROM defective_master
  WHERE shipping_order_code = v_so_code;

  -- Select the highest operational Motorola stage across all items:
  -- Code 6: Discrepancy (RC Negative / CWH Discrepancy)
  -- Code 5: RC Received ASP
  -- Code 4: ASP Send to RC
  -- Code 3: CWH Received
  -- Code 2: CCI Send to CWH
  -- Code 1: Not Return
  SELECT motorola_parts_status
  INTO v_latest_moto_status
  FROM defective_master
  WHERE shipping_order_code = v_so_code
  ORDER BY 
    CASE 
      WHEN motorola_parts_status ILIKE '%negative%' OR motorola_parts_status ILIKE '%discrepanc%' THEN 6
      WHEN motorola_parts_status ILIKE '%rc received%' THEN 5
      WHEN motorola_parts_status ILIKE '%send to rc%' THEN 4
      WHEN motorola_parts_status ILIKE '%cwh received%' THEN 3
      WHEN motorola_parts_status ILIKE '%cci send%' THEN 2
      WHEN motorola_parts_status ILIKE '%not return%' THEN 1
      ELSE 0
    END DESC
  LIMIT 1;

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
