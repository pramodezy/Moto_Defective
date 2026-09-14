import { UserProfile } from '../types/crm';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

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

/**
 * Authenticate against Supabase PostgreSQL RPC function `verify_user_login`.
 * Passwords are encrypted with bcrypt inside Supabase; no passwords are stored in code or HTML.
 */
export async function authenticateUser(creds: LoginCredentials): Promise<AuthResult> {
  const username = creds.username.trim();
  const password = creds.password.trim();

  if (!username || !password) {
    return { success: false, error: 'Please enter username and password.' };
  }

  // 1. Authenticate via Supabase RPC if configured
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.rpc('verify_user_login', {
        p_username: username,
        p_password: password,
      });

      if (error) {
        // If RPC function hasn't been created yet, return helpful instructions
        if (error.message.includes('function') || error.code === 'PGRST202') {
          return {
            success: false,
            error: 'Authentication RPC function not yet initialized. Please run 20260914_profiles_and_auth.sql in Supabase SQL Editor.',
          };
        }
        return { success: false, error: error.message };
      }

      if (data && data.success && data.user) {
        const user: UserProfile = {
          id: data.user.id,
          username: data.user.username,
          full_name: data.user.full_name,
          role: data.user.role,
          station_code: data.user.station_code || undefined,
          created_at: new Date().toISOString(),
        };
        saveSession(user);
        return { success: true, user };
      } else {
        return {
          success: false,
          error: data?.error || 'Invalid username or password.',
        };
      }
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Supabase authentication failed. Please check connection.',
      };
    }
  }

  return {
    success: false,
    error: 'Supabase is not configured. Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.',
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
