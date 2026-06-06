import { WebSocket } from 'ws';
import { logger } from '../utils/logger';
import { deviceRegistry } from './deviceRegistry';
import { outgoingCommandSchema, type OutgoingCommand } from './schemas';
import { incCommandDispatched, incCommandFailed } from '../utils/metrics';
import type { CommandType } from '../types/command';

export function dispatchCommandToDevice(
  commandId: string,
  commandType: CommandType,
  payload: Record<string, unknown>,
  timestamp: string,
  deviceId: string
): boolean {
  const outgoing: OutgoingCommand = {
    v: 1,
    type: 'command',
    id: commandId,
    timestamp,
    payload: {
      command_type: commandType,
      device_id: deviceId,
      args: payload,
    },
  };

  const validated = outgoingCommandSchema.safeParse(outgoing);
  if (!validated.success) {
    logger.error(
      'ws.commandDispatch',
      `Malformed command ${commandId} — refusing to dispatch`,
      validated.error.issues
    );
    incCommandFailed('validation_error');
    return false;
  }

  const serialized = JSON.stringify(validated.data);
  let dispatched = false;

  for (const conn of deviceRegistry.values()) {
    if (conn.ws.readyState !== WebSocket.OPEN) continue;
    try {
      conn.ws.send(serialized);
      dispatched = true;
    } catch (err) {
      logger.error(
        'ws.commandDispatch',
        `Failed to dispatch command ${commandId} to ${conn.deviceId}`,
        err
      );
      incCommandFailed('dispatch_failed');
    }
  }

  if (dispatched) {
    incCommandDispatched(commandType);
  }

  return dispatched;
}
