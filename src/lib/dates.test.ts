import { describe, expect, it } from 'vitest'
import {
  addDays,
  daysBetween,
  endOfMonth,
  endOfWeek,
  formatDay,
  isoWeek,
  longDayLabel,
  monthGrid,
  periodId,
  periodLabel,
  periodRange,
  sessionOf,
  shiftPeriod,
  startOfMonth,
  startOfWeek,
  today,
} from './dates'

describe('day parsing is timezone-proof', () => {
  it('round-trips a day string regardless of host timezone', () => {
    for (const d of ['2026-01-01', '2026-07-14', '2026-12-31', '2024-02-29']) {
      expect(formatDay(new Date(`${d}T00:00:00Z`))).toBe(d)
    }
  })

  it('does not drift a day when adding zero', () => {
    expect(addDays('2026-03-01', 0)).toBe('2026-03-01')
  })

  it('crosses a DST boundary without losing a day', () => {
    // US DST starts 2026-03-08; EU 2026-03-29.
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08')
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29')
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2)
  })

  it('handles leap day', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDays('2024-02-29', 1)).toBe('2024-03-01')
    expect(endOfMonth('2024-02-10')).toBe('2024-02-29')
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28')
  })

  it('reads today from local wall-clock, not UTC', () => {
    // A local date late in the evening must not roll forward to UTC tomorrow.
    const local = new Date(2026, 6, 14, 23, 30)
    expect(today(local)).toBe('2026-07-14')
  })
})

describe('week boundaries are Monday-anchored', () => {
  it('starts weeks on Monday', () => {
    // 2026-07-14 is a Tuesday.
    expect(startOfWeek('2026-07-14')).toBe('2026-07-13')
    expect(endOfWeek('2026-07-14')).toBe('2026-07-19')
  })

  it('treats Sunday as the end of the week, not the start', () => {
    expect(startOfWeek('2026-07-19')).toBe('2026-07-13')
    expect(endOfWeek('2026-07-19')).toBe('2026-07-19')
  })

  it('treats Monday as its own start', () => {
    expect(startOfWeek('2026-07-13')).toBe('2026-07-13')
  })
})

describe('ISO week numbering', () => {
  it('matches known ISO week edges', () => {
    expect(isoWeek('2026-01-01')).toEqual({ year: 2026, week: 1 })
    // 2027-01-01 is a Friday → still ISO week 53 of 2026.
    expect(isoWeek('2027-01-01')).toEqual({ year: 2026, week: 53 })
    // 2023-01-01 is a Sunday → ISO week 52 of 2022.
    expect(isoWeek('2023-01-01')).toEqual({ year: 2022, week: 52 })
  })

  it('produces stable, sortable period ids', () => {
    expect(periodId('2026-07-14', 'week')).toBe('W-2026-29')
    expect(periodId('2026-07-14', 'month')).toBe('M-2026-07')
    // Same week → same id, whichever day you ask with.
    expect(periodId('2026-07-13', 'week')).toBe(periodId('2026-07-19', 'week'))
  })
})

describe('period ranges and navigation', () => {
  it('ranges a month from the 1st to the last day', () => {
    expect(periodRange('2026-07-14', 'month')).toEqual({
      start: '2026-07-01',
      end: '2026-07-31',
    })
  })

  it('steps months without overflowing short months', () => {
    // Jan 31 + 1 month must land in February, not March.
    expect(startOfMonth(shiftPeriod('2026-01-31', 'month', 1))).toBe('2026-02-01')
    expect(shiftPeriod('2026-12-15', 'month', 1)).toBe('2027-01-01')
    expect(shiftPeriod('2026-01-15', 'month', -1)).toBe('2025-12-01')
  })

  it('steps weeks by exactly seven days', () => {
    expect(shiftPeriod('2026-07-14', 'week', 1)).toBe('2026-07-20')
    expect(shiftPeriod('2026-07-14', 'week', -1)).toBe('2026-07-06')
  })
})

describe('month grid', () => {
  it('always renders 42 cells so the grid never reflows', () => {
    for (const anchor of ['2026-02-01', '2026-07-01', '2026-08-01', '2027-01-01']) {
      expect(monthGrid(anchor)).toHaveLength(42)
    }
  })

  it('starts on a Monday and contains the whole month', () => {
    const grid = monthGrid('2026-07-01')
    expect(startOfWeek(grid[0])).toBe(grid[0])
    expect(grid).toContain('2026-07-01')
    expect(grid).toContain('2026-07-31')
  })

  it('is strictly consecutive', () => {
    const grid = monthGrid('2026-07-01')
    for (let i = 1; i < grid.length; i++) {
      expect(daysBetween(grid[i - 1], grid[i])).toBe(1)
    }
  })
})

describe('labels', () => {
  it('labels days and periods legibly', () => {
    expect(longDayLabel('2026-07-14')).toBe('Tuesday, 14 July')
    expect(periodLabel('2026-07-14', 'month')).toBe('July 2026')
    expect(periodLabel('2026-07-14', 'week')).toBe('13–19 Jul')
  })

  it('spans month boundaries in a week label', () => {
    expect(periodLabel('2026-07-30', 'week')).toBe('27 Jul – 2 Aug')
  })
})

describe('session derivation', () => {
  it('buckets clock times into trading sessions', () => {
    expect(sessionOf('02:30')).toBe('asia')
    expect(sessionOf('08:15')).toBe('london')
    expect(sessionOf('14:45')).toBe('newyork')
    expect(sessionOf('22:00')).toBe('off')
  })

  it('returns null rather than guessing when there is no time', () => {
    expect(sessionOf(undefined)).toBeNull()
    expect(sessionOf('not-a-time')).toBeNull()
  })
})
