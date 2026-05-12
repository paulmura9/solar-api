import cron from 'node-cron';
import { fetchAndCacheSunSchedule } from '../services/openMeteo';
import { logger } from '../utils/logger';

export function startSunScheduleJob(): void {
  cron.schedule('0 5 * * *', async () => {
    logger.info('sunScheduleJob', 'Running daily sun schedule fetch');
    try {
      await fetchAndCacheSunSchedule();
      logger.info('sunScheduleJob', 'Sun schedule updated successfully');
    } catch (err) {
      logger.error('sunScheduleJob', 'Failed to fetch sun schedule from Open-Meteo', err);
    }
  });

  logger.info('sunScheduleJob', 'Scheduled — runs daily at 05:00');
}
