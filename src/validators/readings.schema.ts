import { z } from 'zod';
import { HISTORY_DEFAULT_LIMIT, HISTORY_MAX_LIMIT, HISTORY_HOURS_MAX } from '../utils/constants';

export const readingHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(HISTORY_MAX_LIMIT).default(HISTORY_DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
  start_date: z.string().date().optional(),
  end_date: z.string().date().optional(),
  hours: z.coerce.number().int().min(1).max(HISTORY_HOURS_MAX).optional(),
});

export const readingStatsQuerySchema = z.object({
  hours: z.coerce.number().int().min(1).max(720).default(24),
});
