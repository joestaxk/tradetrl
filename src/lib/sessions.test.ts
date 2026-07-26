import { describe, expect, it } from 'vitest'
import {
  macroFor,
  overlappingWindows,
  sessionFor,
  sessionLabelFor,
  sessionWindowsOf,
  windowLength,
  withinWindow,
} from './sessions'
import { DEFAULT_SESSION_WINDOWS, type SessionWindow } from './types'
import { makePrefs } from '#/test/factories'

const WINDOWS: SessionWindow[] = [
  { id: 'asia', name: 'Asia', start: '00:00', end: '07:00' },
  {
    id: 'london',
    name: 'London',
    start: '07:00',
    end: '12:00',
    macros: [{ id: 'lo', name: 'London open', start: '07:00', end: '09:00' }],
  },
  {
    id: 'ny',
    name: 'New York',
    start: '12:00',
    end: '21:00',
    macros: [{ id: 'ny-macro', name: 'NY macro', start: '14:50', end: '15:10' }],
  },
]

describe('withinWindow', () => {
  it('handles an ordinary window', () => {
    expect(withinWindow('09:00', '08:00', '17:00')).toBe(true)
    expect(withinWindow('07:59', '08:00', '17:00')).toBe(false)
  })

  it('includes both ends', () => {
    expect(withinWindow('08:00', '08:00', '17:00')).toBe(true)
    expect(withinWindow('17:00', '08:00', '17:00')).toBe(true)
  })

  it('handles a window that wraps past midnight', () => {
    // The Asia trader's real case.
    expect(withinWindow('23:30', '22:00', '06:00')).toBe(true)
    expect(withinWindow('02:00', '22:00', '06:00')).toBe(true)
    expect(withinWindow('12:00', '22:00', '06:00')).toBe(false)
  })

  it('rejects unparseable input rather than guessing', () => {
    expect(withinWindow('nonsense', '08:00', '17:00')).toBe(false)
  })
})

describe('windowLength', () => {
  it('measures a normal window', () => {
    expect(windowLength({ start: '08:00', end: '17:00' })).toBe(540)
  })

  it('measures across midnight', () => {
    expect(windowLength({ start: '22:00', end: '06:00' })).toBe(480)
  })
})

describe('sessionFor', () => {
  it('places a time in the right session', () => {
    expect(sessionFor('02:30', WINDOWS)?.name).toBe('Asia')
    expect(sessionFor('08:30', WINDOWS)?.name).toBe('London')
    expect(sessionFor('14:00', WINDOWS)?.name).toBe('New York')
  })

  it('returns null with no time to place', () => {
    expect(sessionFor(undefined, WINDOWS)).toBeNull()
  })

  it('returns null when nothing covers it', () => {
    expect(sessionFor('22:30', WINDOWS)).toBeNull()
  })

  it('prefers the narrower window when two overlap', () => {
    // Someone who drew a tighter window meant it.
    const overlapping: SessionWindow[] = [
      { id: 'wide', name: 'Whole day', start: '00:00', end: '23:59' },
      { id: 'tight', name: 'London open', start: '07:00', end: '09:00' },
    ]
    expect(sessionFor('08:00', overlapping)?.name).toBe('London open')
  })
})

describe('macros', () => {
  it('finds the macro a trade landed in', () => {
    const hit = macroFor('15:00', WINDOWS)
    expect(hit?.macro.name).toBe('NY macro')
    expect(hit?.session.name).toBe('New York')
  })

  it('returns null outside every macro', () => {
    expect(macroFor('17:00', WINDOWS)).toBeNull()
  })

  it('labels by macro when there is one, session otherwise', () => {
    expect(sessionLabelFor('15:00', WINDOWS)).toBe('NY macro')
    expect(sessionLabelFor('17:00', WINDOWS)).toBe('New York')
    expect(sessionLabelFor('22:30', WINDOWS)).toBeNull()
  })
})

describe('sessionWindowsOf', () => {
  it('falls back to sensible defaults', () => {
    expect(sessionWindowsOf(undefined)).toEqual(DEFAULT_SESSION_WINDOWS)
    expect(sessionWindowsOf(makePrefs())).toEqual(DEFAULT_SESSION_WINDOWS)
  })

  it('uses the trader’s own once they have any', () => {
    const prefs = makePrefs({ sessionWindows: WINDOWS })
    expect(sessionWindowsOf(prefs)).toEqual(WINDOWS)
  })

  it('treats an empty list as "not customised"', () => {
    expect(sessionWindowsOf(makePrefs({ sessionWindows: [] }))).toEqual(
      DEFAULT_SESSION_WINDOWS,
    )
  })
})

describe('overlap detection', () => {
  it('is quiet for clean windows', () => {
    expect(overlappingWindows(WINDOWS)).toEqual([])
  })

  it('reports a genuine overlap', () => {
    const clashing: SessionWindow[] = [
      { id: 'a', name: 'Morning', start: '07:00', end: '12:00' },
      { id: 'b', name: 'Midday', start: '11:00', end: '15:00' },
    ]
    expect(overlappingWindows(clashing)).toEqual([['Morning', 'Midday']])
  })
})
