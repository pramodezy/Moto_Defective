import { UserProfile, UserRole } from '../types/crm';
import { crmDb } from '../lib/db';

const AUTH_STORAGE_KEY = 'moto_crm_auth_session_v1';

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface AuthResult {
  success: boolean;
  user?: UserProfile;
  error?: string;
}

export const PRESET_ACCOUNTS = [
  {
    label: 'Admin',
    description: 'Executive Control & Ingestion',
    username: 'Admin',
    password: 'Admin@@123',
    role: 'ADMIN' as UserRole,
  },
  {
    label: 'CWH 1 (Box Accept)',
    description: 'Inward Receiving & Barcode Bay',
    username: 'cwh_1',
    password: 'Moto@@123',
    role: 'CWH' as UserRole,
  },
  {
    label: 'CWH 2 (Screener)',
    description: 'Physical Condition & CCTV Bay',
    username: 'cwh_2',
    password: 'Moto@@123',
    role: 'CWH' as UserRole,
  },
  {
    label: 'CCI Station 65',
    description: 'Service Center Station 65',
    username: 'cci_65',
    password: 'Moto@123',
    role: 'CCI' as UserRole,
    station_code: '068', // maps to active station
  },
];

export function authenticateUser(creds: LoginCredentials): AuthResult {
  const username = creds.username.trim();
  const password = creds.password.trim();

  if (!username || !password) {
    return { success: false, error: 'Please enter username and password.' };
  }

  const uLower = username.toLowerCase();

  // 1. Admin Login: Admin / Admin@@123
  if ((uLower === 'admin' || uLower === 'admin_pramod') && password === 'Admin@@123') {
    const user: UserProfile = {
      id: 'usr-admin-01',
      username: 'Admin',
      full_name: 'Pramod Kumar (System Admin)',
      role: 'ADMIN',
      created_at: new Date().toISOString(),
    };
    saveSession(user);
    return { success: true, user };
  }

  // 2. CWH 1 (Box Accept): cwh_1 / Moto@@123
  if ((uLower === 'cwh_1' || uLower === 'cwh1' || uLower === 'cwh_box') && password === 'Moto@@123') {
    const user: UserProfile = {
      id: 'usr-cwh-01',
      username: 'cwh_1',
      full_name: 'Nilesh Shinde (CWH Box Accept Lead)',
      role: 'CWH',
      created_at: new Date().toISOString(),
    };
    saveSession(user);
    return { success: true, user };
  }

  // 3. CWH 2 (Screener): cwh_2 / Moto@@123
  if ((uLower === 'cwh_2' || uLower === 'cwh2' || uLower === 'cwh_screener') && password === 'Moto@@123') {
    const user: UserProfile = {
      id: 'usr-cwh-02',
      username: 'cwh_2',
      full_name: 'Rajesh Patil (CWH Quality Screener)',
      role: 'CWH',
      created_at: new Date().toISOString(),
    };
    saveSession(user);
    return { success: true, user };
  }

  // 4. CCI Stations: e.g. cci_65, cci_068, cci_071 / Moto@123
  if (password === 'Moto@123') {
    let stationCode = '';

    if (uLower.startsWith('cci_')) {
      stationCode = uLower.replace('cci_', '').trim();
    } else if (/^\d+$/.test(username)) {
      stationCode = username;
    }

    if (stationCode) {
      // Normalize numeric station code (e.g. 65 or 068)
      const stations = crmDb.getStations();
      const matched = stations.find(
        (s) => s.station_code === stationCode || 
               s.station_code === stationCode.padStart(3, '0') || 
               parseInt(s.station_code, 10) === parseInt(stationCode, 10)
      );

      const activeCode = matched ? matched.station_code : (stationCode.padStart(3, '0'));
      const activeName = matched ? matched.station_name : `Motorola Service Station ${activeCode}`;

      const user: UserProfile = {
        id: `usr-cci-${activeCode}`,
        username: `cci_${activeCode}`,
        full_name: activeName,
        role: 'CCI',
        station_code: activeCode,
        created_at: new Date().toISOString(),
      };
      saveSession(user);
      return { success: true, user };
    }
  }

  return {
    success: false,
    error: 'Invalid credentials. Please verify username and password format.',
  };
}

export function getSavedSession(): UserProfile | null {
  try {
    const data = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!data) return null;
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function saveSession(user: UserProfile) {
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  } catch (e) {
    console.warn('Failed to save session to localStorage', e);
  }
}

export function clearSession() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}
