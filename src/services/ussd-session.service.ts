import type { ApiLang } from '../i18n/risk-strings';

// In-memory session store per §6/§7. Sessions are seconds long in practice
// (AT closes the USSD channel after each round-trip if no activity), so a
// Map is plenty. Redis is the documented scale path; NOT built — replacing
// this module's exports with a Redis client later is a drop-in swap.

export interface UssdSession {
  lang: ApiLang;
  updatedAt: number;
}

// 5 minutes is way longer than a real USSD session would ever last; this
// is mostly a safety floor so abandoned sessions don't accumulate forever.
const TTL_MS = 5 * 60 * 1000;

const store = new Map<string, UssdSession>();

export function get(sessionId: string): UssdSession | undefined {
  const s = store.get(sessionId);
  if (!s) return undefined;
  if (Date.now() - s.updatedAt > TTL_MS) {
    store.delete(sessionId);
    return undefined;
  }
  return s;
}

export function set(sessionId: string, data: Omit<UssdSession, 'updatedAt'>): void {
  store.set(sessionId, { ...data, updatedAt: Date.now() });
}

export function clear(sessionId: string): void {
  store.delete(sessionId);
}

// Mostly for tests / introspection during the demo.
export function size(): number {
  return store.size;
}
