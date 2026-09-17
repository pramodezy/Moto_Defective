-- =========================================================================
-- MIGRATION: ADD TWO-LEG TRACKING COLUMNS (LEG 1: CCI->CWH, LEG 2: CWH->RC)
-- =========================================================================

-- 1. ADD LEG 2 FIELDS TO defective_master
ALTER TABLE IF EXISTS defective_master 
  ADD COLUMN IF NOT EXISTS asp_rc_shipping_order_code TEXT,
  ADD COLUMN IF NOT EXISTS asp_rc_ship_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS asp_rc_pickup_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS asp_rc_delivered_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rc_receive_remark TEXT;

-- 2. ADD LEG 2 FIELDS TO shipping_orders
ALTER TABLE IF EXISTS shipping_orders
  ADD COLUMN IF NOT EXISTS asp_rc_shipping_order_code TEXT,
  ADD COLUMN IF NOT EXISTS asp_rc_ship_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS asp_rc_pickup_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS asp_rc_delivered_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rc_receive_remark TEXT;

-- 3. INDEXES FOR RAPID SECOND-LEG LOOKUP
CREATE INDEX IF NOT EXISTS idx_defective_master_asp_rc_so 
  ON defective_master(asp_rc_shipping_order_code);

CREATE INDEX IF NOT EXISTS idx_shipping_orders_asp_rc_so 
  ON shipping_orders(asp_rc_shipping_order_code);
