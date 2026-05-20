import type { WebSocket } from 'ws';

export interface ClientConnection {
  ws: WebSocket;
  userId: string;
  userEmail: string;
  connectedAt: number;
  lastReauthAt: number;
}

class ClientConnectionRegistry {
  private readonly byUser = new Map<string, Set<ClientConnection>>();
  private totalCount = 0;

  register(ws: WebSocket, userId: string, userEmail: string): ClientConnection {
    const now = Date.now();
    const conn: ClientConnection = {
      ws,
      userId,
      userEmail,
      connectedAt: now,
      lastReauthAt: now,
    };
    let set = this.byUser.get(userId);
    if (!set) {
      set = new Set();
      this.byUser.set(userId, set);
    }
    set.add(conn);
    this.totalCount++;
    return conn;
  }

  unregister(conn: ClientConnection): void {
    const set = this.byUser.get(conn.userId);
    if (!set) return;
    if (set.delete(conn)) {
      this.totalCount--;
    }
    if (set.size === 0) {
      this.byUser.delete(conn.userId);
    }
  }

  all(): IterableIterator<ClientConnection> {
    const flat: ClientConnection[] = [];
    for (const set of this.byUser.values()) {
      for (const conn of set) {
        flat.push(conn);
      }
    }
    return flat[Symbol.iterator]();
  }

  size(): number {
    return this.totalCount;
  }
}

export const clientRegistry = new ClientConnectionRegistry();
