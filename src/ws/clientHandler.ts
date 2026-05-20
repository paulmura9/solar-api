import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import { clientRegistry, type ClientConnection } from './clientRegistry';
import {
  clientIncomingEnvelopeSchema,
  clientReauthPayloadSchema,
  type ClientIncomingEnvelope,
  type ServerOutboundEnvelope,
} from './schemas';

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
    logger.error('ws.clientHandler', `Client socket error for user=${userId}`, err);
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

    logger.warn('ws.clientHandler', `Invalid JSON from user=${conn.userId}`);
    return;
  }

  const envelopeResult = clientIncomingEnvelopeSchema.safeParse(parsed);
  if (!envelopeResult.success) {
    logger.warn(
      'ws.clientHandler',
      `Invalid envelope from user=${conn.userId}: ${envelopeResult.error.issues[0]?.message ?? 'unknown'}`
    );
    return;
  }

  const envelope: ClientIncomingEnvelope = envelopeResult.data;
  await dispatchEnvelope(conn, envelope);
}

async function dispatchEnvelope(conn: ClientConnection, envelope: ClientIncomingEnvelope): Promise<void> {
  switch (envelope.type) {
    case 'reauth':
      await handleReauth(conn, envelope.payload);
      return;
    default: {

      const _exhaustive: never = envelope.type;
      void _exhaustive;
    }
  }
}

async function handleReauth(conn: ClientConnection, payload: unknown): Promise<void> {
  const payloadResult = clientReauthPayloadSchema.safeParse(payload);
  if (!payloadResult.success) {
    logger.warn('ws.clientHandler', `reauth payload invalid from user=${conn.userId}`);
    conn.ws.close(CLOSE_CODE_REAUTH_FAILED, 'reauth_failed');
    return;
  }
  const { token } = payloadResult.data;

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      logger.warn('ws.clientHandler', `Reauth failed for user=${conn.userId}`);
      conn.ws.close(CLOSE_CODE_REAUTH_FAILED, 'reauth_failed');
      return;
    }

    if (data.user.id !== conn.userId) {

      logger.warn(
        'ws.clientHandler',
        `Reauth identity mismatch: connection=${conn.userId} token=${data.user.id}`
      );
      conn.ws.close(CLOSE_CODE_IDENTITY_CHANGED, 'identity_changed');
      return;
    }

    conn.lastReauthAt = Date.now();
    const ack: ServerOutboundEnvelope = {
      v: 1,
      type: 'reauth_ok',
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      payload: {},
    };
    conn.ws.send(JSON.stringify(ack));
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

export function createClientWss(): WebSocketServer {
  return new WebSocketServer({
    noServer: true,
    handleProtocols: (protocols) => {

      if (protocols.has(SUBPROTOCOL_ACCESS_TOKEN)) return SUBPROTOCOL_ACCESS_TOKEN;
      return false;
    },
  });
}
