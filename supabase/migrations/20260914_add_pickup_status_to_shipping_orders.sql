-- =============================================================
-- MIGRATION: Add Pickup Status & Courier Handover Tracking to shipping_orders
-- =============================================================

ALTER TABLE shipping_orders ADD COLUMN IF NOT EXISTS pickup_status TEXT DEFAULT 'Pickup Pending';
ALTER TABLE shipping_orders ADD COLUMN IF NOT EXISTS pickup_date TIMESTAMPTZ;
ALTER TABLE shipping_orders ADD COLUMN IF NOT EXISTS pickup_remarks TEXT;
