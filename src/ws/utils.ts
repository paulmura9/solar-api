import type { ZodSchema } from 'zod';
import { logger } from '../utils/logger';

export function bufferToString(raw: Buffer | ArrayBuffer | Buffer[]): string {
  if (Buffer.isBuffer(raw)) return raw.toString('utf8');
  if (Array.isArray(raw)) return Buffer.concat(raw).toString('utf8');
  return Buffer.from(raw).toString('utf8');
}

export type ParseResult<T> = { ok: true; data: T } | { ok: false; reason: string };

export function parseOr<T>(
  schema: ZodSchema<T>,
  payload: unknown,
  ctx: string,
): ParseResult<T> {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const reason = result.error.issues[0]?.message ?? 'unknown';
    logger.warn('ws.deviceHandler', `${ctx} payload invalid: ${reason}`);
    return { ok: false, reason };
  }
  return { ok: true, data: result.data };
}
