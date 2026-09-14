-- =============================================================
-- CWH USER ACCOUNTS UPDATE MIGRATION
-- Sets CWH_1 and CWH_2 credentials with password: Moto123#
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Remove old lowercase entries if present
DELETE FROM profiles WHERE username IN ('cwh_1', 'cwh_2');

-- Upsert CWH_1 and CWH_2
INSERT INTO profiles (username, full_name, role, password_hash, is_active)
VALUES 
  (
    'CWH_1',
    'CWH Inward & Box Accept Lead',
    'CWH',
    crypt('Moto123#', gen_salt('bf')),
    true
  ),
  (
    'CWH_2',
    'CWH Quality Screener & Inspection',
    'CWH',
    crypt('Moto123#', gen_salt('bf')),
    true
  )
ON CONFLICT (username) DO UPDATE
SET 
  password_hash = EXCLUDED.password_hash,
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  is_active = true;
