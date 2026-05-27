import { acknowledgeCommand } from '../../services/commandService';
import { insertEvent } from '../../services/eventService';
import { broadcastCommandStatus } from '../broadcaster';
import { commandAckPayloadSchema } from '../schemas';
import { parseOr } from '../utils';

export async function handleCommandAck(payload: unknown): Promise<void> {
  const parsed = parseOr(commandAckPayloadSchema, payload, 'command_ack');
  if (!parsed.ok) return;

  const { commandId, status, error_message, ack_payload } = parsed.data;
  const errorMsg = error_message ?? null;
  const updated = await acknowledgeCommand(commandId, status, errorMsg, ack_payload ?? null);
  if (!updated) return;

  broadcastCommandStatus({
    id: updated.id,
    status: updated.status,
    error_message: updated.errorMessage,
    acknowledged_at: updated.acknowledgedAt,
  });

  if (status === 'FAILED') {
    await insertEvent({
      event_type: 'COMMAND_FAILED',
      severity: 'ERROR',
      message: `Command ${commandId} failed: ${errorMsg ?? 'no detail'}`,
    });
  }
}
