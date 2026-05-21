import crypto from 'node:crypto';
import { Request, Response, NextFunction, RequestHandler } from 'express';
import type { CacheDirective } from '../config/cachePolicy';
import { logger } from '../utils/logger';

const SUCCESS_STATUS_MIN = 200;
const SUCCESS_STATUS_MAX = 299;
const NOT_MODIFIED_STATUS = 304;
const VARY_HEADER_VALUE = 'Authorization';
const NO_STORE = 'no-store';

function buildCacheControl(directive: CacheDirective): string {
  const scope = directive.isPrivate ? 'private' : 'public';
  return `${scope}, max-age=${directive.maxAge}, stale-while-revalidate=${directive.staleWhileRevalidate}`;
}

function appendVary(res: Response, value: string): void {
  const existing = res.getHeader('Vary');
  if (existing === undefined) {
    res.setHeader('Vary', value);
    return;
  }
  const existingStr = Array.isArray(existing) ? existing.join(', ') : String(existing);
  const tokens = existingStr.split(',').map((t) => t.trim().toLowerCase());
  if (tokens.includes(value.toLowerCase())) return;
  res.setHeader('Vary', `${existingStr}, ${value}`);
}

function clientRequestedNoCache(req: Request): boolean {
  const header = req.headers['cache-control'];
  if (typeof header !== 'string') return false;
  return header
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .includes('no-cache');
}

function computeWeakETag(serialized: string): string | null {
  try {
    const hash = crypto.createHash('sha1').update(serialized).digest('hex');
    return `W/"${hash}"`;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    logger.warn('cacheHeaders', `ETag hashing failed, skipping: ${message}`);
    return null;
  }
}

function extractMaxUpdatedAt(body: unknown): string | null {
  if (body === null || typeof body !== 'object') return null;
  const root = body as Record<string, unknown>;
  const candidates: unknown[] = [];
  const data = root['data'];
  if (Array.isArray(data)) {
    for (const item of data) {
      if (item !== null && typeof item === 'object' && 'updated_at' in item) {
        candidates.push((item as Record<string, unknown>)['updated_at']);
      }
    }
  } else if (data !== null && typeof data === 'object' && 'updated_at' in data) {
    candidates.push((data as Record<string, unknown>)['updated_at']);
  }
  if ('updated_at' in root) candidates.push(root['updated_at']);

  let maxTime = -Infinity;
  for (const value of candidates) {
    if (typeof value !== 'string') continue;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && parsed > maxTime) maxTime = parsed;
  }
  if (maxTime === -Infinity) return null;
  return new Date(maxTime).toUTCString();
}

export function noStore(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control', NO_STORE);
  next();
}

export function withCacheHeaders(directive: CacheDirective): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const originalJson = res.json.bind(res);

    res.json = (body?: unknown): Response => {
      const status = res.statusCode;
      const isSuccess = status >= SUCCESS_STATUS_MIN && status <= SUCCESS_STATUS_MAX;

      if (!isSuccess) {
        res.setHeader('Cache-Control', NO_STORE);
        return originalJson(body);
      }

      if (clientRequestedNoCache(req)) {
        res.setHeader('Cache-Control', NO_STORE);
        return originalJson(body);
      }

      res.setHeader('Cache-Control', buildCacheControl(directive));
      appendVary(res, VARY_HEADER_VALUE);

      const lastModified = extractMaxUpdatedAt(body);
      if (lastModified !== null) {
        res.setHeader('Last-Modified', lastModified);
      }

      let serialized: string | undefined;
      try {
        serialized = JSON.stringify(body);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown';
        logger.warn('cacheHeaders', `Body serialization failed, skipping ETag: ${message}`);
      }

      if (typeof serialized === 'string') {
        const etag = computeWeakETag(serialized);
        if (etag !== null) {
          res.setHeader('ETag', etag);
          const ifNoneMatch = req.headers['if-none-match'];
          if (typeof ifNoneMatch === 'string' && ifNoneMatch === etag) {
            res.status(NOT_MODIFIED_STATUS);
            return res.end();
          }
        }
      }

      return originalJson(body);
    };

    next();
  };
}
