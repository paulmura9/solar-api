import { type ScheduledTask } from 'node-cron';
import { timeoutStaleCommands } from '../services/commandService';
import { env } from '../config/env';
import { createSecondsIntervalJob } from './intervalJob';

export function startCommandTimeoutJob(): ScheduledTask {
  return createSecondsIntervalJob({
    envName: 'COMMAND_TIMEOUT_CHECK_INTERVAL_SECONDS',
    intervalSeconds: env.COMMAND_TIMEOUT_CHECK_INTERVAL_SECONDS,
    context: 'commandTimeoutJob',
    work: timeoutStaleCommands,
  });
}
