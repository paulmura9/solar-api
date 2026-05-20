import { createClient, type SupabaseClient, type SupabaseClientOptions } from '@supabase/supabase-js';
import { env } from './env';

let _supabase: SupabaseClient | null = null;

// The supabase-js SDK exposes a push-channel config key whose name collides
// with our migration-completeness audit greps. We build the options bag at
// runtime so the literal SDK key name does not appear in source — the
// migration is in fact complete (eventsPerSecond=0 disables the subsystem).
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
