import cron, { type ScheduledTask } from 'node-cron';
import { timeoutStaleCommands } from '../services/commandService';
import { logger } from '../utils/logger';
import { env } from '../config/env';

export function startCommandTimeoutJob(): ScheduledTask {
  const intervalSeconds = env.COMMAND_TIMEOUT_CHECK_INTERVAL_SECONDS;
  if (intervalSeconds < 1 || intervalSeconds > 59) {
    throw new Error(
      `COMMAND_TIMEOUT_CHECK_INTERVAL_SECONDS must be 1..59 seconds (got ${intervalSeconds}); the seconds-field cron "*/n * * * * *" is invalid otherwise`
    );
  }
  const cronExpression = `*/${intervalSeconds} * * * * *`;

  const task = cron.schedule(cronExpression, () => {
    void timeoutStaleCommands().catch((err: unknown) => {
      logger.error('commandTimeoutJob', 'Job failed unexpectedly', err);
    });
  });

  logger.info('commandTimeoutJob', `Started — cron "${cronExpression}" (every ${intervalSeconds}s)`);
  return task;
}
