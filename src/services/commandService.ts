import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import { insertEvent } from './eventService';
import { env } from '../config/env';
import type { DeviceCommandDTO, CommandType, CommandStatus } from '../types/command';

const COMMAND_COLUMNS = 'id, command_type, payload, status, error_message, created_at, sent_at, acknowledged_at';

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

  const { data: timedOutPending, error: pendingError } = await supabase
    .from('device_commands')
    .update({
      status: 'FAILED',
      error_message: 'Command never picked up by gateway (Pi offline or disconnected)',
    })
    .eq('status', 'PENDING')
    .lt('created_at', pendingCutoff)
    .select('id');

  if (pendingError) {
    logger.error('commandService', 'Failed to timeout PENDING commands', { error: pendingError.message });
  } else if (timedOutPending && timedOutPending.length > 0) {
    logger.info('commandService', `Timed out ${timedOutPending.length} PENDING command(s) older than ${env.COMMAND_TIMEOUT_SECONDS * 5}s`);
  }
}

// ===== v2 (WebSocket-direct delivery) helpers =====
//
// These supplement the existing Realtime-era flow: they let the WS device
// handler mark commands SENT after pushing to the Pi, ACKNOWLEDGED/FAILED on
// receiving a command_ack envelope, and re-deliver pending commands on Pi
// reconnect. The existing functions above remain intact for backwards
// compatibility during the phased migration.

export async function markCommandSent(commandId: string): Promise<void> {
  const { error } = await supabase
    .from('device_commands')
    .update({ status: 'SENT', sent_at: new Date().toISOString() })
    .eq('id', commandId)
    // Don't overwrite a terminal state (ACKNOWLEDGED/FAILED) if an ack raced
    // ahead of our SENT update. PENDING is the only valid starting state.
    .eq('status', 'PENDING');

  if (error) {
    logger.error('commandService', `Failed to mark command ${commandId} SENT`, error);
  }
}

export async function acknowledgeCommand(
  commandId: string,
  status: 'ACKNOWLEDGED' | 'FAILED',
  errorMessage: string | null
): Promise<DeviceCommandDTO | null> {
  const update: Record<string, unknown> = {
    status,
    acknowledged_at: new Date().toISOString(),
    error_message: errorMessage,
  };

  const { data, error } = await supabase
    .from('device_commands')
    .update(update)
    .eq('id', commandId)
    // Only accept ack while still in flight. Refusing to ack a FAILED row
    // (e.g. timed out by the cron job) prevents resurrecting it.
    .in('status', ['PENDING', 'SENT'])
    .select(COMMAND_COLUMNS)
    .maybeSingle();

  if (error) {
    logger.error('commandService', `Failed to acknowledge command ${commandId}`, error);
    return null;
  }
  if (!data) {
    // Either unknown id or already terminal — both are non-fatal.
    logger.warn('commandService', `Ack for command ${commandId} ignored (unknown or already terminal)`);
    return null;
  }

  return rowToDTO(data as Record<string, unknown>);
}

// Sync support: when the Pi reconnects, it sends sync_request with its last
// known command id (or null for "I know nothing"). We resend everything in
// PENDING/SENT created after that point so the Pi can catch up.
export async function findCommandsForResync(lastCommandId: string | null): Promise<DeviceCommandDTO[]> {
  // Resolve last_command_id -> created_at so we can ask the DB for anything newer.
  let cutoffIso: string | null = null;
  if (lastCommandId !== null) {
    const { data, error } = await supabase
      .from('device_commands')
      .select('created_at')
      .eq('id', lastCommandId)
      .maybeSingle();
    if (error) {
      logger.error('commandService', `Failed to resolve last_command_id ${lastCommandId}`, error);
      // Fall through with null cutoff — re-send everything in flight.
    } else if (data) {
      cutoffIso = data.created_at as string;
    }
  }

  let query = supabase
    .from('device_commands')
    .select(COMMAND_COLUMNS)
    .in('status', ['PENDING', 'SENT'])
    .order('created_at', { ascending: true });

  if (cutoffIso !== null) {
    query = query.gt('created_at', cutoffIso);
  }

  const { data, error } = await query;
  if (error) {
    logger.error('commandService', 'Failed to fetch commands for resync', error);
    return [];
  }
  return (data ?? []).map((row) => rowToDTO(row as Record<string, unknown>));
}
