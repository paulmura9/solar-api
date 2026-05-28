import { COMMAND_TYPES } from './constants';

type CommandFailureReason =
  | 'dispatch_failed'
  | 'timeout_pending'
  | 'timeout_sent'
  | 'validation_error';

interface CommandMetricsSnapshot {
  commands_dispatched_total: Record<string, number>;
  commands_failed_total: Record<CommandFailureReason, number>;
  commands_acknowledged_total: number;
  pi_reconnects_total: number;
  ws_broadcast_errors_total: number;
}

// In-memory process-local counters. Reset on restart; not persisted. The
// dispatched map is seeded with the known command types so a snapshot always
// reports every type, but it tolerates unknown types (the DB CHECK list is a
// superset of the validated COMMAND_TYPES) without producing NaN.
function seedDispatched(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const type of COMMAND_TYPES) out[type] = 0;
  return out;
}

const metrics: CommandMetricsSnapshot = {
  commands_dispatched_total: seedDispatched(),
  commands_failed_total: {
    dispatch_failed: 0,
    timeout_pending: 0,
    timeout_sent: 0,
    validation_error: 0,
  },
  commands_acknowledged_total: 0,
  pi_reconnects_total: 0,
  ws_broadcast_errors_total: 0,
};

export function incCommandDispatched(commandType: string): void {
  metrics.commands_dispatched_total[commandType] =
    (metrics.commands_dispatched_total[commandType] ?? 0) + 1;
}

export function incCommandFailed(reason: CommandFailureReason): void {
  metrics.commands_failed_total[reason] += 1;
}

export function incCommandAcknowledged(): void {
  metrics.commands_acknowledged_total += 1;
}

export function incPiReconnect(): void {
  metrics.pi_reconnects_total += 1;
}

export function incWsBroadcastError(): void {
  metrics.ws_broadcast_errors_total += 1;
}

export function snapshotMetrics(): CommandMetricsSnapshot {
  return {
    commands_dispatched_total: { ...metrics.commands_dispatched_total },
    commands_failed_total: { ...metrics.commands_failed_total },
    commands_acknowledged_total: metrics.commands_acknowledged_total,
    pi_reconnects_total: metrics.pi_reconnects_total,
    ws_broadcast_errors_total: metrics.ws_broadcast_errors_total,
  };
}
