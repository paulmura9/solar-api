import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { clientRegistry } from './clientRegistry';
import type { ServerOutboundEnvelope, ServerOutboundType } from './schemas';

function emit(type: ServerOutboundType, payload: object): void {
  const message: ServerOutboundEnvelope = {
    v: 1,
    type,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    payload,
  };
  const serialized = JSON.stringify(message);

  for (const conn of clientRegistry.all()) {
    if (conn.ws.readyState !== WebSocket.OPEN) continue;
    try {
      conn.ws.send(serialized);
    } catch (err) {
      logger.error('ws.broadcaster', `Failed to send to client ${conn.userId}`, err);
    }
  }
}

const pendingOnlineAnnouncements = new Map<string, NodeJS.Timeout>();

export function scheduleDeviceOnlineBroadcast(deviceId: string, deviceName: string): void {
  const existing = pendingOnlineAnnouncements.get(deviceId);
  if (existing) {

    return;
  }

  const grace = env.RECONNECT_GRACE_MS;
  if (grace === 0) {
    broadcastDeviceStatus(deviceId, deviceName, true);
    return;
  }

  const timer = setTimeout(() => {
    pendingOnlineAnnouncements.delete(deviceId);
    broadcastDeviceStatus(deviceId, deviceName, true);
  }, grace);

  timer.unref();
  pendingOnlineAnnouncements.set(deviceId, timer);
}

export function cancelPendingOnlineBroadcast(deviceId: string): void {
  const timer = pendingOnlineAnnouncements.get(deviceId);
  if (timer) {
    clearTimeout(timer);
    pendingOnlineAnnouncements.delete(deviceId);
  }
}

export function broadcastDeviceOffline(deviceId: string, deviceName: string): void {

  cancelPendingOnlineBroadcast(deviceId);
  broadcastDeviceStatus(deviceId, deviceName, false);
}

function broadcastDeviceStatus(deviceId: string, deviceName: string, isOnline: boolean): void {
  emit('device_status_update', { deviceId, deviceName, isOnline });
}

export function broadcastTelemetry(data: object): void {
  emit('telemetry_update', data);
}

export function broadcastEvent(data: object): void {
  emit('event', data);
}

export function broadcastVision(data: object): void {
  emit('vision_update', data);
}

export function broadcastCommandStatus(data: object): void {
  emit('command_status_update', data);
}

export function notifyAllClientsShuttingDown(): void {
  emit('server_shutting_down', {});
}

export function clearAllPendingAnnouncements(): void {
  for (const timer of pendingOnlineAnnouncements.values()) {
    clearTimeout(timer);
  }
  pendingOnlineAnnouncements.clear();
}
