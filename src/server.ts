import './config/env';
import http from 'node:http';
import type { ScheduledTask } from 'node-cron';
import app from './app';
import { env } from './config/env';
import { startCommandTimeoutJob } from './jobs/commandTimeoutJob';
import { startDeviceOfflineJob } from './jobs/deviceOfflineJob';
import { startSunScheduleJob } from './jobs/sunScheduleJob';
import { timeoutStaleCommands } from './services/commandService';
import { attachWebSocketServer, shutdownWebSocketServer } from './ws/server';
import { logger } from './utils/logger';

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('server', 'Unhandled promise rejection', reason);
});

process.on('uncaughtException', (err: Error) => {
  logger.error('server', 'Uncaught exception - process will exit', err);

  setTimeout(() => process.exit(1), 100).unref();
});

const httpServer = http.createServer(app);

attachWebSocketServer(httpServer);

const scheduledJobs: ScheduledTask[] = [
  startCommandTimeoutJob(),
  startDeviceOfflineJob(),
  startSunScheduleJob(),
];

httpServer.listen(env.PORT, '0.0.0.0', () => {
  logger.info('server', `LightTrack API listening on port ${env.PORT} [${env.NODE_ENV}] (HTTP + WS)`);

  void timeoutStaleCommands().catch((err) => {
    logger.error('server', 'Startup stuck-command sweep failed', err);
  });
});

let shuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('server', `Received ${signal} — beginning graceful shutdown`);

  for (const job of scheduledJobs) {
    try {
      job.stop();
    } catch (err) {
      logger.error('server', 'Error stopping scheduled job', err);
    }
  }

  try {
    await shutdownWebSocketServer();
  } catch (err) {
    logger.error('server', 'Error during WS shutdown', err);
  }

  await new Promise<void>((resolve) => {
    httpServer.close(() => resolve());

    setTimeout(() => resolve(), env.GRACEFUL_SHUTDOWN_DRAIN_MS).unref();
  });

  logger.info('server', 'Graceful shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
