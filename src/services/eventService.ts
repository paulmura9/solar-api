import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import type { InsertEventInput, SystemEventDTO, Severity } from '../types/event';

export async function insertEvent(input: InsertEventInput): Promise<void> {
  const { error } = await supabase.from('system_events').insert({
    event_type: input.event_type,
    severity: input.severity,
    message: input.message,
    // NULL == system-level event (no owning device). The column is nullable
    // with no default, so an omitted/undefined device_id persists as NULL.
    device_id: input.device_id ?? null,
  });

  if (error) {
    logger.error('eventService', `Failed to insert event ${input.event_type}`, error);
  }
}

export async function getRecentEvents(limit: number, severityFilter?: string): Promise<SystemEventDTO[]> {
  let query = supabase
    .from('system_events')
    .select('id, timestamp, event_type, severity, message, created_at')
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (severityFilter) {
    const severities = severityFilter.split(',').map((s) => s.trim()) as Severity[];
    query = query.in('severity', severities);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('eventService', 'Failed to fetch recent events', error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id as number,
    timestamp: row.timestamp as string,
    eventType: row.event_type as string,
    severity: row.severity as Severity,
    message: row.message as string,
    createdAt: row.created_at as string,
  }));
}
