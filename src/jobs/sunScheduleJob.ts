import cron, { type ScheduledTask } from 'node-cron';
import { fetchAndCacheSunSchedule } from '../services/openMeteo';
import { logger } from '../utils/logger';

export function startSunScheduleJob(): ScheduledTask {
  const task = cron.schedule('0 5 * * *', () => {
    logger.info('sunScheduleJob', 'Running daily sun schedule fetch');
    void fetchAndCacheSunSchedule()
      .then(() => logger.info('sunScheduleJob', 'Sun schedule updated successfully'))
      .catch((err: unknown) => {
        logger.error('sunScheduleJob', 'Failed to fetch sun schedule from Open-Meteo', err);
      });
  });

  logger.info('sunScheduleJob', 'Scheduled — runs daily at 05:00');
  return task;
}
