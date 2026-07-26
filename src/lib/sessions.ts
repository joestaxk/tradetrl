/**
 * Sessions, as the trader defines them.
 *
 * Two things this module refuses to do, both deliberate:
 *
 *  - it never hardcodes when London is. Sessions shift with daylight saving,
 *    brokers disagree about boundaries, and one trader's "London" is the first
 *    ninety minutes while another's is eight hours. Those are the trader's
 *    windows, not ours.
 *  - it never produces a violation. Trading at 3am is not against the rules;
 *    it is a fact about your history, and the review is where facts belong.
 */

import { DEFAULT_SESSION_WINDOWS, type SessionWindow, type UserPrefs } from './types'

export function sessionWindowsOf(prefs: UserPrefs | undefined): SessionWindow[] {
  const custom = prefs?.sessionWindows
  return custom && custom.length > 0 ? custom : DEFAULT_SESSION_WINDOWS
}

/** Minutes since midnight, or null for anything unparseable. */
export function toMinutes(time: string | undefined): number | null {
  if (!time) return null
  const [h, m] = time.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return h * 60 + m
}

/**
 * Is `time` inside [start, end]? Handles windows that wrap past midnight,
 * which an Asia trader genuinely has (22:00–06:00).
 */
export function withinWindow(time: string, start: string, end: string): boolean {
  const t = toMinutes(time)
  const s = toMinutes(start)
  const e = toMinutes(end)
  if (t === null || s === null || e === null) return false
  return s <= e ? t >= s && t <= e : t >= s || t <= e
}

/** How long a window runs, in minutes, accounting for midnight wrap. */
export function windowLength(w: { start: string; end: string }): number {
  const s = toMinutes(w.start)
  const e = toMinutes(w.end)
  if (s === null || e === null) return 0
  return s <= e ? e - s : 1440 - s + e
}

/**
 * Which session a clock time falls in.
 *
 * When windows overlap the narrower one wins — someone who defines "London"
 * 07:00–12:00 and "London open" 07:00–09:00 means the latter for an 08:00
 * trade, because they went to the trouble of drawing it.
 */
export function sessionFor(
  time: string | undefined,
  windows: SessionWindow[],
): SessionWindow | null {
  if (!time) return null
  const hits = windows.filter((w) => withinWindow(time, w.start, w.end))
  if (hits.length === 0) return null
  return hits.reduce((best, w) => (windowLength(w) < windowLength(best) ? w : best))
}

export interface MacroHit {
  session: SessionWindow
  macro: { id: string; name: string; start: string; end: string }
}

/** The sharper window inside a session, when the trade lands in one. */
export function macroFor(
  time: string | undefined,
  windows: SessionWindow[],
): MacroHit | null {
  if (!time) return null
  for (const session of windows) {
    for (const macro of session.macros ?? []) {
      if (withinWindow(time, macro.start, macro.end)) return { session, macro }
    }
  }
  return null
}

/** Label for grouping — the macro if there is one, else the session. */
export function sessionLabelFor(
  time: string | undefined,
  windows: SessionWindow[],
): string | null {
  const macro = macroFor(time, windows)
  if (macro) return macro.macro.name
  return sessionFor(time, windows)?.name ?? null
}

/**
 * Overlaps are legal but worth surfacing while someone is editing them.
 *
 * A *touching* boundary is not an overlap: sessions that run 00:00–07:00 and
 * 07:00–12:00 are the normal way to describe a day, and warning about them
 * would fire on almost every sensible configuration.
 */
export function overlappingWindows(windows: SessionWindow[]): [string, string][] {
  const out: [string, string][] = []
  for (let i = 0; i < windows.length; i++) {
    for (let j = i + 1; j < windows.length; j++) {
      const a = windows[i]
      const b = windows[j]
      if (overlapMinutes(a, b) > 0) out.push([a.name, b.name])
    }
  }
  return out
}

/** Minutes two windows genuinely share, treating each as a half-open range. */
function overlapMinutes(
  a: { start: string; end: string },
  b: { start: string; end: string },
): number {
  const spans = (w: { start: string; end: string }): [number, number][] => {
    const s = toMinutes(w.start)
    const e = toMinutes(w.end)
    if (s === null || e === null) return []
    // A window across midnight is two spans, which keeps the maths trivial.
    return s <= e ? [[s, e]] : [[s, 1440], [0, e]]
  }

  let total = 0
  for (const [as, ae] of spans(a)) {
    for (const [bs, be] of spans(b)) {
      total += Math.max(0, Math.min(ae, be) - Math.max(as, bs))
    }
  }
  return total
}

export function newSessionWindow(): SessionWindow {
  return {
    id: `s${Date.now().toString(36)}`,
    name: '',
    start: '08:00',
    end: '17:00',
  }
}
