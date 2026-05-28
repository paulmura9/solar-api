import cron, { type ScheduledTask } from 'node-cron';
import { logger } from '../utils/logger';

interface SecondsIntervalJobOptions {
  envName: string;
  intervalSeconds: number;
  context: string;
  work: () => Promise<void>;
}

export function createSecondsIntervalJob(opts: SecondsIntervalJobOptions): ScheduledTask {
  const { envName, intervalSeconds, context, work } = opts;
  if (intervalSeconds < 1 || intervalSeconds > 59) {
    throw new Error(
      `${envName} must be 1..59 seconds (got ${intervalSeconds}); the seconds-field cron "*/n * * * * *" is invalid otherwise`
    );
  }
  const cronExpression = `*/${intervalSeconds} * * * * *`;

  const task = cron.schedule(cronExpression, () => {
    void work().catch((err: unknown) => {
      logger.error(context, 'Job failed unexpectedly', err);
    });
  });

  logger.info(context, `Started — cron "${cronExpression}" (every ${intervalSeconds}s)`);
  return task;
}
