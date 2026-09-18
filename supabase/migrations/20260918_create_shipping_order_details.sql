-- Migration: Create shipping_order_details table in Supabase Cloud
-- Date: 2026-09-18

CREATE TABLE IF NOT EXISTS public.shipping_order_details (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shipping_order_code TEXT NOT NULL,
    delivery_challan_code TEXT,
    item_code TEXT NOT NULL,
    old_pn TEXT,
    order_pn TEXT,
    description TEXT,
    unit_price NUMERIC(12, 2) DEFAULT 0,
    deliver_qty INT DEFAULT 1,
    received_qty INT DEFAULT 0,
    value NUMERIC(12, 2) DEFAULT 0,
    way_bill_no TEXT,
    carrier TEXT,
    mode_of_transport TEXT,
    date_issued TIMESTAMP WITH TIME ZONE,
    shipping_order_status TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- High-performance indexes for fast lookups by SO Code, Part Number, and DC
CREATE INDEX IF NOT EXISTS idx_sod_so_code ON public.shipping_order_details (shipping_order_code);
CREATE INDEX IF NOT EXISTS idx_sod_so_item ON public.shipping_order_details (shipping_order_code, item_code);
CREATE INDEX IF NOT EXISTS idx_sod_dc_code ON public.shipping_order_details (delivery_challan_code);

-- Enable Row Level Security (RLS) & allow anonymous read/write access matching CRM API key
ALTER TABLE public.shipping_order_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read-write for shipping_order_details" ON public.shipping_order_details;

CREATE POLICY "Allow public read-write for shipping_order_details"
ON public.shipping_order_details FOR ALL
USING (true)
WITH CHECK (true);
