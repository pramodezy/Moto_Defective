-- =============================================================
-- MOTOROLA DEFECTIVE RETURNS CRM: USER & CCI MANAGEMENT
-- Migration: 20261007_user_and_cci_management.sql
-- Provides admin functions, cascading triggers, and fixes trigger pgcrypto resolution
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- 1. Ensure columns exist on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;

-- 2. CRITICAL FIX: Update sync_cci_to_profile() with search_path including extensions
-- Resolves error: "function gen_salt(unknown) does not exist" when adding/updating stations
CREATE OR REPLACE FUNCTION sync_cci_to_profile()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- Insert or update user profile with station password placeholder
  INSERT INTO profiles (username, full_name, role, station_code, password_hash, is_active)
  VALUES (
    COALESCE(NEW.username, 'cci_' || NEW.station_code),
    NEW.station_name,
    'CCI',
    NEW.station_code,
    crypt('SetStationPassword#', gen_salt('bf')),
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

-- 3. Trigger: Cascade CCI Active/Inactive status to station user profiles
CREATE OR REPLACE FUNCTION cascade_cci_status_to_profiles()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- When station status changes, cascade to associated station users
  IF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
    UPDATE profiles
    SET is_active = NEW.is_active,
        updated_at = NOW()
    WHERE station_code = NEW.station_code
      AND role = 'CCI';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cascade_cci_status ON cci_master;
CREATE TRIGGER trg_cascade_cci_status
AFTER UPDATE OF is_active ON cci_master
FOR EACH ROW
EXECUTE FUNCTION cascade_cci_status_to_profiles();

-- 4. Secure Admin Reset Password Function
CREATE OR REPLACE FUNCTION admin_reset_user_password(p_username TEXT, p_new_password TEXT)
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  IF p_username IS NULL OR TRIM(p_username) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Username is required.');
  END IF;

  IF p_new_password IS NULL OR length(TRIM(p_new_password)) < 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Password must be at least 6 characters long.');
  END IF;

  SELECT EXISTS(SELECT 1 FROM profiles WHERE LOWER(username) = LOWER(TRIM(p_username))) INTO v_exists;
  IF NOT v_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found in profiles.');
  END IF;

  UPDATE profiles
  SET password_hash = crypt(TRIM(p_new_password), gen_salt('bf', 10)),
      updated_at = NOW()
  WHERE LOWER(username) = LOWER(TRIM(p_username));

  -- Insert audit log if table exists
  BEGIN
    INSERT INTO audit_logs (action, description, performed_by, entity_type, entity_id)
    VALUES (
      'USER_PASSWORD_RESET',
      'Password reset for user ' || TRIM(p_username),
      'ADMIN',
      'PROFILE',
      TRIM(p_username)
    );
  EXCEPTION WHEN OTHERS THEN
    -- Ignore audit log failure if schema differs
  END;

  RETURN jsonb_build_object('success', true, 'message', 'Password updated successfully for ' || TRIM(p_username));
END;
$$;

-- 5. Admin Create User Function
CREATE OR REPLACE FUNCTION admin_create_user(
  p_username TEXT,
  p_full_name TEXT,
  p_role TEXT,
  p_station_code TEXT,
  p_password TEXT
)
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  v_new_id UUID := gen_random_uuid();
  v_user JSONB;
BEGIN
  IF p_username IS NULL OR TRIM(p_username) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Username is required.');
  END IF;

  IF p_full_name IS NULL OR TRIM(p_full_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Full Name is required.');
  END IF;

  IF p_role NOT IN ('ADMIN', 'CWH', 'CCI') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid role. Must be ADMIN, CWH, or CCI.');
  END IF;

  IF p_role = 'CCI' AND (p_station_code IS NULL OR TRIM(p_station_code) = '') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Station code is required for CCI role.');
  END IF;

  IF p_password IS NULL OR length(TRIM(p_password)) < 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Password must be at least 6 characters long.');
  END IF;

  -- Check if username already exists
  IF EXISTS(SELECT 1 FROM profiles WHERE LOWER(username) = LOWER(TRIM(p_username))) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Username "' || TRIM(p_username) || '" already exists.');
  END IF;

  INSERT INTO profiles (id, username, full_name, role, station_code, password_hash, is_active, created_at, updated_at)
  VALUES (
    v_new_id,
    TRIM(p_username),
    TRIM(p_full_name),
    p_role,
    NULLIF(TRIM(p_station_code), ''),
    crypt(TRIM(p_password), gen_salt('bf', 10)),
    true,
    NOW(),
    NOW()
  );

  SELECT jsonb_build_object(
    'id', id,
    'username', username,
    'full_name', full_name,
    'role', role,
    'station_code', station_code,
    'is_active', is_active,
    'created_at', created_at
  ) INTO v_user
  FROM profiles
  WHERE id = v_new_id;

  RETURN jsonb_build_object('success', true, 'user', v_user);
END;
$$;

-- 6. Admin Toggle User Status Function
CREATE OR REPLACE FUNCTION admin_toggle_user_status(p_username TEXT, p_is_active BOOLEAN)
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
  UPDATE profiles
  SET is_active = p_is_active,
      updated_at = NOW()
  WHERE LOWER(username) = LOWER(TRIM(p_username));

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found.');
  END IF;

  RETURN jsonb_build_object('success', true, 'is_active', p_is_active);
END;
$$;

-- 7. Grant execute permissions
GRANT EXECUTE ON FUNCTION sync_cci_to_profile() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin_reset_user_password(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin_create_user(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin_toggle_user_status(TEXT, BOOLEAN) TO anon, authenticated, service_role;
