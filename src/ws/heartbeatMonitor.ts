import { env } from '../config/env';
import { logger } from '../utils/logger';
import { deviceRegistry } from './deviceRegistry';

// Scans device connections for application-layer staleness. Application
// heartbeats prove the Pi process is doing its job (forwarding telemetry,
// listening to MQTT). WebSocket ping/pong only proves the TCP pipe is alive —
// it cannot tell us the Pi's event loop is unstuck.
//
// On staleness, we close the WS with code 1001 (going away). The close handler
// in the device handler does the device_status update + offline broadcast.

let intervalId: NodeJS.Timeout | null = null;

export function startHeartbeatMonitor(): void {
  if (intervalId !== null) return;

  // Check roughly half as often as the timeout window so we never overshoot
  // by more than a check interval.
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
      } catch {
        // If close throws, the socket is already broken; the registry will be
        // cleaned up by whatever error/close event surfaces next.
      }
    }
  }
}
