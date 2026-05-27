import type { ApiLang } from '../i18n/risk-strings';

// In-memory voice session store — direct sibling of ussd-session.service.
// A voice call is much longer than a USSD session (a caller might take 30s
// to listen to a prompt and press a digit) so the TTL is more meaningful
// here, but the surface is identical so swapping to Redis later is one
// import change in both files.

export interface VoiceSession {
  lang: ApiLang;
  updatedAt: number;
}

// 5 min covers a slow caller who pauses between prompts. AT will tear down
// the leg long before this if the line drops; the TTL is a safety floor
// against the Map growing unbounded under abandoned calls.
const TTL_MS = 5 * 60 * 1000;

const store = new Map<string, VoiceSession>();

export function get(sessionId: string): VoiceSession | undefined {
  const s = store.get(sessionId);
  if (!s) return undefined;
  if (Date.now() - s.updatedAt > TTL_MS) {
    store.delete(sessionId);
    return undefined;
  }
  return s;
}

export function set(
  sessionId: string,
  data: Omit<VoiceSession, 'updatedAt'>,
): void {
  store.set(sessionId, { ...data, updatedAt: Date.now() });
}

export function clear(sessionId: string): void {
  store.delete(sessionId);
}

export function size(): number {
  return store.size;
}
