import { env } from '../config/env';

export interface RateLimitState {
  windowStart: number;
  count: number;
}

export function createRateLimitState(): RateLimitState {
  return { windowStart: Date.now(), count: 0 };
}

export function checkRateLimit(state: RateLimitState): boolean {
  const now = Date.now();
  const windowMs = env.WS_RATE_LIMIT_WINDOW_MS;
  const maxMessages = env.WS_RATE_LIMIT_MAX_MESSAGES;

  if (now - state.windowStart > windowMs) {
    state.windowStart = now;
    state.count = 1;
    return true;
  }

  state.count++;
  return state.count <= maxMessages;
}
