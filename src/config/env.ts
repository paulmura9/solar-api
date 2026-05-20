import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

// DEVICE_API_KEY guards the /ws/device endpoint with a static pre-shared secret.
// 32 chars matches a 16-byte random hex token. Below that is brute-forceable.
const MIN_DEVICE_API_KEY_LENGTH = 32;

// Constrains the Pi gateway's announced device identifier to keep log/route
// lookups predictable and prevents stray characters in queries.
const DEVICE_ID_PATTERN = /^[a-z0-9-]{3,64}$/;

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

  // ===== WebSocket: device gateway (/ws/device) =====
  DEVICE_API_KEY: z
    .string()
    .min(MIN_DEVICE_API_KEY_LENGTH, `DEVICE_API_KEY must be at least ${MIN_DEVICE_API_KEY_LENGTH} characters`),
  EXPECTED_DEVICE_ID: z
    .string()
    .regex(DEVICE_ID_PATTERN, 'EXPECTED_DEVICE_ID must match /^[a-z0-9-]{3,64}$/'),

  // Heartbeat is application-layer: the Pi must send a heartbeat envelope.
  // PROTOCOL_PING_* is the WebSocket-frame ping/pong (covers dead TCP).
  // Both layers run together: ping/pong detects dead pipes, heartbeat detects stuck apps.
  WS_HEARTBEAT_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),
  WS_HEARTBEAT_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  PROTOCOL_PING_INTERVAL_MS: z.coerce.number().int().positive().default(20_000),
  PROTOCOL_PING_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

  WS_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(10_000),
  WS_RATE_LIMIT_MAX_MESSAGES: z.coerce.number().int().positive().default(100),

  // ===== WebSocket: client (/ws/client) =====
  // Force a reconnect before the JWT can outlive its 60-minute validity window.
  MAX_TIME_SINCE_REAUTH_MS: z.coerce.number().int().positive().default(55 * 60 * 1000),
  CLIENT_TOKEN_CHECK_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),

  // ===== Idempotency =====
  MESSAGE_DEDUP_CACHE_SIZE: z.coerce.number().int().positive().default(10_000),
  MESSAGE_DEDUP_TTL_MS: z.coerce.number().int().positive().default(60_000),

  // ===== Pi reconnect debounce =====
  // Brief grace before broadcasting "device back online" to UI clients to avoid
  // flapping notifications on flaky connections.
  RECONNECT_GRACE_MS: z.coerce.number().int().nonnegative().default(5_000),

  // ===== Shutdown =====
  GRACEFUL_SHUTDOWN_DRAIN_MS: z.coerce.number().int().positive().default(5_000),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  // logger reads env, so it can't be loaded yet at this point in bootstrap.
  // Falling back to plain stderr is the documented exception.
  console.error('Environment variable validation failed:'); // ok: pre-logger
  console.error(result.error.flatten().fieldErrors); // ok: pre-logger
  process.exit(1);
}

export const env = result.data;

export const corsOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim());
