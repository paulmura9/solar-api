import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';

import { logger } from '../../utils/logger';
import { upsertDeviceStatus } from '../../services/deviceService';
import type { DeviceConnection } from '../deviceRegistry';
import { heartbeatPayloadSchema } from '../schemas';
import { parseOr } from '../utils';

export async function handleHeartbeat(conn: DeviceConnection, payload: unknown): Promise<void> {
  const parsed = parseOr(heartbeatPayloadSchema, payload, `heartbeat for ${conn.deviceId}`);
  if (!parsed.ok) return;

  conn.lastHeartbeatAt = Date.now();

  await upsertDeviceStatus('RASPBERRY_PI', true, null, 'Heartbeat');
  if (parsed.data.esp32_alive !== undefined) {
    await upsertDeviceStatus(
      'ESP32',
      parsed.data.esp32_alive,
      null,
      parsed.data.esp32_alive ? 'Reported alive by Pi heartbeat' : 'Reported offline by Pi heartbeat'
    );
  }

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
