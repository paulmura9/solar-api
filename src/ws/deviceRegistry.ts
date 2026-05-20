import type { WebSocket } from 'ws';
import { logger } from '../utils/logger';
import { createRateLimitState, type RateLimitState } from './rateLimit';

export interface DeviceConnection {
  ws: WebSocket;
  deviceId: string;
  connectedAt: number;
  lastHeartbeatAt: number;
  lastMessageAt: number;
  lastPongAt: number;
  messageCount: number;
  rateLimit: RateLimitState;
}

class DeviceConnectionRegistry {
  private readonly connections = new Map<string, DeviceConnection>();

  register(ws: WebSocket, deviceId: string): DeviceConnection {
    const existing = this.connections.get(deviceId);
    if (existing) {

      logger.info('ws.deviceRegistry', `Replacing existing connection for ${deviceId}`);
      try {
        existing.ws.close(1000, 'replaced');
      } catch {
      }
    }

    const now = Date.now();
    const conn: DeviceConnection = {
      ws,
      deviceId,
      connectedAt: now,
      lastHeartbeatAt: now,
      lastMessageAt: now,
      lastPongAt: now,
      messageCount: 0,
      rateLimit: createRateLimitState(),
    };
    this.connections.set(deviceId, conn);
    return conn;
  }

  unregister(deviceId: string, ws: WebSocket): void {

    const current = this.connections.get(deviceId);
    if (current && current.ws === ws) {
      this.connections.delete(deviceId);
    }
  }

  get(deviceId: string): DeviceConnection | undefined {
    return this.connections.get(deviceId);
  }

  values(): IterableIterator<DeviceConnection> {
    return this.connections.values();
  }

  entries(): IterableIterator<[string, DeviceConnection]> {
    return this.connections.entries();
  }

  size(): number {
    return this.connections.size;
  }
}

export const deviceRegistry = new DeviceConnectionRegistry();
