import { z } from 'zod';
import { EVENTS_DEFAULT_LIMIT, EVENTS_MAX_LIMIT, SEVERITIES } from '../utils/constants';

export const eventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(EVENTS_MAX_LIMIT).default(EVENTS_DEFAULT_LIMIT),
  severity: z.string().optional(),
});

export const insertEventSchema = z.object({
  event_type: z.string().min(1).max(50),
  severity: z.enum(SEVERITIES),
  message: z.string().min(1),
});
