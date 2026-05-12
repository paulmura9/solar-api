import { z } from 'zod';
import { VISION_DEFAULT_LIMIT } from '../utils/constants';

export const visionHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(VISION_DEFAULT_LIMIT),
  start_date: z.string().date().optional(),
  end_date: z.string().date().optional(),
});
