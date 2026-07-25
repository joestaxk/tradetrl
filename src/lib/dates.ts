/**
 * Date utilities.
 *
 * Hard rule in here: a trade's `date` is a plain calendar string 'YYYY-MM-DD',
 * never a timestamp. All arithmetic happens on UTC-anchored Dates so that a
 * trader in UTC-11 and one in UTC+13 both see the day they actually traded.
 * Nothing in this file may use local-timezone Date parsing.
 */

export const MS_DAY = 86_400_000

/** Parse 'YYYY-MM-DD' to a UTC-anchored Date. */
export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

/** Format a UTC-anchored Date back to 'YYYY-MM-DD'. */
export function formatDay(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Today in the user's *local* wall-clock, expressed as a day string. */
export function today(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(day: string, n: number): string {
  return formatDay(new Date(parseDay(day).getTime() + n * MS_DAY))
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / MS_DAY)
}

/** 0 = Sunday … 6 = Saturday */
export function dayOfWeek(day: string): number {
  return parseDay(day).getUTCDay()
}

/** Monday-anchored week start. Markets run Mon–Fri; the review is a Sunday artifact. */
export function startOfWeek(day: string): string {
  const dow = dayOfWeek(day)
  const back = (dow + 6) % 7
  return addDays(day, -back)
}

export function endOfWeek(day: string): string {
  return addDays(startOfWeek(day), 6)
}

export function startOfMonth(day: string): string {
  return `${day.slice(0, 7)}-01`
}

export function endOfMonth(day: string): string {
  const d = parseDay(day)
  return formatDay(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)))
}

/** ISO-8601 week number (weeks start Monday; week 1 contains the first Thursday). */
export function isoWeek(day: string): { year: number; week: number } {
  const d = parseDay(day)
  // Shift to the Thursday of this week — its year is the ISO week-year.
  const dow = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - dow + 3)
  const isoYear = d.getUTCFullYear()
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4))
  const firstDow = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDow + 3)
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * MS_DAY))
  return { year: isoYear, week }
}

/** Stable document id for a period plan/review. */
export function periodId(day: string, kind: 'week' | 'month'): string {
  if (kind === 'month') return `M-${day.slice(0, 7)}`
  const { year, week } = isoWeek(day)
  return `W-${year}-${String(week).padStart(2, '0')}`
}

export function periodRange(day: string, kind: 'week' | 'month') {
  return kind === 'month'
    ? { start: startOfMonth(day), end: endOfMonth(day) }
    : { start: startOfWeek(day), end: endOfWeek(day) }
}

export function shiftPeriod(day: string, kind: 'week' | 'month', n: number): string {
  if (kind === 'week') return addDays(startOfWeek(day), n * 7)
  const d = parseDay(startOfMonth(day))
  return formatDay(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)))
}

/**
 * The 6-week grid a month calendar renders (Mon-anchored, always 42 cells so
 * the grid never reflows height between months — a subtle but real jitter).
 */
export function monthGrid(anchor: string): string[] {
  const first = startOfMonth(anchor)
  const gridStart = startOfWeek(first)
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
}

/**
 * The month as whole weeks, with days outside the month rendered as gaps.
 *
 * A calendar that spills the tail of March into April makes it genuinely hard
 * to read one month's shape — the eye keeps catching numbers that belong to a
 * period you are not looking at. `null` marks a leading or trailing gap so the
 * grid keeps its week alignment without showing foreign days.
 *
 * Trailing all-empty weeks are dropped, so a month that fits in five weeks
 * doesn't render a sixth blank row.
 */
export function monthWeeks(anchor: string): (string | null)[][] {
  const month = anchor.slice(0, 7)
  const cells = monthGrid(anchor).map((d) => (d.slice(0, 7) === month ? d : null))
  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  while (weeks.length > 0 && weeks[weeks.length - 1].every((d) => d === null)) {
    weeks.pop()
  }
  return weeks
}

/** A day the trader could not have traded yet. */
export function isFuture(day: string, now: string = today()): boolean {
  return day > now
}

export function isSameMonth(day: string, anchor: string): boolean {
  return day.slice(0, 7) === anchor.slice(0, 7)
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function monthLabel(day: string): string {
  const d = parseDay(day)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

export function weekdayLabel(day: string): string {
  return DAYS[dayOfWeek(day)]
}

/** 'Tuesday, 14 July' — used in the day-detail modal and list view. */
export function longDayLabel(day: string): string {
  const d = parseDay(day)
  return `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

/** 'Mon 14 Jul' — compact, for dense rows. */
export function shortDayLabel(day: string): string {
  const d = parseDay(day)
  return `${DAYS[d.getUTCDay()].slice(0, 3)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`
}

export function periodLabel(day: string, kind: 'week' | 'month'): string {
  if (kind === 'month') return monthLabel(day)
  const { start, end } = periodRange(day, 'week')
  const s = parseDay(start)
  const e = parseDay(end)
  const sM = MONTHS[s.getUTCMonth()].slice(0, 3)
  const eM = MONTHS[e.getUTCMonth()].slice(0, 3)
  return sM === eM
    ? `${s.getUTCDate()}–${e.getUTCDate()} ${sM}`
    : `${s.getUTCDate()} ${sM} – ${e.getUTCDate()} ${eM}`
}

/**
 * Trading session from a local 'HH:mm'. Approximate on purpose: traders think
 * in these three blocks, and we derive it rather than ask (§10).
 */
export type TradingSession = 'asia' | 'london' | 'newyork' | 'off'

export function sessionOf(time: string | undefined): TradingSession | null {
  if (!time) return null
  const [h] = time.split(':').map(Number)
  if (Number.isNaN(h)) return null
  if (h >= 0 && h < 7) return 'asia'
  if (h >= 7 && h < 12) return 'london'
  if (h >= 12 && h < 21) return 'newyork'
  return 'off'
}

/**
 * How long a trade was held, in minutes.
 *
 * Needs a clock time on both ends — a date alone can't distinguish a 10-minute
 * scalp from an all-day hold, and inventing midnight-to-midnight would be a
 * fabricated number in a journal. Returns null rather than guess.
 */
export function durationMinutes(open: {
  date: string
  time?: string
  closeDate?: string
  closeTime?: string
}): number | null {
  if (!open.time || !open.closeTime) return null
  const closeDate = open.closeDate ?? open.date
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    if (Number.isNaN(h) || Number.isNaN(m)) return null
    return h * 60 + m
  }
  const a = toMin(open.time)
  const b = toMin(open.closeTime)
  if (a === null || b === null) return null
  const mins = daysBetween(open.date, closeDate) * 1440 + b - a
  // A negative duration means the dates are the wrong way round. Say nothing.
  return mins >= 0 ? mins : null
}

/** '45m', '2h 15m', '3d 4h' — compact enough for a dense table column. */
export function formatDuration(minutes: number | null): string {
  if (minutes === null) return '—'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours < 24) return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`
  const days = Math.floor(hours / 24)
  const remHours = hours % 24
  return remHours === 0 ? `${days}d` : `${days}d ${remHours}h`
}

export const SESSION_LABEL: Record<TradingSession, string> = {
  asia: 'Asia',
  london: 'London',
  newyork: 'New York',
  off: 'Off-session',
}
