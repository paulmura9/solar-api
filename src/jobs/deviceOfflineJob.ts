import cron, { type ScheduledTask } from 'node-cron';
import { markStaleDevicesOffline } from '../services/deviceService';
import { logger } from '../utils/logger';
import { env } from '../config/env';

export function startDeviceOfflineJob(): ScheduledTask {
  const intervalSeconds = env.DEVICE_OFFLINE_CHECK_INTERVAL_SECONDS;
  if (intervalSeconds < 1 || intervalSeconds > 59) {
    throw new Error(
      `DEVICE_OFFLINE_CHECK_INTERVAL_SECONDS must be 1..59 seconds (got ${intervalSeconds}); the seconds-field cron "*/n * * * * *" is invalid otherwise`
    );
  }
  const cronExpression = `*/${intervalSeconds} * * * * *`;

  const task = cron.schedule(cronExpression, () => {
    void markStaleDevicesOffline().catch((err: unknown) => {
      logger.error('deviceOfflineJob', 'Job failed unexpectedly', err);
    });
  });

  logger.info('deviceOfflineJob', `Started — cron "${cronExpression}" (every ${intervalSeconds}s)`);
  return task;
}
