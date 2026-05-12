import { Request, Response } from 'express';
import { getTodaySunSchedule, getWeekSunSchedule, fetchAndCacheSunSchedule } from '../services/openMeteo';
import { HttpError } from '../utils/httpError';
import { logger } from '../utils/logger';

export async function getSunToday(_req: Request, res: Response): Promise<void> {
  let schedule = await getTodaySunSchedule();

  if (!schedule) {
    try {
      await fetchAndCacheSunSchedule();
      schedule = await getTodaySunSchedule();
    } catch (err) {
      logger.error('sun.controller', 'Open-Meteo fetch failed', err);
      throw new HttpError(502, 'Sun schedule unavailable — Open-Meteo unreachable and no cached data');
    }
  }

  if (!schedule) {
    throw new HttpError(502, 'Sun schedule unavailable');
  }

  res.json({ data: schedule, timestamp: new Date().toISOString() });
}

export async function getSunWeek(_req: Request, res: Response): Promise<void> {
  const data = await getWeekSunSchedule();
  res.json({ data, timestamp: new Date().toISOString() });
}
