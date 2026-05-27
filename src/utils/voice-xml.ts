// Tiny XML builders for the Africa's Talking Voice contract (§8.5).
//
// AT expects a single <Response> root containing one or more actions in the
// order they should execute. We keep these as pure string functions — no
// runtime dependency on an XML library — because:
//   1. The action surface is small (Say, Play, GetDigits, Dial).
//   2. Every action is server-authored — no untrusted markup ever flows in,
//      so we only need to escape text values, not full document parsing.
//   3. Pure functions trivially unit-test and serialise to the wire as-is.
//
// Anything user-derived (recommendation strings, phone numbers, URLs) MUST
// go through escapeXml before landing inside an attribute or text node.

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

function escapeXml(input: string): string {
  return input.replace(/[&<>"']/g, (c) => ESCAPES[c]!);
}

export interface SayOptions {
  // AT supports voice="man" | "woman". Default to woman for the demo —
  // matches the sample in §8.5 and tests well on phone-grade audio.
  voice?: 'man' | 'woman';
  playBeep?: boolean;
}

export function say(text: string, opts: SayOptions = {}): string {
  const voice = opts.voice ?? 'woman';
  const beep = opts.playBeep ? ' playBeep="true"' : '';
  return `<Say voice="${voice}"${beep}>${escapeXml(text)}</Say>`;
}

export function play(url: string): string {
  return `<Play url="${escapeXml(url)}"/>`;
}

export interface GetDigitsOptions {
  // Where AT POSTs the captured digit. Use a full https:// URL in prod;
  // a same-origin path works for our simulator + AT both.
  callbackUrl: string;
  timeoutSeconds?: number;
  finishOnKey?: string;
  numDigits?: number;
}

// Wraps one or more child actions (typically a Say or Play) and turns the
// resulting prompt into a digit-capturing interaction. The captured key
// arrives at callbackUrl as `dtmfDigits` on the next POST body.
export function getDigits(child: string, opts: GetDigitsOptions): string {
  const attrs = [
    `callbackUrl="${escapeXml(opts.callbackUrl)}"`,
    `timeout="${opts.timeoutSeconds ?? 20}"`,
    `finishOnKey="${escapeXml(opts.finishOnKey ?? '#')}"`,
    opts.numDigits != null ? `numDigits="${opts.numDigits}"` : null,
  ]
    .filter(Boolean)
    .join(' ');
  return `<GetDigits ${attrs}>${child}</GetDigits>`;
}

export interface DialOptions {
  // Comma-separated already, OR an array — we accept both for convenience.
  phoneNumbers: string | string[];
  record?: boolean;
  // AT caps at 14400s (4h). 600s (10 min) is plenty for a CHW triage call
  // and prevents a hung bridge from racking up cost.
  maxDurationSeconds?: number;
  ringbackTone?: string;
}

export function dial(opts: DialOptions): string {
  const phones = Array.isArray(opts.phoneNumbers)
    ? opts.phoneNumbers.join(',')
    : opts.phoneNumbers;
  const attrs = [
    `phoneNumbers="${escapeXml(phones)}"`,
    opts.record ? 'record="true"' : null,
    opts.maxDurationSeconds != null
      ? `maxDuration="${opts.maxDurationSeconds}"`
      : null,
    opts.ringbackTone ? `ringbackTone="${escapeXml(opts.ringbackTone)}"` : null,
  ]
    .filter(Boolean)
    .join(' ');
  return `<Dial ${attrs}/>`;
}

// Wrap one or more action strings in the AT <Response> envelope. The XML
// declaration is required by AT's parser.
export function response(...children: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>${children.join('')}</Response>`;
}
