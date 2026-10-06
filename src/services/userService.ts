import { UserProfile, UserRole } from '../types/crm';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import bcrypt from 'bcryptjs';

function hashPasswordForSupabase(pwd: string): string {
  let hash = bcrypt.hashSync(pwd, 10);
  if (hash.startsWith('$2b$')) {
    hash = '$2a$' + hash.slice(4);
  }
  return hash;
}

const LOCAL_USERS_STORAGE_KEY = 'moto_crm_user_profiles_v1';

const DEFAULT_LOCAL_PROFILES: UserProfile[] = [
  {
    id: 'user-admin-1',
    username: 'Admin',
    full_name: 'Pramod Kumar (System Admin)',
    role: 'ADMIN',
    is_active: true,
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: 'user-cwh-1',
    username: 'CWH_1',
    full_name: 'CWH Inward & Box Accept Lead',
    role: 'CWH',
    is_active: true,
    created_at: new Date(Date.now() - 25 * 86400000).toISOString(),
  },
  {
    id: 'user-cwh-2',
    username: 'CWH_2',
    full_name: 'CWH Quality Screener & Inspection',
    role: 'CWH',
    is_active: true,
    created_at: new Date(Date.now() - 20 * 86400000).toISOString(),
  },
];

export function getLocalUsers(): UserProfile[] {
  try {
    const raw = localStorage.getItem(LOCAL_USERS_STORAGE_KEY);
    if (!raw) return DEFAULT_LOCAL_PROFILES;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_LOCAL_PROFILES;
  } catch {
    return DEFAULT_LOCAL_PROFILES;
  }
}

export function saveLocalUsers(users: UserProfile[]): void {
  try {
    localStorage.setItem(LOCAL_USERS_STORAGE_KEY, JSON.stringify(users));
  } catch (e) {
    console.warn('Failed to save local users to localStorage:', e);
  }
}

export async function fetchAllUsers(): Promise<UserProfile[]> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        const mapped: UserProfile[] = data.map((d: any) => ({
          id: d.id || `user-${d.username}`,
          username: d.username,
          full_name: d.full_name || d.username,
          role: (d.role as UserRole) || 'CCI',
          station_code: d.station_code || undefined,
          is_active: d.is_active !== false,
          last_login: d.last_login || undefined,
          created_at: d.created_at || new Date().toISOString(),
          updated_at: d.updated_at || undefined,
        }));
        saveLocalUsers(mapped);
        return mapped;
      }
    } catch (err) {
      console.warn('Supabase fetch profiles error, using local fallback:', err);
    }
  }

  return getLocalUsers();
}

export async function createNewUser(params: {
  username: string;
  full_name: string;
  role: UserRole;
  station_code?: string;
  password?: string;
}): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
  const username = params.username.trim();
  const fullName = params.full_name.trim();
  const role = params.role;
  const stationCode = params.station_code?.trim() || undefined;
  const password = (params.password || 'Moto@123').trim();

  if (!username) return { success: false, error: 'Username is required.' };
  if (!fullName) return { success: false, error: 'Full Name is required.' };
  if (role === 'CCI' && !stationCode) {
    return { success: false, error: 'Assigned CCI Station is required for CCI role.' };
  }
  if (password.length < 6) {
    return { success: false, error: 'Password must be at least 6 characters.' };
  }

  if (isSupabaseConfigured && supabase) {
    try {
      // 1. Try calling the dedicated RPC admin_create_user
      const { data: rpcData, error: rpcError } = await supabase.rpc('admin_create_user', {
        p_username: username,
        p_full_name: fullName,
        p_role: role,
        p_station_code: stationCode || null,
        p_password: password,
      });

      if (!rpcError && rpcData?.success) {
        const createdUser: UserProfile = {
          id: rpcData.user.id,
          username: rpcData.user.username,
          full_name: rpcData.user.full_name,
          role: rpcData.user.role,
          station_code: rpcData.user.station_code || undefined,
          is_active: true,
          created_at: rpcData.user.created_at || new Date().toISOString(),
        };

        const existing = getLocalUsers().filter((u) => u.username.toLowerCase() !== username.toLowerCase());
        saveLocalUsers([createdUser, ...existing]);
        return { success: true, user: createdUser };
      }

      // 2. Direct insert fallback if RPC isn't loaded
      const hash = hashPasswordForSupabase(password);
      const { data: insertData, error: insertError } = await supabase
        .from('profiles')
        .insert({
          username,
          full_name: fullName,
          role,
          station_code: stationCode || null,
          password_hash: hash,
          is_active: true,
        })
        .select()
        .single();

      if (insertError) {
        return { success: false, error: insertError.message };
      }

      const createdUser: UserProfile = {
        id: insertData.id || `user-${username}`,
        username: insertData.username,
        full_name: insertData.full_name,
        role: insertData.role,
        station_code: insertData.station_code || undefined,
        is_active: true,
        created_at: insertData.created_at || new Date().toISOString(),
      };

      const existing = getLocalUsers().filter((u) => u.username.toLowerCase() !== username.toLowerCase());
      saveLocalUsers([createdUser, ...existing]);
      return { success: true, user: createdUser };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to create user in database.' };
    }
  }

  // Local-only mode
  const localList = getLocalUsers();
  if (localList.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    return { success: false, error: `Username "${username}" already exists.` };
  }

  const newUser: UserProfile = {
    id: `local-user-${Date.now()}`,
    username,
    full_name: fullName,
    role,
    station_code: stationCode,
    is_active: true,
    created_at: new Date().toISOString(),
  };

  saveLocalUsers([newUser, ...localList]);
  return { success: true, user: newUser };
}

