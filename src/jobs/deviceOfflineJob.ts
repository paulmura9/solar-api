import { type ScheduledTask } from 'node-cron';
import { markStaleDevicesOffline } from '../services/deviceService';
import { env } from '../config/env';
import { createSecondsIntervalJob } from './intervalJob';

export function startDeviceOfflineJob(): ScheduledTask {
  return createSecondsIntervalJob({
    envName: 'DEVICE_OFFLINE_CHECK_INTERVAL_SECONDS',
    intervalSeconds: env.DEVICE_OFFLINE_CHECK_INTERVAL_SECONDS,
    context: 'deviceOfflineJob',
    work: markStaleDevicesOffline,
  });
}
