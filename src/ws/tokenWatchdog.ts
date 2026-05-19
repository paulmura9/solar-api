import { env } from '../config/env';
import { logger } from '../utils/logger';
import { clientRegistry } from './clientRegistry';

// Supabase JWTs are valid for ~1 hour. The WebSocket handshake authenticates
// once; without periodic revalidation, a revoked or expired token would hold
// a connection forever. This watchdog forces clients to reauth before their
// JWT expires by closing connections that haven't reauthenticated recently.
//
// The frontend should refresh its token (Supabase's refresh flow) and send a
// reauth message at roughly half the MAX_TIME_SINCE_REAUTH_MS interval.

let intervalId: NodeJS.Timeout | null = null;

// Close code 4001 is in the application-specific range (4000-4999).
// Clients should treat this as "reconnect with a fresh token".
const CLOSE_CODE_REAUTH_REQUIRED = 4001;

export function startClientTokenWatchdog(): void {
  if (intervalId !== null) return;
  intervalId = setInterval(() => {
    tick();
  }, env.CLIENT_TOKEN_CHECK_INTERVAL_MS);
  intervalId.unref();
  logger.info(
    'ws.tokenWatchdog',
    `Started — check every ${env.CLIENT_TOKEN_CHECK_INTERVAL_MS}ms, max age ${env.MAX_TIME_SINCE_REAUTH_MS}ms`
  );
}

export function stopClientTokenWatchdog(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function tick(): void {
  const now = Date.now();
  const cutoff = now - env.MAX_TIME_SINCE_REAUTH_MS;
  for (const conn of clientRegistry.all()) {
    if (conn.lastReauthAt < cutoff) {
      logger.info('ws.tokenWatchdog', `Forcing disconnect of stale-token client ${conn.userId}`);
      try {
        conn.ws.close(CLOSE_CODE_REAUTH_REQUIRED, 'reauth_required');
      } catch {
        // Socket already broken — close handler will clean up registry.
      }
    }
  }
}
