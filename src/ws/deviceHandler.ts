import crypto from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';

import { env } from '../config/env';
import { logger } from '../utils/logger';
import { insertEvent } from '../services/eventService';
import { upsertDeviceStatus } from '../services/deviceService';

import { deviceRegistry, type DeviceConnection } from './deviceRegistry';
import { checkRateLimit } from './rateLimit';
import { checkAndRecord } from './messageDedup';
import {
  broadcastDeviceOffline,
  cancelPendingOnlineBroadcast,
  scheduleDeviceOnlineBroadcast,
} from './broadcaster';
import { wsEnvelopeSchema, type WsEnvelope } from './schemas';
import { bufferToString } from './utils';
import { handleTelemetry } from './deviceHandlers/telemetry';
import { handleCommandAck } from './deviceHandlers/commandAck';
import { handleEsp32Event } from './deviceHandlers/esp32Event';
import { handleVisionResult } from './deviceHandlers/vision';
import { handleHeartbeat } from './deviceHandlers/heartbeat';
import { handleSyncRequest } from './deviceHandlers/syncRequest';

type DeviceAuthResult = { ok: true; deviceId: string } | { ok: false; reason: string };

const DEVICE_KEY_BUFFER: Buffer = Buffer.from(env.DEVICE_API_KEY, 'utf8');
const DEVICE_ID_REGEX = /^[a-z0-9-]{3,64}$/;

export function authenticateDeviceUpgrade(req: IncomingMessage): DeviceAuthResult {
  const headerKey = req.headers['x-device-key'];
  const headerId = req.headers['x-device-id'];

  if (typeof headerKey !== 'string' || typeof headerId !== 'string') {
    return { ok: false, reason: 'missing_headers' };
  }

  const providedBuf = Buffer.from(headerKey, 'utf8');
  if (providedBuf.length !== DEVICE_KEY_BUFFER.length) {
    return { ok: false, reason: 'invalid_key' };
  }

  if (!crypto.timingSafeEqual(providedBuf, DEVICE_KEY_BUFFER)) {
    return { ok: false, reason: 'invalid_key' };
  }

  if (!DEVICE_ID_REGEX.test(headerId)) {
    return { ok: false, reason: 'invalid_device_id' };
  }

  if (headerId !== env.EXPECTED_DEVICE_ID) {
    return { ok: false, reason: 'unexpected_device_id' };
  }

  return { ok: true, deviceId: headerId };
}

const DEVICE_WS_MAX_PAYLOAD_BYTES = 1_000_000;

export function createDeviceWss(): WebSocketServer {
  return new WebSocketServer({ noServer: true, maxPayload: DEVICE_WS_MAX_PAYLOAD_BYTES });
}

export function registerDeviceConnection(ws: WebSocket, deviceId: string): void {
  const conn = deviceRegistry.register(ws, deviceId);
  logger.info('ws.deviceHandler', `Device connected: ${deviceId}`);

  void upsertDeviceStatus('RASPBERRY_PI', true, null, 'WebSocket connected');
  scheduleDeviceOnlineBroadcast(deviceId, 'RASPBERRY_PI');

  setupProtocolPing(conn);

  ws.on('message', (raw: Buffer | ArrayBuffer | Buffer[]) => {
    void handleDeviceMessage(conn, raw);
  });

  ws.on('pong', () => {
    conn.lastPongAt = Date.now();
  });

  ws.on('close', (code, reasonBuf) => {
    const reason = reasonBuf.toString('utf8') || 'none';
    logger.info('ws.deviceHandler', `Device disconnected: ${deviceId} code=${code} reason=${reason}`);

    deviceRegistry.unregister(deviceId, ws);
    cancelPendingOnlineBroadcast(deviceId);

    void onDeviceDisconnected(deviceId, reason);
  });

  ws.on('error', (err) => {
    logger.error('ws.deviceHandler', `Device socket error: ${deviceId}`, err);
  });
}

async function onDeviceDisconnected(deviceId: string, reason: string): Promise<void> {
  await upsertDeviceStatus('RASPBERRY_PI', false, null, `WebSocket closed: ${reason}`);
  await insertEvent({
    event_type: 'RASPBERRY_PI_OFFLINE',
    severity: 'WARNING',
    message: `Pi disconnected (${reason})`,
  });

  broadcastDeviceOffline(deviceId, 'RASPBERRY_PI');
}

