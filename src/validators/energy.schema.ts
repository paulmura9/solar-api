import { z } from 'zod';

export const energyQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(30).default(7),
});

export const dirtImpactQuerySchema = energyQuerySchema;
