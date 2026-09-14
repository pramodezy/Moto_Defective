-- =============================================================
-- MOTOROLA DEFECTIVE RETURNS CRM: ANON ACCESS POLICIES
-- Run this in Supabase SQL Editor to allow the web frontend (using anon key)
-- to read, insert, and update tables directly.
-- =============================================================

-- 1. CCI Master (Stations)
DROP POLICY IF EXISTS "Allow anon all cci_master" ON cci_master;
CREATE POLICY "Allow anon all cci_master" 
ON cci_master FOR ALL TO anon 
USING (true) WITH CHECK (true);

-- 2. Shipping Orders
DROP POLICY IF EXISTS "Allow anon all shipping_orders" ON shipping_orders;
CREATE POLICY "Allow anon all shipping_orders" 
ON shipping_orders FOR ALL TO anon 
USING (true) WITH CHECK (true);

-- 3. Defective Master (Items)
DROP POLICY IF EXISTS "Allow anon all defective_master" ON defective_master;
CREATE POLICY "Allow anon all defective_master" 
ON defective_master FOR ALL TO anon 
USING (true) WITH CHECK (true);

-- 4. AWB History
DROP POLICY IF EXISTS "Allow anon all awb_history" ON awb_history;
CREATE POLICY "Allow anon all awb_history" 
ON awb_history FOR ALL TO anon 
USING (true) WITH CHECK (true);

-- 5. Audit Logs
DROP POLICY IF EXISTS "Allow anon all audit_logs" ON audit_logs;
CREATE POLICY "Allow anon all audit_logs" 
ON audit_logs FOR ALL TO anon 
USING (true) WITH CHECK (true);

-- Alternatively, you can disable RLS completely for testing:
-- ALTER TABLE cci_master DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE shipping_orders DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE defective_master DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE awb_history DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;
