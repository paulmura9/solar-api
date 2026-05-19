import type { IncomingMessage } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import { clientRegistry, type ClientConnection } from './clientRegistry';
import { clientIncomingMessageSchema } from './schemas';

// JWT is delivered via the Sec-WebSocket-Protocol header rather than a URL
// query parameter. URLs end up in access logs, browser history, and Referer
// headers; the subprotocol travels only in the handshake.
//
// Client request:    Sec-WebSocket-Protocol: access_token, <jwt>
// Server must echo:  Sec-WebSocket-Protocol: access_token
// The `ws` library handles the echo when we accept the subprotocol via
// `handleProtocols` (set up in src/ws/server.ts).

const SUBPROTOCOL_ACCESS_TOKEN = 'access_token';
const CLOSE_CODE_IDENTITY_CHANGED = 4002;
const CLOSE_CODE_REAUTH_FAILED = 4003;

type ClientAuthResult =
  | { ok: true; userId: string; userEmail: string }
  | { ok: false; reason: string; transient?: boolean };

export async function authenticateClient(req: IncomingMessage): Promise<ClientAuthResult> {
  const header = req.headers['sec-websocket-protocol'];
  if (typeof header !== 'string') {
    return { ok: false, reason: 'missing_protocol' };
  }

  const parts = header.split(',').map((p) => p.trim());
  if (parts.length !== 2 || parts[0] !== SUBPROTOCOL_ACCESS_TOKEN) {
    return { ok: false, reason: 'malformed_protocol' };
  }

  const token = parts[1];
  if (!token) {
    return { ok: false, reason: 'empty_token' };
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error) {
      if (isAuthRetryableFetchError(error)) {
        return { ok: false, reason: 'auth_service_unavailable', transient: true };
      }
      return { ok: false, reason: 'invalid_token' };
    }
    if (!data.user || !data.user.email) {
      return { ok: false, reason: 'invalid_token' };
    }
    return { ok: true, userId: data.user.id, userEmail: data.user.email };
  } catch (err) {
    logger.error('ws.clientHandler', 'Unexpected error during client auth', err);
    return { ok: false, reason: 'auth_unexpected_error' };
  }
}

interface RegisterClientArgs {
  ws: WebSocket;
  userId: string;
  userEmail: string;
}

export function registerClientConnection({ ws, userId, userEmail }: RegisterClientArgs): void {
  const conn = clientRegistry.register(ws, userId, userEmail);
  logger.info('ws.clientHandler', `Client connected: user=${userId} email=${userEmail} total=${clientRegistry.size()}`);

  ws.on('message', (raw: Buffer | ArrayBuffer | Buffer[]) => {
    void handleClientMessage(conn, raw);
  });

  ws.on('close', (code, reasonBuf) => {
    clientRegistry.unregister(conn);
    logger.info(
      'ws.clientHandler',
      `Client disconnected: user=${userId} code=${code} reason=${reasonBuf.toString('utf8') || 'none'} remaining=${clientRegistry.size()}`
    );
  });

  ws.on('error', (err) => {
    logger.warn('ws.clientHandler', `Client socket error for user=${userId}`);
    logger.error('ws.clientHandler', 'detail', err);
  });
}

async function handleClientMessage(
  conn: ClientConnection,
  raw: Buffer | ArrayBuffer | Buffer[]
): Promise<void> {
  let parsed: unknown;
  try {
    const text = bufferToString(raw);
    parsed = JSON.parse(text);
  } catch {
    // Client sent something non-JSON. Don't close — could be transient client bug.
    logger.warn('ws.clientHandler', `Invalid JSON from user=${conn.userId}`);
    return;
  }

  const result = clientIncomingMessageSchema.safeParse(parsed);
  if (!result.success) {
    logger.warn('ws.clientHandler', `Unknown/invalid message from user=${conn.userId}`);
    return;
  }

  const msg = result.data;
  switch (msg.type) {
    case 'reauth':
      await handleReauth(conn, msg.token);
      break;
    default: {
      // Exhaustiveness check — TS will error here if a new message type is
      // added to the schema without a handler.
      const _exhaustive: never = msg.type;
      void _exhaustive;
    }
  }
}

async function handleReauth(conn: ClientConnection, token: string): Promise<void> {
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      logger.warn('ws.clientHandler', `Reauth failed for user=${conn.userId}`);
      conn.ws.close(CLOSE_CODE_REAUTH_FAILED, 'reauth_failed');
      return;
    }

    if (data.user.id !== conn.userId) {
      // The token now belongs to a different user. Closing rather than silently
      // rebinding the connection — the client should establish a new one with
      // an unambiguous identity from the start.
      logger.warn(
        'ws.clientHandler',
        `Reauth identity mismatch: connection=${conn.userId} token=${data.user.id}`
      );
      conn.ws.close(CLOSE_CODE_IDENTITY_CHANGED, 'identity_changed');
      return;
    }

    conn.lastReauthAt = Date.now();
    conn.ws.send(JSON.stringify({ type: 'reauth_ok', timestamp: new Date().toISOString() }));
  } catch (err) {
    logger.error('ws.clientHandler', `Reauth unexpected error for user=${conn.userId}`, err);
    conn.ws.close(CLOSE_CODE_REAUTH_FAILED, 'reauth_failed');
  }
}

function bufferToString(raw: Buffer | ArrayBuffer | Buffer[]): string {
  if (Buffer.isBuffer(raw)) return raw.toString('utf8');
  if (Array.isArray(raw)) return Buffer.concat(raw).toString('utf8');
  return Buffer.from(raw).toString('utf8');
}

// Builds a WebSocketServer configured to negotiate the access_token subprotocol.
// The server.ts upgrade handler uses this instance via wss.handleUpgrade.
export function createClientWss(): WebSocketServer {
  return new WebSocketServer({
    noServer: true,
    handleProtocols: (protocols) => {
      // protocols is a Set<string> — we accept the connection only when the
      // client advertised our subprotocol marker.
      if (protocols.has(SUBPROTOCOL_ACCESS_TOKEN)) return SUBPROTOCOL_ACCESS_TOKEN;
      return false;
    },
  });
}
