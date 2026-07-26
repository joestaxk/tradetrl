import { describe, expect, it } from 'vitest'
import { formatTime, formatTimeRange, parseTime, timeFormatOf } from './clock'
import { makePrefs } from '#/test/factories'

describe('formatTime', () => {
  it('defaults to 24 hour', () => {
    expect(formatTime('14:30')).toBe('14:30')
    expect(formatTime('09:05')).toBe('09:05')
  })

  it('converts to 12 hour with a suffix', () => {
    expect(formatTime('14:30', '12h')).toBe('2:30 PM')
    expect(formatTime('09:05', '12h')).toBe('9:05 AM')
  })

  it('gets midnight and noon right', () => {
    // The two everyone gets wrong: 0 is 12 AM, 12 is 12 PM.
    expect(formatTime('00:00', '12h')).toBe('12:00 AM')
    expect(formatTime('12:00', '12h')).toBe('12:00 PM')
    expect(formatTime('00:30', '12h')).toBe('12:30 AM')
    expect(formatTime('12:30', '12h')).toBe('12:30 PM')
  })

  it('handles the last minute of the day', () => {
    expect(formatTime('23:59', '12h')).toBe('11:59 PM')
  })

  it('pads 24-hour output so times stay column-aligned', () => {
    expect(formatTime('9:05')).toBe('09:05')
  })

  it('returns nothing for nothing', () => {
    expect(formatTime(undefined)).toBe('')
    expect(formatTime('')).toBe('')
  })

  it('passes through anything it cannot read rather than mangling it', () => {
    expect(formatTime('not-a-time', '12h')).toBe('not-a-time')
  })
})

describe('formatTimeRange', () => {
  it('joins a 24-hour range plainly', () => {
    expect(formatTimeRange('09:50', '10:10')).toBe('09:50–10:10')
  })

  it('drops the repeated suffix within the same half-day', () => {
    expect(formatTimeRange('09:50', '10:10', '12h')).toBe('9:50–10:10 AM')
  })

  it('keeps both suffixes when the range crosses noon', () => {
    expect(formatTimeRange('11:30', '13:30', '12h')).toBe('11:30 AM–1:30 PM')
  })
})

describe('parseTime — people type times every possible way', () => {
  it('reads plain 24-hour', () => {
    expect(parseTime('14:30')).toBe('14:30')
    expect(parseTime('09:05')).toBe('09:05')
  })

  it('reads 12-hour with a suffix', () => {
    expect(parseTime('2:30pm')).toBe('14:30')
    expect(parseTime('2:30 PM')).toBe('14:30')
    expect(parseTime('9:05am')).toBe('09:05')
    expect(parseTime('2:30 p.m.')).toBe('14:30')
  })

  it('reads times typed without a colon', () => {
    expect(parseTime('230pm')).toBe('14:30')
    expect(parseTime('1430')).toBe('14:30')
    expect(parseTime('9')).toBe('09:00')
  })

  it('gets 12am and 12pm right', () => {
    expect(parseTime('12:00am')).toBe('00:00')
    expect(parseTime('12:00pm')).toBe('12:00')
  })

  it('rejects impossible times rather than clamping them', () => {
    expect(parseTime('25:00')).toBeNull()
    expect(parseTime('10:75')).toBeNull()
    expect(parseTime('')).toBeNull()
    expect(parseTime('lunchtime')).toBeNull()
  })

  it('round-trips through formatting', () => {
    for (const t of ['00:00', '09:05', '12:00', '14:30', '23:59']) {
      expect(parseTime(formatTime(t, '12h'))).toBe(t)
      expect(parseTime(formatTime(t, '24h'))).toBe(t)
    }
  })
})

describe('timeFormatOf', () => {
  it('defaults to 24 hour', () => {
    expect(timeFormatOf(undefined)).toBe('24h')
    expect(timeFormatOf(makePrefs())).toBe('24h')
  })

  it('honours the preference', () => {
    expect(timeFormatOf(makePrefs({ timeFormat: '12h' }))).toBe('12h')
  })
})
