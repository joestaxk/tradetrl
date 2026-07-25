/**
 * Behavioural analysis (§5 review, §10 Pro).
 *
 * Everything here is *computed from what was already logged* — the trader is
 * never asked "were you revenge trading?". And every output string obeys the
 * observe-never-gate tone: it states what happened, attaches the evidence, and
 * stops. No advice, no judgement, no exclamation marks.
 */

import { round2 } from './calc'
import { addDays, daysBetween } from './dates'
import { computeStats, sortChronological } from './aggregate'
import type { PeriodPlan, Trade } from './types'

// ---------------------------------------------------------------------------
// Discipline score

export interface DisciplineScore {
  /** 0–100. null when there are no trades, or no rules to measure against. */
  score: number | null
  tradesCounted: number
  violatingTrades: string[]
  cleanRate: number | null
}

/**
 * Adherence, not profitability. A losing week with zero rule breaks scores
 * 100 — which is exactly the behaviour we want to reinforce.
 *
 * Score = share of trades with no violations, lightly penalised for repeat
 * breaks within the same trade (2 broken rules is worse than 1).
 */
export function disciplineScore(trades: Trade[]): DisciplineScore {
  if (trades.length === 0) {
    return { score: null, tradesCounted: 0, violatingTrades: [], cleanRate: null }
  }
  const violating = trades.filter((t) => (t.ruleViolations?.length ?? 0) > 0)
  const clean = trades.length - violating.length
  const cleanRate = round2((clean / trades.length) * 100)

  // Each additional violation on the same trade costs a little extra, capped
  // so one catastrophic day can't drive the score negative.
  const extra = violating.reduce(
    (n, t) => n + Math.max(0, (t.ruleViolations?.length ?? 0) - 1),
    0,
  )
  const penalty = Math.min(15, (extra / trades.length) * 25)

  return {
    score: Math.max(0, Math.round(cleanRate - penalty)),
    tradesCounted: trades.length,
    violatingTrades: violating.map((t) => t.id),
    cleanRate,
  }
}

/** Week-over-week trend of the score, for the Pro sparkline. */
export function scoreTrend(
  trades: Trade[],
  weekStarts: string[],
): { weekStart: string; score: number | null }[] {
  return weekStarts.map((weekStart) => {
    const end = addDays(weekStart, 6)
    const inWeek = trades.filter((t) => t.date >= weekStart && t.date <= end)
    return { weekStart, score: disciplineScore(inWeek).score }
  })
}

// ---------------------------------------------------------------------------
// Behavioural flags

export type FlagKind = 'revenge' | 'overtrading' | 'size-creep' | 'tilt-day'

export interface BehaviourFlag {
  kind: FlagKind
  title: string
  detail: string
  tradeIds: string[]
  date?: string
}

export interface FlagOptions {
  /** A trade this much bigger than the trader's own norm counts as oversized. */
  sizeMultiple?: number
  /** Minutes after a loss within which a trade is "immediate". */
  revengeWindowMin?: number
  /** Day count above rolling average that counts as overtrading. */
  overtradeMultiple?: number
}

const DEFAULTS: Required<FlagOptions> = {
  sizeMultiple: 1.75,
  revengeWindowMin: 60,
  overtradeMultiple: 1.6,
}

/**
 * Revenge trading: an oversized trade taken shortly after a loss.
 *
 * "Oversized" is measured against *this trader's own* median size, never an
 * absolute number — a 0.05-lot trader and a 5-lot trader get the same read.
 */
export function detectRevengeTrades(
  trades: Trade[],
  opts: FlagOptions = {},
): BehaviourFlag[] {
  const { sizeMultiple, revengeWindowMin } = { ...DEFAULTS, ...opts }
  const ordered = sortChronological(trades)
  const sizes = ordered.map((t) => t.lotSize).filter(isPositive)
  if (sizes.length < 4) return [] // too little history to call anything abnormal
  const median = medianOf(sizes)
  if (median <= 0) return []

  const flags: BehaviourFlag[] = []
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1]
    const cur = ordered[i]
    if (prev.pnl >= 0) continue
    if (!isPositive(cur.lotSize)) continue
    if (cur.lotSize < median * sizeMultiple) continue

    const gap = minutesBetween(prev, cur)
    // Unknown gap (no clock times) still counts if it's the same day —
    // the sequence is what matters, and we say so honestly in the detail.
    if (gap !== null && gap > revengeWindowMin) continue
    if (gap === null && cur.date !== prev.date) continue

    flags.push({
      kind: 'revenge',
      date: cur.date,
      tradeIds: [prev.id, cur.id],
      title: 'Size increased right after a loss',
      detail:
        gap === null
          ? `${cur.pair.toUpperCase()} at ${fmtLots(cur.lotSize)} lots followed a loss the same day — about ${round2(cur.lotSize / median)}× your usual size.`
          : `${cur.pair.toUpperCase()} at ${fmtLots(cur.lotSize)} lots came ${gap} min after a loss — about ${round2(cur.lotSize / median)}× your usual size.`,
    })
  }
  return flags
}

/**
 * Overtrading: a day whose trade count sits well above the trader's own
 * rolling average of active days.
 */
