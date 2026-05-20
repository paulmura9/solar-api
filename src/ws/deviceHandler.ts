import crypto, { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';

import { env } from '../config/env';
import { logger } from '../utils/logger';
import { insertEvent } from '../services/eventService';
import { upsertDeviceStatus } from '../services/deviceService';
import { insertTelemetry } from '../services/telemetryService';
import { insertVisionResult } from '../services/visionService';
import {
  acknowledgeCommand,
  findCommandsForResync,
  markCommandSent,
} from '../services/commandService';

import { deviceRegistry, type DeviceConnection } from './deviceRegistry';
import { checkRateLimit } from './rateLimit';
import { checkAndRecord } from './messageDedup';
import {
  broadcastCommandStatus,
  broadcastDeviceOffline,
  broadcastEvent,
  broadcastTelemetry,
  broadcastVision,
  cancelPendingOnlineBroadcast,
  scheduleDeviceOnlineBroadcast,
} from './broadcaster';
import {
  commandAckPayloadSchema,
  esp32EventPayloadSchema,
  heartbeatPayloadSchema,
  outgoingCommandSchema,
  syncRequestPayloadSchema,
  telemetryPayloadSchema,
  visionResultPayloadSchema,
  wsEnvelopeSchema,
  type OutgoingCommand,
  type WsEnvelope,
} from './schemas';

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

export function createDeviceWss(): WebSocketServer {
  return new WebSocketServer({ noServer: true });
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
    logger.warn('ws.deviceHandler', `Device socket error: ${deviceId}`);
    logger.error('ws.deviceHandler', 'detail', err);
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
      logger.warn('ws.deviceHandler', `Ping send failed for ${conn.deviceId}`);
      logger.error('ws.deviceHandler', 'ping detail', err);
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
    } catch {
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

async function handleTelemetry(payload: unknown): Promise<void> {
  const result = telemetryPayloadSchema.safeParse(payload);
  if (!result.success) {
    logger.warn('ws.deviceHandler', `telemetry payload invalid: ${result.error.issues[0]?.message ?? 'unknown'}`);
    await insertEvent({
      event_type: 'SENSOR_ERROR',
      severity: 'WARNING',
      message: `Invalid telemetry payload: ${result.error.issues[0]?.message ?? 'unknown'}`,
    });
    return;
  }

  const inserted = await insertTelemetry(result.data);
  if (!inserted) return;

  await upsertDeviceStatus('ESP32', true, null, 'Telemetry received');
  broadcastTelemetry(inserted);
}

async function handleCommandAck(payload: unknown): Promise<void> {
  const result = commandAckPayloadSchema.safeParse(payload);
  if (!result.success) {
    logger.warn('ws.deviceHandler', `command_ack payload invalid: ${result.error.issues[0]?.message ?? 'unknown'}`);
    return;
  }

  const { commandId, status, error_message } = result.data;
  const errorMsg = error_message ?? null;
  const updated = await acknowledgeCommand(commandId, status, errorMsg);
  if (updated) {
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
}

async function handleEsp32Event(payload: unknown): Promise<void> {
  const result = esp32EventPayloadSchema.safeParse(payload);
  if (!result.success) {
    logger.warn('ws.deviceHandler', `esp32_event payload invalid: ${result.error.issues[0]?.message ?? 'unknown'}`);
    return;
  }
  await insertEvent(result.data);
  broadcastEvent(result.data);
}

async function handleVisionResult(payload: unknown): Promise<void> {
  const result = visionResultPayloadSchema.safeParse(payload);
  if (!result.success) {
    logger.warn('ws.deviceHandler', `vision_result payload invalid: ${result.error.issues[0]?.message ?? 'unknown'}`);
    return;
  }
  const inserted = await insertVisionResult(result.data);
  if (!inserted) return;
  broadcastVision(inserted);
  if (inserted.cleaningRequired) {
    await insertEvent({
      event_type: 'CLEANING_REQUIRED',
      severity: 'WARNING',
      message: `Vision pipeline flagged cleaning required (dirt=${inserted.dirtLevelPercent}%)`,
    });
  }
}

async function handleHeartbeat(conn: DeviceConnection, payload: unknown): Promise<void> {
  const result = heartbeatPayloadSchema.safeParse(payload);
  if (!result.success) {
    logger.warn('ws.deviceHandler', `heartbeat payload invalid for ${conn.deviceId}`);
    return;
  }
  conn.lastHeartbeatAt = Date.now();

  await upsertDeviceStatus('RASPBERRY_PI', true, null, 'Heartbeat');
  if (result.data.esp32_alive !== undefined) {
    await upsertDeviceStatus(
      'ESP32',
      result.data.esp32_alive,
      null,
      result.data.esp32_alive ? 'Reported alive by Pi heartbeat' : 'Reported offline by Pi heartbeat'
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
      logger.warn('ws.deviceHandler', `Failed to send heartbeat_ack to ${conn.deviceId}`);
      logger.error('ws.deviceHandler', 'detail', err);
    }
  }
}

async function handleSyncRequest(conn: DeviceConnection, payload: unknown): Promise<void> {
  const result = syncRequestPayloadSchema.safeParse(payload);
  if (!result.success) {
    logger.warn('ws.deviceHandler', `sync_request payload invalid for ${conn.deviceId}`);
    return;
  }

  await upsertDeviceStatus('RASPBERRY_PI', true, null, 'Resync');
  await upsertDeviceStatus(
    'ESP32',
    result.data.esp32_alive,
    null,
    result.data.esp32_alive ? 'Reported alive on Pi resync' : 'Reported offline on Pi resync'
  );

  const pending = await findCommandsForResync(result.data.last_command_id);
  logger.info(
    'ws.deviceHandler',
    `Resync for ${conn.deviceId}: ${pending.length} commands since ${result.data.last_command_id ?? 'start'}`
  );

  for (const cmd of pending) {
    if (conn.ws.readyState !== WebSocket.OPEN) break;
    const outgoing: OutgoingCommand = {
      v: 1,
      type: 'command',
      id: cmd.id,
      timestamp: cmd.createdAt,
      payload: {
        command_type: cmd.commandType,
        args: cmd.payload,
      },
    };

    const validated = outgoingCommandSchema.safeParse(outgoing);
    if (!validated.success) {
      logger.error('ws.deviceHandler', `Skipping malformed command ${cmd.id} during resync`, validated.error.issues);
      continue;
    }
    try {
      conn.ws.send(JSON.stringify(validated.data));
      await markCommandSent(cmd.id);
    } catch (err) {
      logger.error('ws.deviceHandler', `Resync send failed for command ${cmd.id}`, err);
      break;
    }
  }
}

export function sendCommandToDevice(
  deviceId: string,
  commandId: string,
  commandType: string,
  args: Record<string, unknown>,
  createdAtIso: string
): boolean {
  const conn = deviceRegistry.get(deviceId);
  if (!conn) return false;
  if (conn.ws.readyState !== WebSocket.OPEN) return false;

  const candidate = {
    v: 1 as const,
    type: 'command' as const,
    id: commandId,
    timestamp: createdAtIso,
    payload: {
      command_type: commandType,
      args,
    },
  };
  const validated = outgoingCommandSchema.safeParse(candidate);
  if (!validated.success) {
    logger.error('ws.deviceHandler', `Refusing to send malformed command ${commandId}`, validated.error.issues);
    return false;
  }

  try {
    conn.ws.send(JSON.stringify(validated.data));
    return true;
  } catch (err) {
    logger.error('ws.deviceHandler', `send to device ${deviceId} failed`, err);
    return false;
  }
}

function bufferToString(raw: Buffer | ArrayBuffer | Buffer[]): string {
  if (Buffer.isBuffer(raw)) return raw.toString('utf8');
  if (Array.isArray(raw)) return Buffer.concat(raw).toString('utf8');
  return Buffer.from(raw).toString('utf8');
}
