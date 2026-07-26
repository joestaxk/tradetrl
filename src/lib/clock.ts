/**
 * Displaying clock times.
 *
 * The rule this file exists to enforce: **storage is always 24-hour 'HH:mm'.**
 * Session boundaries, sorting, duration maths and the behaviour engine all
 * depend on times being comparable as strings. A display preference that
 * reached the database would quietly break every one of them.
 *
 * So the preference is applied here, at the edge, and nowhere else.
 */

import type { TimeFormat, UserPrefs } from './types'

export function timeFormatOf(prefs: UserPrefs | undefined): TimeFormat {
  return prefs?.timeFormat ?? '24h'
}

/** '14:30' → '2:30 PM' or '14:30', depending on preference. */
export function formatTime(time: string | undefined, format: TimeFormat = '24h'): string {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return time

  const mm = String(m).padStart(2, '0')
  if (format === '24h') return `${String(h).padStart(2, '0')}:${mm}`

  const suffix = h < 12 ? 'AM' : 'PM'
  // 0 and 12 both display as 12 — midnight is 12 AM, noon is 12 PM.
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${mm} ${suffix}`
}

/** A range, sharing one suffix where it reads better: '9:50–10:10 AM'. */
export function formatTimeRange(
  start: string,
  end: string,
  format: TimeFormat = '24h',
): string {
  if (format === '24h') return `${formatTime(start, '24h')}–${formatTime(end, '24h')}`

  const a = formatTime(start, '12h')
  const b = formatTime(end, '12h')
  const aSuffix = a.slice(-2)
  const bSuffix = b.slice(-2)
  // Same half of the day: drop the first suffix rather than repeating it.
  return aSuffix === bSuffix ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`
}

/**
 * Parse what a person typed into stored 24h form.
 *
 * Accepts '2:30pm', '14:30', '230pm', '2 30 PM' — people type times in every
 * imaginable way and rejecting them is worse than understanding them.
 * Returns null when there is genuinely nothing to read.
 */
export function parseTime(raw: string): string | null {
  const text = raw.trim().toLowerCase()
  if (!text) return null

  const meridiem = /p\.?m\.?$/.test(text) ? 'pm' : /a\.?m\.?$/.test(text) ? 'am' : null
  const digits = text.replace(/[^0-9:]/g, '')
  if (!digits) return null

  let hours: number
  let minutes: number

  if (digits.includes(':')) {
    const [h, m] = digits.split(':')
    hours = Number(h)
    minutes = Number(m || 0)
  } else if (digits.length <= 2) {
    hours = Number(digits)
    minutes = 0
  } else {
    // '230' is 2:30, '1430' is 14:30.
    hours = Number(digits.slice(0, digits.length - 2))
    minutes = Number(digits.slice(-2))
  }

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  if (minutes < 0 || minutes > 59) return null

  if (meridiem === 'pm' && hours < 12) hours += 12
  if (meridiem === 'am' && hours === 12) hours = 0
  if (hours < 0 || hours > 23) return null

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}
