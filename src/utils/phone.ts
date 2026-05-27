import { ApiError } from './api-error';

// Normalize a Ghana phone number to E.164 (+233XXXXXXXXX).
//
//   +233244111222   ->  +233244111222   (already E.164)
//    233244111222   ->  +233244111222   (E.164 sans plus)
//    0244111222     ->  +233244111222   (local with leading 0)
//    244111222      ->  +233244111222   (bare 9-digit subscriber)
//
// Spaces, dashes, and parentheses are stripped before matching, so
// "+233 244 111 222" or "(024) 411-1222" normalize too.
//
// Throws ApiError.badRequest on input that isn't recognisably Ghanaian so
// the central error middleware returns a clean 400 to web clients and the
// USSD controller's catch falls through to its plain-text END fallback.
export function normalizeGhPhone(raw: string | null | undefined): string {
  if (!raw) throw ApiError.badRequest('phone is required');
  const cleaned = raw.replace(/[\s\-()]/g, '');
  if (/^\+233\d{9}$/.test(cleaned)) return cleaned;
  if (/^233\d{9}$/.test(cleaned)) return `+${cleaned}`;
  if (/^0\d{9}$/.test(cleaned)) return `+233${cleaned.slice(1)}`;
  if (/^\d{9}$/.test(cleaned)) return `+233${cleaned}`;
  throw ApiError.badRequest(`Invalid Ghana phone number: ${raw}`);
}
