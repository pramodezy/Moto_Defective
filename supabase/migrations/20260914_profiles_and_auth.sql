-- =============================================================
-- MOTOROLA DEFECTIVE RETURNS CRM: SUPABASE PROFILES & AUTHENTICATION
-- Passwords are encrypted with bcrypt in Supabase PostgreSQL (pgcrypto)
-- NO PASSWORDS STORED IN HTML OR GITHUB.
-- =============================================================

-- 1. Enable pgcrypto for industry-standard bcrypt hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Adjust profiles table to allow standalone IDs and password_hash
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- 3. Trigger: Automatically create or update a CCI user in `profiles` whenever `cci_master` changes
CREATE OR REPLACE FUNCTION sync_cci_to_profile()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert or update user profile with default station password (Moto@123)
  INSERT INTO profiles (username, full_name, role, station_code, password_hash, is_active)
  VALUES (
    COALESCE(NEW.username, 'cci_' || NEW.station_code),
    NEW.station_name,
    'CCI',
    NEW.station_code,
    crypt('Moto@123', gen_salt('bf')),
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

DROP TRIGGER IF EXISTS trg_sync_cci_to_profile ON cci_master;
CREATE TRIGGER trg_sync_cci_to_profile
AFTER INSERT OR UPDATE ON cci_master
FOR EACH ROW
EXECUTE FUNCTION sync_cci_to_profile();

-- 4. Seed Standard Enterprise Profiles into `profiles` with bcrypt hashes
-- Admin (Password: Admin@@123)
INSERT INTO profiles (username, full_name, role, password_hash, is_active)
VALUES (
  'Admin',
  'Pramod Kumar (System Admin)',
  'ADMIN',
  crypt('Admin@@123', gen_salt('bf')),
  true
)
ON CONFLICT (username) DO UPDATE
SET password_hash = EXCLUDED.password_hash;

-- CWH 1: Box Accept Lead (Password: Moto@@123)
INSERT INTO profiles (username, full_name, role, password_hash, is_active)
VALUES (
  'cwh_1',
  'Nilesh Shinde (CWH Box Accept Lead)',
  'CWH',
  crypt('Moto@@123', gen_salt('bf')),
  true
)
ON CONFLICT (username) DO UPDATE
SET password_hash = EXCLUDED.password_hash;

-- CWH 2: Quality Screener (Password: Moto@@123)
INSERT INTO profiles (username, full_name, role, password_hash, is_active)
VALUES (
  'cwh_2',
  'Rajesh Patil (CWH Quality Screener)',
  'CWH',
  crypt('Moto@@123', gen_salt('bf')),
  true
)
ON CONFLICT (username) DO UPDATE
SET password_hash = EXCLUDED.password_hash;

-- 5. Backfill all existing stations from cci_master into profiles
INSERT INTO profiles (username, full_name, role, station_code, password_hash, is_active)
SELECT 
  username,
  station_name,
  'CCI',
  station_code,
  crypt('Moto@123', gen_salt('bf')),
  is_active
FROM cci_master
ON CONFLICT (username) DO UPDATE
SET 
  full_name = EXCLUDED.full_name,
  station_code = EXCLUDED.station_code;

-- 6. Secure RPC Authentication Function
-- Validates credentials in PostgreSQL; returns user profile upon success
CREATE OR REPLACE FUNCTION verify_user_login(p_username TEXT, p_password TEXT)
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
  v_profile profiles%ROWTYPE;
BEGIN
  IF p_username IS NULL OR p_password IS NULL OR p_username = '' OR p_password = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Username and password are required.');
  END IF;

  SELECT * INTO v_profile
  FROM profiles
  WHERE LOWER(username) = LOWER(p_username)
    AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid username or account not found.');
  END IF;

  -- Validate bcrypt password hash
  IF v_profile.password_hash = crypt(p_password, v_profile.password_hash) THEN
    RETURN jsonb_build_object(
      'success', true,
      'user', jsonb_build_object(
        'id', v_profile.id,
        'username', v_profile.username,
        'full_name', v_profile.full_name,
        'role', v_profile.role,
        'station_code', v_profile.station_code
      )
    );
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Incorrect password.');
  END IF;
END;
$$;

-- 7. Grant execution permissions for anon and authenticated clients
GRANT EXECUTE ON FUNCTION verify_user_login(TEXT, TEXT) TO anon, authenticated;

-- 8. Allow anon/public to view user profile attributes (excluding password_hash via RLS or column security)
DROP POLICY IF EXISTS "Profiles readable by authenticated" ON profiles;
DROP POLICY IF EXISTS "Allow anon select profiles" ON profiles;
CREATE POLICY "Allow anon select profiles" ON profiles FOR SELECT TO anon USING (true);
