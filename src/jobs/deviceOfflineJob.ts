import cron, { type ScheduledTask } from 'node-cron';
import { markStaleDevicesOffline } from '../services/deviceService';
import { logger } from '../utils/logger';
import { env } from '../config/env';

export function startDeviceOfflineJob(): ScheduledTask {
  const intervalSeconds = env.DEVICE_OFFLINE_CHECK_INTERVAL_SECONDS;
  const cronExpression = `*/${intervalSeconds} * * * * *`;

  const task = cron.schedule(cronExpression, () => {
    void markStaleDevicesOffline().catch((err: unknown) => {
      logger.error('deviceOfflineJob', 'Job failed unexpectedly', err);
    });
  });

  logger.info('deviceOfflineJob', `Started — checking every ${intervalSeconds}s`);
  return task;
}
