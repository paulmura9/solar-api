import { LRUCache } from 'lru-cache';
import { env } from '../config/env';

const cache = new LRUCache<string, true>({
  max: env.MESSAGE_DEDUP_CACHE_SIZE,
  ttl: env.MESSAGE_DEDUP_TTL_MS,
});

export function checkAndRecord(messageId: string): boolean {
  if (cache.has(messageId)) {
    return false;
  }
  cache.set(messageId, true);
  return true;
}
