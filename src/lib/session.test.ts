import { describe, expect, it } from 'vitest'
import { daysUntilExpiry, evaluateSession, isSessionExpired } from './session'

const DAY = 86_400_000
const NOW = 1_800_000_000_000

describe('30-day session expiry', () => {
  it('keeps a session active in-window', () => {
    expect(evaluateSession(NOW - 29 * DAY, NOW)).toBe('valid')
  })

  it('expires a session past 30 days', () => {
    expect(evaluateSession(NOW - 31 * DAY, NOW)).toBe('expired')
  })

  it('does not expire exactly at the boundary', () => {
    // Strictly greater than the window, so day 30 is still a valid session.
    expect(evaluateSession(NOW - 30 * DAY, NOW)).toBe('valid')
    expect(evaluateSession(NOW - 30 * DAY - 1, NOW)).toBe('expired')
  })

  it('keeps a session with a just-stamped timestamp', () => {
    expect(evaluateSession(NOW, NOW)).toBe('valid')
  })

  it('does not sign anyone out over clock skew', () => {
    expect(evaluateSession(NOW + 5 * DAY, NOW)).toBe('valid')
  })

  it('reports unknown — never expired — when there is no timestamp', () => {
    // Our own missing data must not cost a user their session.
    expect(evaluateSession(undefined, NOW)).toBe('unknown')
    expect(evaluateSession(null, NOW)).toBe('unknown')
    expect(evaluateSession(NaN, NOW)).toBe('unknown')
    expect(isSessionExpired(undefined, NOW)).toBe(false)
  })
})

describe('daysUntilExpiry', () => {
  it('counts down whole days', () => {
    expect(daysUntilExpiry(NOW, NOW)).toBe(30)
    expect(daysUntilExpiry(NOW - 10 * DAY, NOW)).toBe(20)
  })

  it('floors at zero rather than going negative', () => {
    expect(daysUntilExpiry(NOW - 40 * DAY, NOW)).toBe(0)
  })

  it('has nothing to report without a timestamp', () => {
    expect(daysUntilExpiry(null, NOW)).toBeNull()
  })
})
