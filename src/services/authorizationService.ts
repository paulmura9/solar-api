import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';

/**
 * Authorization gate for user-initiated device commands: a user may command a
 * device iff a public.user_devices row links them (service-role client; the
 * table has RLS enabled with no policies). FAIL-CLOSED: on ANY query error the
 * answer is false — a DB outage must deny commands, never bypass the gate.
 * Deliberately not the fail-soft pattern used by emailService, which is for
 * alerts, not authorization.
 */
export async function isUserLinkedToDevice(userId: string, deviceId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_devices')
    .select('user_id')
    .eq('user_id', userId)
    .eq('device_id', deviceId)
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error('authorizationService', `Failed to check device link for user ${userId}`, error);
    return false;
  }

  return data !== null;
}