function setupProtocolPing(conn: DeviceConnection): void {
  const pingInterval = setInterval(() => {
    if (conn.ws.readyState !== WebSocket.OPEN) {
      clearInterval(pingInterval);
      return;
    }
    if (Date.now() - conn.lastPongAt > env.PROTOCOL_PING_TIMEOUT_MS + env.PROTOCOL_PING_INTERVAL_MS) {
      logger.warn('ws.deviceHandler', `Device ${conn.deviceId} unresponsive to ping — terminating`);
      conn.ws.terminate();
      clearInterval(pingInterval);
      return;
    }
    try {
      conn.ws.ping();
    } catch (err) {
      logger.error('ws.deviceHandler', `Ping send failed for ${conn.deviceId}`, err);
      clearInterval(pingInterval);
    }
  }, env.PROTOCOL_PING_INTERVAL_MS);
  pingInterval.unref();

  conn.ws.once('close', () => clearInterval(pingInterval));
}

async function handleDeviceMessage(
  conn: DeviceConnection,
  raw: Buffer | ArrayBuffer | Buffer[]
): Promise<void> {
  conn.lastMessageAt = Date.now();
  conn.messageCount++;

  if (!checkRateLimit(conn.rateLimit)) {
    logger.warn('ws.deviceHandler', `Rate limit exceeded for ${conn.deviceId} — closing`);
    try {
      conn.ws.close(1008, 'rate_limit');
    } catch (err) {
      logger.debug('ws.deviceHandler', `Close after rate_limit failed for ${conn.deviceId}`, err);
    }
    return;
  }

  let parsed: unknown;
  try {
    const text = bufferToString(raw);
    parsed = JSON.parse(text);
  } catch {

    logger.warn('ws.deviceHandler', `Invalid JSON from ${conn.deviceId}`);
    return;
  }

  const envResult = wsEnvelopeSchema.safeParse(parsed);
  if (!envResult.success) {
    logger.warn('ws.deviceHandler', `Invalid envelope from ${conn.deviceId}: ${envResult.error.issues[0]?.message ?? 'unknown'}`);
    return;
  }
  const envelope: WsEnvelope = envResult.data;

  if (!checkAndRecord(envelope.id)) {
    logger.debug('ws.deviceHandler', `Duplicate message ${envelope.id} from ${conn.deviceId} — ignoring`);
    return;
  }

  try {
    await dispatchEnvelope(conn, envelope);
  } catch (err) {

    logger.error('ws.deviceHandler', `Handler error for type=${envelope.type} from ${conn.deviceId}`, err);
  }
}

const DEVICE_MESSAGE_TYPES = [
  'telemetry',
  'command_ack',
  'esp32_event',
  'vision_result',
  'heartbeat',
  'sync_request',
] as const;
type DeviceMessageType = (typeof DEVICE_MESSAGE_TYPES)[number];

function isDeviceMessageType(value: string): value is DeviceMessageType {
  return (DEVICE_MESSAGE_TYPES as readonly string[]).includes(value);
}

async function dispatchEnvelope(conn: DeviceConnection, envelope: WsEnvelope): Promise<void> {
  if (!isDeviceMessageType(envelope.type)) {
    logger.warn('ws.deviceHandler', `Unknown message type "${envelope.type}" from ${conn.deviceId}`);
    return;
  }

  switch (envelope.type) {
    case 'telemetry':
      await handleTelemetry(envelope.payload);
      return;
    case 'command_ack':
      await handleCommandAck(envelope.payload);
      return;
    case 'esp32_event':
      await handleEsp32Event(envelope.payload);
      return;
    case 'vision_result':
      await handleVisionResult(envelope.payload);
      return;
    case 'heartbeat':
      await handleHeartbeat(conn, envelope.payload);
      return;
    case 'sync_request':
      await handleSyncRequest(conn, envelope.payload);
      return;
    default: {
      const _exhaustive: never = envelope.type;
      void _exhaustive;
    }
  }
}
