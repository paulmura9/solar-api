import { z } from 'zod';
import { EVENTS_DEFAULT_LIMIT, EVENTS_MAX_LIMIT, SEVERITIES } from '../utils/constants';

export const eventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(EVENTS_MAX_LIMIT).default(EVENTS_DEFAULT_LIMIT),
  severity: z.string().optional().refine(
    (val) => {
      if (val === undefined) return true;
      return val.split(',').every((s) => (SEVERITIES as readonly string[]).includes(s.trim()));
    },
    { message: `Each severity must be one of: ${SEVERITIES.join(', ')}` }
  ),
});
