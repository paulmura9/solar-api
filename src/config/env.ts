import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),

  CORS_ORIGIN: z.string().min(1, 'CORS_ORIGIN is required'),

  LOCATION_LAT: z.coerce.number().min(-90).max(90),
  LOCATION_LON: z.coerce.number().min(-180).max(180),

  SUPABASE_STORAGE_BUCKET: z.string().default('panel-images'),

  COMMAND_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(10),
  COMMAND_TIMEOUT_CHECK_INTERVAL_SECONDS: z.coerce.number().int().positive().default(30),
  DEVICE_OFFLINE_AFTER_SECONDS: z.coerce.number().int().positive().default(90),
  DEVICE_OFFLINE_CHECK_INTERVAL_SECONDS: z.coerce.number().int().positive().default(30),

  FRONTEND_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  FRONTEND_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('Environment variable validation failed:');
  console.error(result.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = result.data;

export const corsOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim());
