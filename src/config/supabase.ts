import { createClient } from '@supabase/supabase-js';
import { env } from './env';
import { SERVICE_NAME } from '../utils/constants';

export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  global: {
    headers: { 'X-Client-Info': SERVICE_NAME },
  },
});
