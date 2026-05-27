import cron, { type ScheduledTask } from 'node-cron';
import { timeoutStaleCommands } from '../services/commandService';
import { logger } from '../utils/logger';
import { env } from '../config/env';

export function startCommandTimeoutJob(): ScheduledTask {
  const intervalSeconds = env.COMMAND_TIMEOUT_CHECK_INTERVAL_SECONDS;
  const cronExpression = `*/${intervalSeconds} * * * * *`;

  const task = cron.schedule(cronExpression, () => {
    void timeoutStaleCommands().catch((err: unknown) => {
      logger.error('commandTimeoutJob', 'Job failed unexpectedly', err);
    });
  });

  logger.info('commandTimeoutJob', `Started — checking every ${intervalSeconds}s`);
  return task;
}
