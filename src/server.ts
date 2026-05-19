import './config/env';
import http from 'node:http';
import app from './app';
import { env } from './config/env';
import { startCommandTimeoutJob } from './jobs/commandTimeoutJob';
import { startDeviceOfflineJob } from './jobs/deviceOfflineJob';
import { startSunScheduleJob } from './jobs/sunScheduleJob';
import { attachWebSocketServer, shutdownWebSocketServer } from './ws/server';
import { logger } from './utils/logger';

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('server', 'Unhandled promise rejection', reason);
});

process.on('uncaughtException', (err: Error) => {
  logger.error('server', 'Uncaught exception - process will exit', err);
  // Allow stderr to flush before terminating. Railway restarts the container automatically.
  setTimeout(() => process.exit(1), 100).unref();
});

const httpServer = http.createServer(app);

attachWebSocketServer(httpServer);

startCommandTimeoutJob();
startDeviceOfflineJob();
startSunScheduleJob();

httpServer.listen(env.PORT, '0.0.0.0', () => {
  logger.info('server', `LightTrack API listening on port ${env.PORT} [${env.NODE_ENV}] (HTTP + WS)`);
});

let shuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('server', `Received ${signal} — beginning graceful shutdown`);

  // Drain WebSocket connections first (notifies clients, closes sockets) so
  // that http.Server.close() can settle without hanging on upgraded sockets.
  try {
    await shutdownWebSocketServer();
  } catch (err) {
    logger.error('server', 'Error during WS shutdown', err);
  }

  await new Promise<void>((resolve) => {
    httpServer.close(() => resolve());
    // Hard cap: don't sit forever waiting on slow-draining HTTP requests.
    setTimeout(() => resolve(), env.GRACEFUL_SHUTDOWN_DRAIN_MS).unref();
  });

  logger.info('server', 'Graceful shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
