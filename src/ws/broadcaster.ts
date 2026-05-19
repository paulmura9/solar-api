import { WebSocket } from 'ws';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { clientRegistry } from './clientRegistry';
import type { ClientBroadcast } from './schemas';

// Fans messages to every connected /ws/client. Slow/dead sockets do not block
// the iteration — ws.send buffers internally and the heartbeat layer kills
// connections that never drain.
function broadcastRaw(message: ClientBroadcast): void {
  const serialized = JSON.stringify(message);
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
  broadcastRaw({
    type: 'device_status_update',
    data: { deviceId, deviceName, isOnline },
    timestamp: new Date().toISOString(),
  });
}

// ===== Public broadcast helpers (called from message handlers) =====

export function broadcastTelemetry(data: unknown): void {
  broadcastRaw({ type: 'telemetry_update', data, timestamp: new Date().toISOString() });
}

export function broadcastEvent(data: unknown): void {
  broadcastRaw({ type: 'event', data, timestamp: new Date().toISOString() });
}

export function broadcastVision(data: unknown): void {
  broadcastRaw({ type: 'vision_update', data, timestamp: new Date().toISOString() });
}

export function broadcastCommandStatus(data: unknown): void {
  broadcastRaw({ type: 'command_status_update', data, timestamp: new Date().toISOString() });
}

// Drain on shutdown: tell clients to reconnect so they don't sit on a half-open
// socket while Railway restarts the container.
export function notifyAllClientsShuttingDown(): void {
  broadcastRaw({ type: 'server_shutting_down', timestamp: new Date().toISOString() });
}

export function clearAllPendingAnnouncements(): void {
  for (const timer of pendingOnlineAnnouncements.values()) {
    clearTimeout(timer);
  }
  pendingOnlineAnnouncements.clear();
}
