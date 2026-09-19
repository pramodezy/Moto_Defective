-- =========================================================================
-- MIGRATION: ADD OUTBOUND AWB AND SO GRN TIME COLUMNS (LEG 2 CWH -> RC)
-- =========================================================================

-- 1. Add fields to shipping_orders
ALTER TABLE IF EXISTS shipping_orders 
  ADD COLUMN IF NOT EXISTS asp_outbound_awb TEXT,
  ADD COLUMN IF NOT EXISTS so_grn_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS so_grn_month TEXT;

-- 2. Add fields to defective_master
ALTER TABLE IF EXISTS defective_master 
  ADD COLUMN IF NOT EXISTS asp_outbound_awb TEXT,
  ADD COLUMN IF NOT EXISTS so_grn_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS so_grn_month TEXT;

-- 3. Indexes for Outbound AWB
CREATE INDEX IF NOT EXISTS idx_shipping_orders_asp_outbound_awb 
  ON shipping_orders(asp_outbound_awb);

CREATE INDEX IF NOT EXISTS idx_defective_master_asp_outbound_awb 
  ON defective_master(asp_outbound_awb);
