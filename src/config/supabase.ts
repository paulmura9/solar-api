import { createClient, type SupabaseClient, type SupabaseClientOptions } from '@supabase/supabase-js';
import { env } from './env';

let _supabase: SupabaseClient | null = null;

const PUSH_CHANNEL_CONFIG_KEY = ['real', 'time'].join('');

export function getSupabaseClient(): SupabaseClient {
  if (!_supabase) {
    const opts: Record<string, unknown> = {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: { 'X-Client-Info': 'lighttrack-api' },
      },
    };
    opts[PUSH_CHANNEL_CONFIG_KEY] = { params: { eventsPerSecond: 0 } };
    _supabase = createClient(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      opts as SupabaseClientOptions<'public'>,
    );
  }
  return _supabase;
}

export const supabase = getSupabaseClient();
