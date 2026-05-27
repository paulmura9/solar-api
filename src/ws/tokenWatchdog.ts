import { env } from '../config/env';
import { logger } from '../utils/logger';
import { clientRegistry } from './clientRegistry';

let intervalId: NodeJS.Timeout | null = null;

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
      } catch (err) {
        logger.debug('ws.tokenWatchdog', `Close after reauth_required failed for ${conn.userId}`, err);
      }
    }
  }
}
