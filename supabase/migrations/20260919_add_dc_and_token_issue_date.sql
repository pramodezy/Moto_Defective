-- Migration: Add DC Code and Token Issue Date to shipping_orders and defective_master
-- Date: 2026-09-19

ALTER TABLE shipping_orders
ADD COLUMN IF NOT EXISTS delivery_challan_code TEXT,
ADD COLUMN IF NOT EXISTS token_issue_date TIMESTAMPTZ;

ALTER TABLE defective_master
ADD COLUMN IF NOT EXISTS delivery_challan_code TEXT;

-- Create indexes for performance on lookups and joins
CREATE INDEX IF NOT EXISTS idx_shipping_orders_dc ON shipping_orders (delivery_challan_code);
CREATE INDEX IF NOT EXISTS idx_shipping_orders_token_issue_date ON shipping_orders (token_issue_date);
CREATE INDEX IF NOT EXISTS idx_defective_master_dc ON defective_master (delivery_challan_code);