export async function resetUserPassword(
  username: string,
  newPassword: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const trimmed = username.trim();
  const pwd = newPassword.trim();

  if (!trimmed) return { success: false, error: 'Username is required.' };
  if (!pwd || pwd.length < 6) return { success: false, error: 'Password must be at least 6 characters.' };

  if (isSupabaseConfigured && supabase) {
    try {
      // 1. Try dedicated RPC function first if migration has been executed
      const { data, error } = await supabase.rpc('admin_reset_user_password', {
        p_username: trimmed,
        p_new_password: pwd,
      });

      if (!error && data?.success !== false) {
        return { success: true, message: data?.message || `Password reset successfully for ${trimmed}!` };
      }

      // If error is NOT a missing RPC function error (PGRST202), return it
      if (error && error.code !== 'PGRST202' && !error.message?.includes('admin_reset_user_password')) {
        return { success: false, error: error.message };
      }

      // 2. Client-side bcrypt fallback: generates standard $2a$ hash for Supabase PostgreSQL crypt()
      const hash = hashPasswordForSupabase(pwd);
      const { data: updateData, error: updateError } = await supabase
        .from('profiles')
        .update({ password_hash: hash })
        .ilike('username', trimmed)
        .select('username');

      if (updateError) {
        return { success: false, error: updateError.message };
      }

      if (!updateData || updateData.length === 0) {
        return { success: false, error: `User "${trimmed}" not found in database profiles.` };
      }

      return { success: true, message: `Password reset successfully for ${trimmed}!` };
    } catch (err: any) {
      // Fallback inside catch as well
      try {
        const hash = hashPasswordForSupabase(pwd);
        const { error: fallbackError } = await supabase
          .from('profiles')
          .update({ password_hash: hash })
          .ilike('username', trimmed);

        if (!fallbackError) {
          return { success: true, message: `Password reset successfully for ${trimmed}!` };
        }
      } catch {}
      return { success: false, error: err.message || 'Failed to communicate with authentication database.' };
    }
  }

  return { success: true, message: `Password reset successfully for ${trimmed} (Local mode)!` };
}

export async function toggleUserStatus(
  username: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  const trimmed = username.trim();

  if (isSupabaseConfigured && supabase) {
    try {
      // Avoid sending updated_at directly to profiles in case column hasn't been added yet
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: isActive })
        .ilike('username', trimmed);

      if (error) {
        return { success: false, error: error.message };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // Update local copy
  const list = getLocalUsers().map((u) => {
    if (u.username.toLowerCase() === trimmed.toLowerCase()) {
      return { ...u, is_active: isActive, updated_at: new Date().toISOString() };
    }
    return u;
  });
  saveLocalUsers(list);

  return { success: true };
}
