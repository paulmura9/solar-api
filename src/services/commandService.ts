import { randomUUID } from 'node:crypto';
import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import { insertEvent } from './eventService';
import { env } from '../config/env';
import { dispatchCommandToDevice } from '../ws/commandDispatch';
import { broadcastCommandStatus } from '../ws/broadcaster';
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

// Outbox pattern: persist before dispatch. Audit-before-actuation is a safety
// invariant — the ESP32 must never receive a motor command without a durable
// audit row already committed to device_commands. The INSERT is awaited and
// must succeed before any WebSocket frame is sent; if it fails we throw and the
// hardware is never touched. The acceptable cost is one Supabase round-trip
// (~30-50ms) before the dispatch.
export async function createAndDispatchCommand(
  commandType: CommandType,
  payload: Record<string, unknown>
): Promise<DeviceCommandDTO> {
  const id = randomUUID();
  const createdAt = new Date().toISOString();

  const insertResult = await supabase
    .from('device_commands')
    .insert({ id, command_type: commandType, payload, status: 'PENDING', created_at: createdAt })
    .select(COMMAND_COLUMNS)
    .single();

  if (insertResult.error || !insertResult.data) {
    throw new Error(
      `Failed to insert command: ${insertResult.error?.message ?? 'no data returned'}`
    );
  }

  const dto = rowToDTO(insertResult.data);

  const dispatched = dispatchCommandToDevice(id, commandType, payload, createdAt);
  if (dispatched) {
    const sentAt = new Date().toISOString();
    await markCommandSent(id, sentAt);
    return { ...dto, status: 'SENT', sentAt };
  }

  return dto;
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

export async function timeoutSentCommands(): Promise<void> {
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

  const errorMessage = 'Command acknowledgment timeout';

  for (const row of data ?? []) {
    const commandId = row.id as string;
    const commandType = row.command_type as string;

    const { error: updateError } = await supabase
      .from('device_commands')
      .update({ status: 'FAILED', error_message: errorMessage })
      .eq('id', commandId);

    if (updateError) {
      logger.error('commandService', `Failed to timeout command ${commandId}`, updateError);
      continue;
    }

    logger.warn('commandService', `Command ${commandId} (${commandType}) timed out after ${env.COMMAND_TIMEOUT_SECONDS}s`);

    broadcastCommandStatus({
      id: commandId,
      status: 'FAILED',
      error_message: errorMessage,
      acknowledged_at: null,
    });

    await insertEvent({
      event_type: 'COMMAND_TIMEOUT',
      severity: 'WARNING',
      message: `Command ${commandId} (${commandType}) timed out after ${env.COMMAND_TIMEOUT_SECONDS}s`,
    });
  }
}

export async function timeoutPendingCommands(): Promise<void> {
  const pendingCutoffMs = env.COMMAND_TIMEOUT_SECONDS * 5 * 1000;
  const pendingCutoff = new Date(Date.now() - pendingCutoffMs).toISOString();
  const errorMessage = 'Command never picked up by gateway (Pi offline or disconnected)';

  const { data: timedOutPending, error: pendingError } = await supabase
    .from('device_commands')
    .update({
      status: 'FAILED',
      error_message: errorMessage,
    })
    .eq('status', 'PENDING')
    .lt('created_at', pendingCutoff)
    .select('id');

  if (pendingError) {
    logger.error('commandService', 'Failed to timeout PENDING commands', pendingError);
  } else if (timedOutPending && timedOutPending.length > 0) {
    logger.info('commandService', `Timed out ${timedOutPending.length} PENDING command(s) older than ${env.COMMAND_TIMEOUT_SECONDS * 5}s`);
    for (const row of timedOutPending) {
      broadcastCommandStatus({
        id: row.id as string,
        status: 'FAILED',
        error_message: errorMessage,
        acknowledged_at: null,
      });
    }
  }
}

export async function timeoutStaleCommands(): Promise<void> {
  await timeoutSentCommands();
  await timeoutPendingCommands();
}

export async function markCommandSent(commandId: string, sentAt?: string): Promise<void> {
  const { error } = await supabase
    .from('device_commands')
    .update({ status: 'SENT', sent_at: sentAt ?? new Date().toISOString() })
    .eq('id', commandId)
    .eq('status', 'PENDING');

  if (error) {
    logger.error('commandService', `Failed to mark command ${commandId} SENT`, error);
  }
}

export async function acknowledgeCommand(
  commandId: string,
  status: 'ACKNOWLEDGED' | 'FAILED',
  errorMessage: string | null,
  ackPayload: Record<string, unknown> | null
): Promise<DeviceCommandDTO | null> {
  const update: Record<string, unknown> = {
    status,
    acknowledged_at: new Date().toISOString(),
    error_message: errorMessage,
    ack_payload: ackPayload ?? null,
  };

  const { data, error } = await supabase
    .from('device_commands')
    .update(update)
    .eq('id', commandId)
    .in('status', ['PENDING', 'SENT'])
    .select(COMMAND_COLUMNS)
    .maybeSingle();

  if (error) {
    logger.error('commandService', `Failed to acknowledge command ${commandId}`, error);
    return null;
  }
  if (!data) {

    logger.warn('commandService', `Ack for command ${commandId} ignored (unknown or already terminal)`);
    return null;
  }

  return rowToDTO(data);
}

export async function findCommandsForResync(lastCommandId: string | null): Promise<DeviceCommandDTO[]> {

  let cutoffIso: string | null = null;
  if (lastCommandId !== null) {
    const { data, error } = await supabase
      .from('device_commands')
      .select('created_at')
      .eq('id', lastCommandId)
      .maybeSingle();
    if (error) {
      logger.error('commandService', `Failed to resolve last_command_id ${lastCommandId}`, error);
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
