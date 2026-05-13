import { z } from 'zod';
import { EVENTS_DEFAULT_LIMIT, EVENTS_MAX_LIMIT } from '../utils/constants';

export const eventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(EVENTS_MAX_LIMIT).default(EVENTS_DEFAULT_LIMIT),
  severity: z.string().optional(),
});
