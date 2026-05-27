import { env } from '../config/env';
import { logger } from '../utils/logger';
import { deviceRegistry } from './deviceRegistry';

let intervalId: NodeJS.Timeout | null = null;

export function startHeartbeatMonitor(): void {
  if (intervalId !== null) return;

  const checkIntervalMs = Math.max(1_000, Math.floor(env.WS_HEARTBEAT_TIMEOUT_MS / 2));

  intervalId = setInterval(() => {
    tick();
  }, checkIntervalMs);
  intervalId.unref();

  logger.info('ws.heartbeatMonitor', `Started — check every ${checkIntervalMs}ms, timeout ${env.WS_HEARTBEAT_TIMEOUT_MS}ms`);
}

export function stopHeartbeatMonitor(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function tick(): void {
  const now = Date.now();
  const staleThreshold = now - env.WS_HEARTBEAT_TIMEOUT_MS;

  for (const conn of deviceRegistry.values()) {
    if (conn.lastHeartbeatAt < staleThreshold) {
      const secondsSilent = Math.round((now - conn.lastHeartbeatAt) / 1000);
      logger.warn('ws.heartbeatMonitor', `Device ${conn.deviceId} silent for ${secondsSilent}s — closing connection`);
      try {
        conn.ws.close(1001, 'heartbeat_timeout');
      } catch (err) {
        logger.debug('ws.heartbeatMonitor', `Close after heartbeat_timeout failed for ${conn.deviceId}`, err);
      }
    }
  }
}