export function detectOvertrading(
  trades: Trade[],
  opts: FlagOptions = {},
): BehaviourFlag[] {
  const { overtradeMultiple } = { ...DEFAULTS, ...opts }
  const counts = new Map<string, Trade[]>()
  for (const t of trades) {
    const arr = counts.get(t.date)
    if (arr) arr.push(t)
    else counts.set(t.date, [t])
  }
  const days = [...counts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
  if (days.length < 4) return []

  const avg = days.reduce((n, [, list]) => n + list.length, 0) / days.length
  if (avg <= 0) return []

  return days
    .filter(([, list]) => list.length > Math.max(avg * overtradeMultiple, avg + 1))
    .map(([date, list]) => ({
      kind: 'overtrading' as const,
      date,
      tradeIds: list.map((t) => t.id),
      title: 'Busier day than usual',
      detail: `${list.length} trades against your average of ${round2(avg)} on an active day.`,
    }))
}

/** A day that went materially negative *and* ran long — the classic tilt shape. */
export function detectTiltDays(trades: Trade[]): BehaviourFlag[] {
  const byDay = new Map<string, Trade[]>()
  for (const t of trades) {
    const arr = byDay.get(t.date)
    if (arr) arr.push(t)
    else byDay.set(t.date, [t])
  }
  const flags: BehaviourFlag[] = []
  for (const [date, list] of [...byDay.entries()].sort()) {
    if (list.length < 3) continue
    const ordered = sortChronological(list)
    // Consecutive losses at the tail of the day.
    let tail = 0
    for (let i = ordered.length - 1; i >= 0; i--) {
      if (ordered[i].pnl < 0) tail++
      else break
    }
    if (tail >= 3) {
      flags.push({
        kind: 'tilt-day',
        date,
        tradeIds: ordered.slice(-tail).map((t) => t.id),
        title: 'Day ended on a losing run',
        detail: `The last ${tail} trades of ${date} were all losses.`,
      })
    }
  }
  return flags
}

export function allFlags(trades: Trade[], opts: FlagOptions = {}): BehaviourFlag[] {
  return [
    ...detectRevengeTrades(trades, opts),
    ...detectOvertrading(trades, opts),
    ...detectTiltDays(trades),
  ]
}

// ---------------------------------------------------------------------------
// Journaling streak

export interface Streak {
  current: number
  longest: number
  lastLoggedDate: string | null
}

/**
 * Consecutive *days logged* — never consecutive wins. Gamifying wins would
 * gamify risk-taking, which is the opposite of the point.
 *
 * A streak stays alive if the trader logged today or yesterday, so an evening
 * journaller doesn't lose it to a timezone edge.
 */
export function journalingStreak(trades: Trade[], todayStr: string): Streak {
  const days = [...new Set(trades.map((t) => t.date))].sort()
  if (days.length === 0) return { current: 0, longest: 0, lastLoggedDate: null }

  let longest = 1
  let run = 1
  for (let i = 1; i < days.length; i++) {
    run = daysBetween(days[i - 1], days[i]) === 1 ? run + 1 : 1
    if (run > longest) longest = run
  }

  const last = days[days.length - 1]
  // A negative gap means the newest entry is dated in the future — a timezone
  // edge or a typed-in date. That must not silently zero someone's streak, so
  // anything up to one day stale counts as alive.
  const gap = daysBetween(last, todayStr)
  let current = 0
  if (gap <= 1) {
    current = 1
    for (let i = days.length - 1; i > 0; i--) {
      if (daysBetween(days[i - 1], days[i]) === 1) current++
      else break
    }
  }
  return { current, longest, lastLoggedDate: last }
}

// ---------------------------------------------------------------------------
// Plan vs actual (§6)

export interface PlanDiff {
  line: string
  kind: 'match' | 'drift' | 'neutral'
}

/**
 * Compares the trader's own words against their own numbers — in plain
 * language, not a strategy taxonomy. We look for pairs and sessions they
 * *named* in the note and check whether the trades agree.
 */
export function planVsActual(
  plan: PeriodPlan | null | undefined,
  trades: Trade[],
): PlanDiff[] {
  const out: PlanDiff[] = []
  if (trades.length === 0) return out

  const stats = computeStats(trades)
  const note = (plan?.entryModelNote ?? '').toUpperCase()
  const traded = [...new Set(trades.map((t) => t.pair.toUpperCase()))]

  if (note.trim()) {
    const named = traded.filter((p) => note.includes(p.replace(/[^A-Z0-9]/g, '')))
    const unnamed = traded.filter((p) => !named.includes(p))
    if (named.length > 0) {
      out.push({
        kind: 'match',
        line: `You wrote about ${named.join(', ')} and traded ${named.length === 1 ? 'it' : 'them'} this period.`,
      })
    }
    if (unnamed.length > 0) {
      out.push({
        kind: 'drift',
        line: `You also traded ${unnamed.join(', ')}, which your note didn't mention.`,
      })
    }
  } else {
    out.push({
      kind: 'neutral',
      line: `No entry-model note for this period, so there's nothing to compare the ${stats.trades} trades against yet.`,
    })
  }

  // Risk drift against the snapshot the plan was written under.
  const cap = plan?.riskRuleSnapshot?.maxRiskPerTradePct
  if (typeof cap === 'number') {
    const risky = trades.filter((t) => typeof t.riskPct === 'number' && t.riskPct > cap)
    out.push(
      risky.length === 0
        ? { kind: 'match', line: `Every sized trade stayed within the ${cap}% risk you set.` }
        : {
            kind: 'drift',
            line: `${risky.length} of ${trades.length} trades went above the ${cap}% risk you set.`,
          },
    )
  }

  return out
}

// ---------------------------------------------------------------------------

function isPositive(v: number | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0
}

function medianOf(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function minutesBetween(a: Trade, b: Trade): number | null {
  if (!a.time || !b.time) return null
  const dayGap = daysBetween(a.date, b.date)
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  return dayGap * 1440 + toMin(b.time) - toMin(a.time)
}

function fmtLots(n: number): string {
  return n.toFixed(2).replace(/\.00$/, '')
}
