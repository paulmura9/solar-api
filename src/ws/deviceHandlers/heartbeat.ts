import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';

import { logger } from '../../utils/logger';
import { upsertDeviceStatus, getDeviceByName } from '../../services/deviceService';
import { insertEvent } from '../../services/eventService';
import type { DeviceConnection } from '../deviceRegistry';
import { heartbeatPayloadSchema } from '../schemas';
import { parseOr } from '../utils';
import { env } from '../../config/env';
import { EVENT_TYPES } from '../../utils/constants';

export async function handleHeartbeat(conn: DeviceConnection, payload: unknown): Promise<void> {
  const parsed = parseOr(heartbeatPayloadSchema, payload, `heartbeat for ${conn.deviceId}`);
  if (!parsed.ok) return;

  conn.lastHeartbeatAt = Date.now();

  await upsertDeviceStatus('RASPBERRY_PI', true, null, 'Heartbeat');
  if (parsed.data.esp32_alive !== undefined) {
    const esp32Alive = parsed.data.esp32_alive;

    if (!esp32Alive) {
      const prior = await getDeviceByName('ESP32');
      if (prior?.isOnline === true) {
        await insertEvent({
          event_type: EVENT_TYPES.ESP32_OFFLINE,
          severity: 'WARNING',
          message: 'ESP32 reported offline by Pi heartbeat',
          device_id: env.DEFAULT_DEVICE_ID,
        });
      }
    }

    await upsertDeviceStatus(
      'ESP32',
      esp32Alive,
      null,
      esp32Alive ? 'Reported alive by Pi heartbeat' : 'Reported offline by Pi heartbeat'
    );
  }

  const cameraOk = parsed.data.camera_ok ?? false;
  await upsertDeviceStatus(
    'CAMERA',
    cameraOk,
    null,
    cameraOk ? 'Camera OK via Pi heartbeat' : 'Camera not OK via Pi heartbeat'
  );

  if (conn.ws.readyState === WebSocket.OPEN) {
    const ack = {
      v: 1 as const,
      type: 'heartbeat_ack' as const,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      payload: {},
    };
    try {
      conn.ws.send(JSON.stringify(ack));
    } catch (err) {
      logger.error('ws.deviceHandler', `Failed to send heartbeat_ack to ${conn.deviceId}`, err);
    }
  }
}
