import './config/env';
import app from './app';
import { env } from './config/env';
import { startCommandTimeoutJob } from './jobs/commandTimeoutJob';
import { startDeviceOfflineJob } from './jobs/deviceOfflineJob';
import { startSunScheduleJob } from './jobs/sunScheduleJob';
import { logger } from './utils/logger';

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('server', 'Unhandled promise rejection', reason);
});

process.on('uncaughtException', (err: Error) => {
  logger.error('server', 'Uncaught exception - process will exit', err);
  // Allow stderr to flush before terminating. Railway restarts the container automatically.
  setTimeout(() => process.exit(1), 100).unref();
});

startCommandTimeoutJob();
startDeviceOfflineJob();
startSunScheduleJob();

app.listen(env.PORT, '0.0.0.0', () => {
  logger.info('server', `LightTrack API listening on port ${env.PORT} [${env.NODE_ENV}]`);
});