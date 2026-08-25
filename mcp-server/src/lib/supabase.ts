import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../env.js';

let _client: SupabaseClient | undefined;

/**
 * Service-role client. Bypasses RLS — this key never leaves this process.
 * Only this file touches it; every tool goes through the functions below,
 * never through env.SUPABASE_SERVICE_ROLE_KEY directly.
 */
export function supabaseAdmin(): SupabaseClient {
  if (!_client) {
    _client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _client;
}
