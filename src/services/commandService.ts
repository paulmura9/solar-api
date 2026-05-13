import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import { insertEvent } from './eventService';
import { env } from '../config/env';
import type { DeviceCommandDTO, CommandType, CommandStatus } from '../types/command';

function rowToDTO(row: Record<string, unknown>): DeviceCommandDTO {
  return {
    id: row['id'] as string,
    commandType: row['command_type'] as CommandType,
    payload: (row['payload'] as Record<string, unknown>) ?? {},
    status: row['status'] as CommandStatus,
    errorMessage: (row['error_message'] as string | null) ?? null,
    createdAt: row['created_at'] as string,
    sentAt: (row['sent_at'] as string | null) ?? null,
    acknowledgedAt: (row['acknowledged_at'] as string | null) ?? null,
  };
}

/**
 * Inserts a command with status PENDING into device_commands.
 * The Pi gateway picks it up via Supabase Realtime, publishes
 * the command to ESP32 via local MQTT, and updates the status
 * to SENT then ACKNOWLEDGED asynchronously.
 */
export async function createCommand(
  commandType: CommandType,
  payload: Record<string, unknown>
): Promise<DeviceCommandDTO> {
  const { data: inserted, error: insertError } = await supabase
    .from('device_commands')
    .insert({ command_type: commandType, payload, status: 'PENDING' })
    .select()
    .single();

  if (insertError || !inserted) {
    throw new Error(`Failed to insert command: ${insertError?.message ?? 'no data returned'}`);
  }

  return rowToDTO(inserted as Record<string, unknown>);
}

export async function getRecentCommands(limit: number, statusFilter?: string): Promise<DeviceCommandDTO[]> {
  let query = supabase
    .from('device_commands')
    .select('id, command_type, payload, status, error_message, created_at, sent_at, acknowledged_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (statusFilter) {
    const statuses = statusFilter.split(',').map((s) => s.trim());
    query = query.in('status', statuses);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('commandService', 'Failed to fetch recent commands', error);
    return [];
  }

  return (data ?? []).map((row) => rowToDTO(row as Record<string, unknown>));
}

export async function timeoutStaleCommands(): Promise<void> {
  const timeoutMs = env.COMMAND_TIMEOUT_SECONDS * 1000;
  const cutoff = new Date(Date.now() - timeoutMs).toISOString();

  const { data, error } = await supabase
    .from('device_commands')
    .select('id, command_type, sent_at')
    .eq('status', 'SENT')
    .lt('sent_at', cutoff);

  if (error) {
    logger.error('commandService', 'Failed to query stale commands', error);
    return;
  }

  for (const row of data ?? []) {
    const commandId = row.id as string;
    const commandType = row.command_type as string;

    const { error: updateError } = await supabase
      .from('device_commands')
      .update({ status: 'FAILED', error_message: 'Command acknowledgment timeout' })
      .eq('id', commandId);

    if (updateError) {
      logger.error('commandService', `Failed to timeout command ${commandId}`, updateError);
      continue;
    }

    logger.warn('commandService', `Command ${commandId} (${commandType}) timed out after ${env.COMMAND_TIMEOUT_SECONDS}s`);

    await insertEvent({
      event_type: 'COMMAND_TIMEOUT',
      severity: 'WARNING',
      message: `Command ${commandId} (${commandType}) timed out after ${env.COMMAND_TIMEOUT_SECONDS}s`,
    });
  }

  const pendingCutoffMs = env.COMMAND_TIMEOUT_SECONDS * 5 * 1000;
  const pendingCutoff = new Date(Date.now() - pendingCutoffMs).toISOString();

  const { error: pendingError } = await supabase
    .from('device_commands')
    .update({
      status: 'FAILED',
      error_message: 'Command never picked up by gateway (Pi offline or disconnected)',
    })
    .eq('status', 'PENDING')
    .lt('created_at', pendingCutoff);

  if (pendingError) {
    logger.error('commandService', 'Failed to timeout PENDING commands', { error: pendingError.message });
  }
}
