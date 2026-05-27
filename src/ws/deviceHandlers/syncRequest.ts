import { WebSocket } from 'ws';

import { logger } from '../../utils/logger';
import { upsertDeviceStatus } from '../../services/deviceService';
import { findCommandsForResync, markCommandSent } from '../../services/commandService';
import type { DeviceConnection } from '../deviceRegistry';
import { dispatchCommandToDevice } from '../commandDispatch';
import { syncRequestPayloadSchema } from '../schemas';
import { parseOr } from '../utils';

export async function handleSyncRequest(conn: DeviceConnection, payload: unknown): Promise<void> {
  const parsed = parseOr(syncRequestPayloadSchema, payload, `sync_request for ${conn.deviceId}`);
  if (!parsed.ok) return;

  await upsertDeviceStatus('RASPBERRY_PI', true, null, 'Resync');

  const pending = await findCommandsForResync(parsed.data.last_command_id);
  logger.info(
    'ws.deviceHandler',
    `Resync for ${conn.deviceId}: ${pending.length} commands since ${parsed.data.last_command_id ?? 'start'}`
  );

  for (const cmd of pending) {
    if (conn.ws.readyState !== WebSocket.OPEN) break;
    const sent = dispatchCommandToDevice(cmd.id, cmd.commandType, cmd.payload, cmd.createdAt);
    if (!sent) {
      logger.error('ws.deviceHandler', `Resync send failed for command ${cmd.id}`);
      break;
    }
    await markCommandSent(cmd.id);
  }
}
