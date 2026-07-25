/**
 * 30-day session expiry.
 *
 * Firebase's `browserLocalPersistence` keeps a user signed in forever — there
 * is no native "expire after N days". So we implement it: `lastActiveAt` is
 * stamped on the user doc at every session start, and checked here on boot by
 * the root route's `beforeLoad` guard and the AuthProvider.
 *
 * The decision function is pure and separately tested, because "silently
 * signed out" and "silently signed in forever" are both bad failure modes and
 * neither is easy to notice by hand.
 */

import { SESSION_MAX_AGE_MS } from './env'

export type SessionVerdict = 'valid' | 'expired' | 'unknown'

/**
 * `unknown` means we have no `lastActiveAt` to judge by — a brand-new user
 * doc, or a doc written before this field existed. We keep them signed in and
 * stamp the field; expiring someone because of our own missing data is worse
 * than the extra day of session.
 */
export function evaluateSession(
  lastActiveAt: number | null | undefined,
  now: number = Date.now(),
  maxAgeMs: number = SESSION_MAX_AGE_MS,
): SessionVerdict {
  if (typeof lastActiveAt !== 'number' || !Number.isFinite(lastActiveAt)) return 'unknown'
  // A clock-skewed future timestamp is not an expiry.
  if (lastActiveAt > now) return 'valid'
  return now - lastActiveAt > maxAgeMs ? 'expired' : 'valid'
}

export function isSessionExpired(
  lastActiveAt: number | null | undefined,
  now: number = Date.now(),
  maxAgeMs: number = SESSION_MAX_AGE_MS,
): boolean {
  return evaluateSession(lastActiveAt, now, maxAgeMs) === 'expired'
}

/** Whole days left before the session lapses — shown in Settings, honestly. */
export function daysUntilExpiry(
  lastActiveAt: number | null | undefined,
  now: number = Date.now(),
  maxAgeMs: number = SESSION_MAX_AGE_MS,
): number | null {
  if (typeof lastActiveAt !== 'number' || !Number.isFinite(lastActiveAt)) return null
  const remaining = maxAgeMs - (now - lastActiveAt)
  return Math.max(0, Math.ceil(remaining / 86_400_000))
}
