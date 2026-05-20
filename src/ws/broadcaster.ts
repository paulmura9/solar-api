import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { clientRegistry } from './clientRegistry';
import type { ServerOutboundEnvelope, ServerOutboundType } from './schemas';

// Wraps every outbound /ws/client message in the standard v=1 envelope.
// Every message — broadcasts, acks, shutdown notice — flows through here so
// the wire format stays consistent across the entire client surface.
function emit(type: ServerOutboundType, payload: object): void {
  const message: ServerOutboundEnvelope = {
    v: 1,
    type,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    payload,
  };
  const serialized = JSON.stringify(message);
  // Fans to every connected /ws/client. Slow/dead sockets do not block the
  // iteration — ws.send buffers internally and the heartbeat layer kills
  // connections that never drain.
  for (const conn of clientRegistry.all()) {
    if (conn.ws.readyState !== WebSocket.OPEN) continue;
    try {
      conn.ws.send(serialized);
    } catch (err) {
      logger.warn('ws.broadcaster', `Failed to send to client ${conn.userId}`);
      logger.error('ws.broadcaster', 'send error detail', err);
    }
  }
}

// ===== Device online/offline announcements =====
//
// Offline is broadcast immediately so the UI reflects degraded state ASAP.
// Online is delayed by RECONNECT_GRACE_MS so a flapping link doesn't spam the
// UI with online/offline toggles within the same few seconds. If the device
// disconnects again inside the grace window, the queued online broadcast is
// cancelled.

const pendingOnlineAnnouncements = new Map<string, NodeJS.Timeout>();

export function scheduleDeviceOnlineBroadcast(deviceId: string, deviceName: string): void {
  const existing = pendingOnlineAnnouncements.get(deviceId);
  if (existing) {
    // Already queued — keep it; resetting the timer would push announcements
    // out indefinitely on repeated reconnects.
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
  // unref so a queued announcement can't block process exit during shutdown
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
  // Cancel any queued online broadcast — if we're going offline we definitely
  // don't want a stale "online" announcement firing afterwards.
  cancelPendingOnlineBroadcast(deviceId);
  broadcastDeviceStatus(deviceId, deviceName, false);
}

function broadcastDeviceStatus(deviceId: string, deviceName: string, isOnline: boolean): void {
  emit('device_status_update', { deviceId, deviceName, isOnline });
}

// ===== Public broadcast helpers (called from message handlers) =====
//
// Each helper accepts a Record<string, unknown> for the payload field — the
// inserted-row DTOs from the various services are structurally compatible.

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

// Drain on shutdown: tell clients to reconnect so they don't sit on a half-open
// socket while Railway restarts the container.
export function notifyAllClientsShuttingDown(): void {
  emit('server_shutting_down', {});
}

export function clearAllPendingAnnouncements(): void {
  for (const timer of pendingOnlineAnnouncements.values()) {
    clearTimeout(timer);
  }
  pendingOnlineAnnouncements.clear();
}
