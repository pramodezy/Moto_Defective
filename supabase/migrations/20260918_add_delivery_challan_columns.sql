-- Migration: Add Delivery Challan, Deliver Qty, and Value to defective_master and shipping_orders
-- Date: 2026-09-18

ALTER TABLE defective_master
ADD COLUMN IF NOT EXISTS delivery_challan_code TEXT,
ADD COLUMN IF NOT EXISTS deliver_qty INT,
ADD COLUMN IF NOT EXISTS value NUMERIC(10, 2);

ALTER TABLE shipping_orders
ADD COLUMN IF NOT EXISTS delivery_challan_code TEXT;

-- Create indexes for fast lookup and join by shipping_order_code and composite part key
CREATE INDEX IF NOT EXISTS idx_defective_master_so_code ON defective_master (shipping_order_code);
CREATE INDEX IF NOT EXISTS idx_defective_master_dc_code ON defective_master (delivery_challan_code);
