import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, type WebSocketServer } from 'ws';

import { logger } from '../utils/logger';
import { env } from '../config/env';

import {
  authenticateDeviceUpgrade,
  createDeviceWss,
  registerDeviceConnection,
} from './deviceHandler';
import {
  authenticateClient,
  createClientWss,
  registerClientConnection,
} from './clientHandler';
import { deviceRegistry } from './deviceRegistry';
import { clientRegistry } from './clientRegistry';
import { startHeartbeatMonitor, stopHeartbeatMonitor } from './heartbeatMonitor';
import { startClientTokenWatchdog, stopClientTokenWatchdog } from './tokenWatchdog';
import {
  clearAllPendingAnnouncements,
  notifyAllClientsShuttingDown,
} from './broadcaster';

const PATH_DEVICE = '/ws/device';
const PATH_CLIENT = '/ws/client';

const RESPONSE_401 = 'HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n';
const RESPONSE_503 = 'HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n';
const RESPONSE_404 = 'HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n';

let deviceWss: WebSocketServer | null = null;
let clientWss: WebSocketServer | null = null;

export function attachWebSocketServer(httpServer: HttpServer): void {
  if (deviceWss !== null || clientWss !== null) {
    throw new Error('WebSocket server already attached');
  }

  deviceWss = createDeviceWss();
  clientWss = createClientWss();

  httpServer.on('upgrade', (req, socket, head) => {
    routeUpgrade(req, socket, head);
  });

  startHeartbeatMonitor();
  startClientTokenWatchdog();

  logger.info('ws.server', `WebSocket server attached: ${PATH_DEVICE} | ${PATH_CLIENT}`);
}

function routeUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
  const url = req.url ?? '';

  const path = url.split('?')[0] ?? '';

  if (path === PATH_DEVICE) {
    handleDeviceUpgrade(req, socket, head);
  } else if (path === PATH_CLIENT) {
    void handleClientUpgrade(req, socket, head);
  } else {
    rejectUpgrade(socket, RESPONSE_404);
  }
}

function handleDeviceUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
  const auth = authenticateDeviceUpgrade(req);
  if (!auth.ok) {
    logger.warn('ws.server', `Device upgrade rejected: reason=${auth.reason} remote=${req.socket.remoteAddress ?? 'unknown'}`);
    rejectUpgrade(socket, RESPONSE_401);
    return;
  }

  if (!deviceWss) {
    rejectUpgrade(socket, RESPONSE_503);
    return;
  }

  deviceWss.handleUpgrade(req, socket, head, (ws) => {
    registerDeviceConnection(ws, auth.deviceId);
  });
}

async function handleClientUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
  const auth = await authenticateClient(req);
  if (!auth.ok) {
    logger.warn('ws.server', `Client upgrade rejected: reason=${auth.reason} remote=${req.socket.remoteAddress ?? 'unknown'}`);
    rejectUpgrade(socket, auth.transient === true ? RESPONSE_503 : RESPONSE_401);
    return;
  }

  if (!clientWss) {
    rejectUpgrade(socket, RESPONSE_503);
    return;
  }

  clientWss.handleUpgrade(req, socket, head, (ws) => {
    registerClientConnection({ ws, userId: auth.userId, userEmail: auth.userEmail });
  });
}

function rejectUpgrade(socket: Duplex, response: string): void {
  try {
    socket.write(response);
  } catch {
  }
  socket.destroy();
}

export function wsCounts(): { devices: number; clients: number } {
  return { devices: deviceRegistry.size(), clients: clientRegistry.size() };
}

export async function shutdownWebSocketServer(): Promise<void> {
  logger.info('ws.server', 'Shutting down WebSocket server');

  notifyAllClientsShuttingDown();
  clearAllPendingAnnouncements();

  stopHeartbeatMonitor();
  stopClientTokenWatchdog();

  const closeOne = (ws: WebSocket): Promise<void> =>
    new Promise((resolve) => {
      if (ws.readyState === WebSocket.CLOSED) {
        resolve();
        return;
      }
      ws.once('close', () => resolve());
      try {
        ws.close(1001, 'server_restart');
      } catch {
        resolve();
      }
    });

  const tasks: Promise<void>[] = [];
  for (const conn of deviceRegistry.values()) tasks.push(closeOne(conn.ws));
  for (const conn of clientRegistry.all()) tasks.push(closeOne(conn.ws));

  await Promise.race([
    Promise.all(tasks),
    new Promise<void>((resolve) => setTimeout(resolve, env.GRACEFUL_SHUTDOWN_DRAIN_MS).unref()),
  ]);

  for (const conn of deviceRegistry.values()) {
    if (conn.ws.readyState !== WebSocket.CLOSED) conn.ws.terminate();
  }
  for (const conn of clientRegistry.all()) {
    if (conn.ws.readyState !== WebSocket.CLOSED) conn.ws.terminate();
  }

  deviceWss?.close();
  clientWss?.close();
  deviceWss = null;
  clientWss = null;

  logger.info('ws.server', 'WebSocket server shut down');
}
