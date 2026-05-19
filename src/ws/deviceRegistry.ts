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

// Single connection per deviceId. Phase-1 design supports one Pi (thesis scope);
// the registry uses deviceId as the key so multi-Pi can be enabled later by
// changing only the auth layer (per-device credentials) without touching this.
class DeviceConnectionRegistry {
  private readonly connections = new Map<string, DeviceConnection>();

  register(ws: WebSocket, deviceId: string): DeviceConnection {
    const existing = this.connections.get(deviceId);
    if (existing) {
      // Same deviceId reconnecting — drop the stale connection. The Pi side
      // can lose its socket without us getting a clean close (NAT timeout,
      // power blip), so we'd otherwise hold a phantom connection forever.
      logger.info('ws.deviceRegistry', `Replacing existing connection for ${deviceId}`);
      try {
        existing.ws.close(1000, 'replaced');
      } catch {
        // The old socket may already be dead; ignore close errors.
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
    // Only unregister if the stored ws is the one closing — protects against
    // the replace path above where the OLD ws's close handler fires after the
    // NEW ws has already taken its slot.
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
