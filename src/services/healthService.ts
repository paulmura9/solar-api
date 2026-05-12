import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import type { DeepHealthResponse } from '../types/health';

export async function checkSupabaseHealth(): Promise<'ok' | 'error'> {
  try {
    const { error } = await supabase.from('device_status').select('id').limit(1);
    return error ? 'error' : 'ok';
  } catch {
    logger.error('healthService', 'Supabase health check failed');
    return 'error';
  }
}

export async function getDeepHealth(): Promise<DeepHealthResponse> {
  const supabaseStatus = await checkSupabaseHealth();
  const overall = supabaseStatus === 'ok' ? 'ok' : 'degraded';

  return {
    status: overall,
    service: 'lighttrack-api',
    supabase: supabaseStatus,
    timestamp: new Date().toISOString(),
  };
}
