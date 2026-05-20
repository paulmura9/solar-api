import { LRUCache } from 'lru-cache';
import { env } from '../config/env';

// Idempotency cache for device-originated messages, keyed by envelope.id.
//
// Why this is needed:
//   - The Pi may retry a send after a transient WebSocket write failure.
//   - During reconnect+sync, queued telemetry can race with the live stream.
// Bounded by size (LRU) AND time (TTL): bounded memory + we don't dedup forever.
const cache = new LRUCache<string, true>({
  max: env.MESSAGE_DEDUP_CACHE_SIZE,
  ttl: env.MESSAGE_DEDUP_TTL_MS,
});

// Returns true if the id had not been seen, false if it was a duplicate.
// On `true`, the caller proceeds with handling.
export function checkAndRecord(messageId: string): boolean {
  if (cache.has(messageId)) {
    return false;
  }
  cache.set(messageId, true);
  return true;
}
