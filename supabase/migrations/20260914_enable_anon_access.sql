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

-- 6. User Profiles (Fixes: "new row violates row-level security policy for table profiles")
DROP POLICY IF EXISTS "Allow anon all profiles" ON profiles;
DROP POLICY IF EXISTS "Allow anon select profiles" ON profiles;
DROP POLICY IF EXISTS "Profiles readable by authenticated" ON profiles;
CREATE POLICY "Allow anon all profiles" 
ON profiles FOR ALL TO anon 
USING (true) WITH CHECK (true);

-- 7. Fix Trigger: Make sync_cci_to_profile() SECURITY DEFINER
-- This ensures automatic profile generation from cci_master runs with system privileges
CREATE OR REPLACE FUNCTION sync_cci_to_profile()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (username, full_name, role, station_code, password_hash, is_active)
  VALUES (
    COALESCE(NEW.username, 'cci_' || NEW.station_code),
    NEW.station_name,
    'CCI',
    NEW.station_code,
    crypt(COALESCE(NULLIF(current_setting('app.default_user_pwd', true), ''), 'SetStationPassword#'), gen_salt('bf')),
    COALESCE(NEW.is_active, true)
  )
  ON CONFLICT (username) DO UPDATE
  SET 
    full_name = EXCLUDED.full_name,
    station_code = EXCLUDED.station_code,
    is_active = EXCLUDED.is_active;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Ensure trigger is active
DROP TRIGGER IF EXISTS trg_sync_cci_to_profile ON cci_master;
CREATE TRIGGER trg_sync_cci_to_profile
AFTER INSERT OR UPDATE ON cci_master
FOR EACH ROW
EXECUTE FUNCTION sync_cci_to_profile();

-- Optional: To completely disable RLS across all tables during development:
-- ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE cci_master DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE shipping_orders DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE defective_master DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE awb_history DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;

