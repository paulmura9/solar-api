import cron from 'node-cron';
import { timeoutStaleCommands } from '../services/commandService';
import { logger } from '../utils/logger';
import { env } from '../config/env';

export function startCommandTimeoutJob(): void {
  const intervalSeconds = env.COMMAND_TIMEOUT_CHECK_INTERVAL_SECONDS;
  const cronExpression = `*/${intervalSeconds} * * * * *`;

  cron.schedule(cronExpression, async () => {
    try {
      await timeoutStaleCommands();
    } catch (err) {
      logger.error('commandTimeoutJob', 'Job failed unexpectedly', err);
    }
  });

  logger.info('commandTimeoutJob', `Started — checking every ${intervalSeconds}s`);
}
