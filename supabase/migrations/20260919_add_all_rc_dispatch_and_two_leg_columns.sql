-- =========================================================================
-- COMPLETE MIGRATION: ADD ALL TWO-LEG (CWH -> RC) DISPATCH COLUMNS
-- Run this script in the Supabase SQL Editor (Project: rippjixfknqwptbcruux)
-- =========================================================================

-- 1. ADD LEG 2 COLUMNS TO shipping_orders
ALTER TABLE IF EXISTS public.shipping_orders 
  ADD COLUMN IF NOT EXISTS asp_rc_shipping_order_code TEXT,
  ADD COLUMN IF NOT EXISTS asp_rc_ship_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS asp_outbound_awb TEXT,
  ADD COLUMN IF NOT EXISTS asp_rc_pickup_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS asp_rc_delivered_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS so_grn_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS so_grn_month TEXT,
  ADD COLUMN IF NOT EXISTS rc_receive_remark TEXT;

-- 2. ADD LEG 2 COLUMNS TO defective_master
ALTER TABLE IF EXISTS public.defective_master 
  ADD COLUMN IF NOT EXISTS asp_rc_shipping_order_code TEXT,
  ADD COLUMN IF NOT EXISTS asp_rc_ship_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS asp_outbound_awb TEXT,
  ADD COLUMN IF NOT EXISTS asp_rc_pickup_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS asp_rc_delivered_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS so_grn_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS so_grn_month TEXT,
  ADD COLUMN IF NOT EXISTS rc_receive_remark TEXT;

-- 3. CREATE PERFORMANCE INDEXES FOR FAST LOOKUP
CREATE INDEX IF NOT EXISTS idx_shipping_orders_asp_rc_so 
  ON public.shipping_orders(asp_rc_shipping_order_code);

CREATE INDEX IF NOT EXISTS idx_shipping_orders_asp_outbound_awb 
  ON public.shipping_orders(asp_outbound_awb);

CREATE INDEX IF NOT EXISTS idx_defective_master_asp_rc_so 
  ON public.defective_master(asp_rc_shipping_order_code);

CREATE INDEX IF NOT EXISTS idx_defective_master_asp_outbound_awb 
  ON public.defective_master(asp_outbound_awb);
