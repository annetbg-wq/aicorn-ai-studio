/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

// Primary: env vars (build time)
// Fallback: localStorage (persisted from Settings UI)
// Last resort: hardcoded dev values

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  localStorage.getItem('SUPABASE_URL') ||
  'https://zdzuaodphrlpvorutpyc.supabase.co';

const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  localStorage.getItem('SUPABASE_ANON_KEY') ||
  '';

// Persist to localStorage so it survives .env changes
if (SUPABASE_URL && !SUPABASE_URL.includes('placeholder')) {
  try {
    localStorage.setItem('SUPABASE_URL', SUPABASE_URL);
    localStorage.setItem('SUPABASE_ANON_KEY', SUPABASE_ANON_KEY);
  } catch { /* quota / blocked */ }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    flowType:           'pkce',
    autoRefreshToken:   true,
    persistSession:     true,
    detectSessionInUrl: true,
    storage:            localStorage,
  },
});

console.log('[Supabase] Connected to:', SUPABASE_URL);

// Типы для удобства
export type SupabaseUser = {
  id:          string;
  email?:      string;
  name?:       string;
  avatar_url?: string;
  provider?:   string;
};

export function getUserFromSession(session: any): SupabaseUser | null {
  const user = session?.user;
  if (!user) return null;
  return {
    id:         user.id,
    email:      user.email,
    name:       user.user_metadata?.full_name ?? user.email,
    avatar_url: user.user_metadata?.avatar_url,
    provider:   user.app_metadata?.provider,
  };
}
