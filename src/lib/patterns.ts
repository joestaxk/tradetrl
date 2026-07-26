/**
 * The behaviour engine.
 *
 * ── What this is ──────────────────────────────────────────────────────────
 * A set of detectors that read a trader's own history and report things they
 * are unlikely to have noticed: that their third trade of the day is where the
 * money goes, that they hold losers 40% longer than winners, that the setup
 * they trust least is the only one making money.
 *
 * ── What this is not ──────────────────────────────────────────────────────
 * It is not a model, it does not predict, and it never says anything it cannot
 * show the arithmetic for. Every insight carries the trades it came from.
 *
 * ── The rule that governs the whole file ──────────────────────────────────
 * A detector must refuse to speak before it has grounds. Two guards enforce
 * that, and no detector may skip them:
 *
 *   1. a **minimum sample**, because five trades is an anecdote; and
 *   2. a **meaningful effect**, because with enough data trivia becomes
 *      "significant" and the trader ends up acting on nothing.
 *
 * Software that tells someone "you lose on Tuesdays" after three Tuesdays is
 * worse than silence — it manufactures a superstition they will then trade on.
 * When in doubt this file says nothing, and that is the correct behaviour.
 *
 * ── Tone ──────────────────────────────────────────────────────────────────
 * Observational, never instructive. It reports what happened and stops. No
 * advice, no praise, no scolding — the trader draws the conclusion.
 */

import { round2 } from './calc'
import { addDays, daysBetween, durationMinutes, sessionOf, SESSION_LABEL } from './dates'
import { closedOnly, computeStats, sortChronological, type Stats } from './aggregate'
import {
  cohensD,
  isRealDifference,
  linearSlope,
  mean,
  median,
  twoProportionZ,
  welchT,
  wilsonLowerBound,
  SIGNIFICANT,
} from './stats'
import { isCostly, reasonLabel, REASON_GROUP_LABEL, weakestLink } from './reasons'
import { convictionCheck, riskConsistency } from './risk-consistency'
import { sessionLabelFor } from './sessions'
import type { SessionWindow, Strategy, Trade } from './types'

/* ═══════════════════════════════════════════════════════════ discipline ══ */

export interface DisciplineScore {
  score: number | null
  tradesCounted: number
  violatingTrades: string[]
  cleanRate: number | null
}

/**
 * Adherence, not profitability. A losing period with zero rule breaks scores
 * 100 — which is exactly the behaviour worth reinforcing.
 */
export function disciplineScore(input: Trade[]): DisciplineScore {
  const trades = closedOnly(input)
  if (trades.length === 0) {
    return { score: null, tradesCounted: 0, violatingTrades: [], cleanRate: null }
  }
  const violating = trades.filter((t) => (t.ruleViolations?.length ?? 0) > 0)
  const clean = trades.length - violating.length
  const cleanRate = round2((clean / trades.length) * 100)

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

/* ═══════════════════════════════════════════════════════════ the insight ══ */

export type InsightKind =
  | 'revenge'
  | 'overtrading'
  | 'tilt'
  | 'size-creep'
  | 'cutting-winners'
  | 'holding-losers'
  | 'trade-order-decay'
  | 'weekday-edge'
  | 'session-edge'
  | 'pair-leak'
  | 'strategy-edge'
  | 'stop-discipline'
  | 'after-loss'
  | 'after-win'
  | 'journaling-quality'
  | 'streak-sizing'
  | 'day-volume'
  | 'recovery'
  | 'self-reported'
  | 'risk-consistency'

/** How much attention the insight deserves — never how bad the trader is. */
export type InsightWeight = 'critical' | 'notable' | 'informational'

export interface Insight {
  kind: InsightKind
  weight: InsightWeight
  /** Short enough for a card header. */
  title: string
  /** One or two sentences. States the finding and the number behind it. */
  detail: string
  /** The arithmetic, shown so the claim is checkable rather than trusted. */
  evidence: string
  tradeIds: string[]
  /** Sample the finding rests on. Rendered so the trader can judge it. */
  sample: number
}

/* ═════════════════════════════════════════════════════════ sample gates ══ */

/**
 * Below these counts a detector stays silent. They are not arbitrary: they are
 * the point at which a difference could plausibly survive a significance test
 * at all, so speaking earlier would mean speaking without grounds.
 */
const MIN = {
  /** Anything comparing two groups. */
  group: 5,
  /** Detectors that read a whole history for drift. */
  history: 20,
  /** Per-bucket minimum when slicing by weekday/session/pair/strategy. */
  bucket: 6,
  /** Sequence-based behaviour (after a loss, after a win). */
  sequence: 8,
} as const

/* ══════════════════════════════════════════════════════════════ helpers ══ */

const rOf = (t: Trade): number | null =>
  typeof t.rMultiple === 'number' && Number.isFinite(t.rMultiple) ? t.rMultiple : null

const rs = (ts: Trade[]): number[] => ts.map(rOf).filter((r): r is number => r !== null)

const sizes = (ts: Trade[]): number[] =>
  ts.map((t) => t.lotSize).filter((l): l is number => typeof l === 'number' && l > 0)

function money(n: number): string {
  const s = n > 0 ? '+' : n < 0 ? '−' : ''
  return `${s}$${Math.abs(round2(n)).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}

function rr(n: number): string {
  const s = n > 0 ? '+' : n < 0 ? '−' : ''
  return `${s}${Math.abs(n).toFixed(2)}R`
}

function pct(n: number): string {
  return `${round2(n)}%`
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/** Group trades by a derived key, dropping ones the key doesn't apply to. */
function bucketBy<K extends string>(
  trades: Trade[],
  keyOf: (t: Trade) => K | null,
): Map<K, Trade[]> {
  const out = new Map<K, Trade[]>()
  for (const t of trades) {
    const k = keyOf(t)
    if (k === null) continue
    const arr = out.get(k)
    if (arr) arr.push(t)
    else out.set(k, [t])
  }
  return out
}

/* ══════════════════════════════════════════════ detectors: in-the-moment ══ */

export interface DetectorOptions {
  sizeMultiple?: number
  revengeWindowMin?: number
  overtradeMultiple?: number
}

const DEFAULTS: Required<DetectorOptions> = {
  sizeMultiple: 1.75,
  revengeWindowMin: 60,
  overtradeMultiple: 1.6,
}

/**
 * Revenge trading: an oversized trade taken shortly after a loss.
 *
 * "Oversized" is measured against this trader's own median, never an absolute
 * number — a 0.05-lot trader and a 5-lot trader get the same read.
 */
export function detectRevenge(input: Trade[], opts: DetectorOptions = {}): Insight[] {
  const { sizeMultiple, revengeWindowMin } = { ...DEFAULTS, ...opts }
  const trades = sortChronological(closedOnly(input))
  const allSizes = sizes(trades)
  if (allSizes.length < MIN.group) return []
  const usual = median(allSizes)
  if (usual <= 0) return []

  const hits: Trade[] = []
  const partners: Trade[] = []
  for (let i = 1; i < trades.length; i++) {
    const prev = trades[i - 1]
    const cur = trades[i]
    if (prev.pnl >= 0) continue
    const size = cur.lotSize
    if (typeof size !== 'number' || size <= 0) continue
    if (size < usual * sizeMultiple) continue

    const gap = minutesBetween(prev, cur)
    if (gap !== null && gap > revengeWindowMin) continue
    if (gap === null && cur.date !== prev.date) continue
    hits.push(cur)
    partners.push(prev)
  }

  if (hits.length === 0) return []

  const stats = computeStats(hits)
  const rest = computeStats(trades.filter((t) => !hits.includes(t)))
  const multiple = round2(mean(sizes(hits)) / usual)

  return [
    {
      kind: 'revenge',
      weight: hits.length >= 3 ? 'critical' : 'notable',
      title: 'Size goes up straight after a loss',
      detail:
        `${plural(hits.length, 'trade')} came within ${revengeWindowMin} minutes of a loss at about ${multiple}× your usual size. ` +
        `They made ${money(stats.pnl)}.`,
      evidence:
        `Usual size ${round2(usual)} lots · these averaged ${round2(mean(sizes(hits)))} · ` +
        `win rate ${stats.winRate === null ? '—' : pct(stats.winRate)} against ${rest.winRate === null ? '—' : pct(rest.winRate)} on everything else`,
      tradeIds: [...new Set([...partners, ...hits].map((t) => t.id))],
      sample: hits.length,
    },
  ]
}

/** Days whose trade count sits well above this trader's own active-day average. */
export function detectOvertrading(input: Trade[], opts: DetectorOptions = {}): Insight[] {
  const { overtradeMultiple } = { ...DEFAULTS, ...opts }
  const trades = closedOnly(input)
  const byDay = bucketBy(trades, (t) => t.date)
  if (byDay.size < 4) return []

  const counts = [...byDay.values()].map((l) => l.length)
  const avg = mean(counts)
  if (avg <= 0) return []

  const busy = [...byDay.entries()].filter(
    ([, l]) => l.length > Math.max(avg * overtradeMultiple, avg + 1),
  )
  if (busy.length === 0) return []

  const busyTrades = busy.flatMap(([, l]) => l)
  const normalTrades = trades.filter((t) => !busyTrades.includes(t))
  const busyStats = computeStats(busyTrades)
  const normalStats = computeStats(normalTrades)

  // Only claim the busy days are *worse* when the numbers support it.
  const busyR = rs(busyTrades)
  const normalR = rs(normalTrades)
  const worse =
    busyR.length >= MIN.group &&
    normalR.length >= MIN.group &&
    mean(busyR) < mean(normalR) &&
    isRealDifference(busyR, normalR, MIN.group)

  return [
    {
      kind: 'overtrading',
      weight: worse ? 'critical' : 'informational',
      title: worse ? 'Busy days cost you' : 'Some days run much busier than others',
      detail: worse
        ? `On your ${plural(busy.length, 'busiest day')} you averaged ${rr(mean(busyR))} per trade, against ${rr(mean(normalR))} on normal days.`
        : `${plural(busy.length, 'day')} ran well above your average of ${round2(avg)} trades. Those days came to ${money(busyStats.pnl)}.`,
      evidence: worse
        ? `${busyTrades.length} trades on busy days vs ${normalTrades.length} on the rest · busy days ${money(busyStats.pnl)}, normal ${money(normalStats.pnl)}`
        : `Busiest: ${busy.map(([d, l]) => `${d} (${l.length})`).join(', ')}`,
      tradeIds: busyTrades.map((t) => t.id),
      sample: busyTrades.length,
    },
  ]
}

/** A day that ended on a run of losses — the classic tilt shape. */
export function detectTilt(input: Trade[]): Insight[] {
  const trades = closedOnly(input)
  const byDay = bucketBy(trades, (t) => t.date)
  const tiltDays: { date: string; run: Trade[] }[] = []

  for (const [date, list] of byDay) {
    if (list.length < 3) continue
    const ordered = sortChronological(list)
    let tail = 0
    for (let i = ordered.length - 1; i >= 0; i--) {
      if (ordered[i].pnl < 0) tail++
      else break
    }
    if (tail >= 3) tiltDays.push({ date, run: ordered.slice(-tail) })
  }

  if (tiltDays.length === 0) return []
  const all = tiltDays.flatMap((d) => d.run)
  const cost = computeStats(all).pnl

  return [
    {
      kind: 'tilt',
      weight: tiltDays.length >= 2 ? 'critical' : 'notable',
      title: 'Days that ended on a losing run',
      detail:
        `${plural(tiltDays.length, 'day')} finished with three or more losses in a row. ` +
        `Those closing runs cost ${money(cost)}.`,
      evidence: tiltDays
        .map((d) => `${d.date}: ${d.run.length} straight losses`)
        .join(' · '),
      tradeIds: all.map((t) => t.id),
      sample: all.length,
    },
  ]
}

/** Position size trending upward across the whole history. */
export function detectSizeCreep(input: Trade[]): Insight[] {
  const trades = sortChronological(closedOnly(input))
  const withSize = trades.filter((t) => typeof t.lotSize === 'number' && t.lotSize > 0)
  if (withSize.length < MIN.history) return []

  const series = withSize.map((t) => t.lotSize as number)
  const slope = linearSlope(series)
  if (slope === null || slope <= 0) return []

  const first = series.slice(0, Math.floor(series.length / 3))
  const last = series.slice(-Math.floor(series.length / 3))
  const growth = mean(last) / (mean(first) || 1)

  // Needs to be a real climb, not drift — 25% up and statistically separable.
  if (growth < 1.25) return []
  if (!isRealDifference(last, first, MIN.group)) return []

  const earlyR = rs(withSize.slice(0, Math.floor(withSize.length / 3)))
  const lateR = rs(withSize.slice(-Math.floor(withSize.length / 3)))
  const resultsHeld =
    earlyR.length >= MIN.group && lateR.length >= MIN.group
      ? mean(lateR) >= mean(earlyR)
      : null

  return [
    {
      kind: 'size-creep',
      weight: resultsHeld === false ? 'critical' : 'notable',
      title: 'Your position size has been climbing',
      detail:
        `Recent trades average ${round2(mean(last))} lots against ${round2(mean(first))} early on — about ${round2(growth)}× bigger.` +
        (resultsHeld === false
          ? ` Results per trade went the other way: ${rr(mean(lateR))} recently against ${rr(mean(earlyR))} earlier.`
          : resultsHeld === true
            ? ` Results per trade held up as it grew.`
            : ''),
      evidence: `${withSize.length} sized trades · first third avg ${round2(mean(first))} · last third avg ${round2(mean(last))}`,
      tradeIds: withSize.slice(-last.length).map((t) => t.id),
      sample: withSize.length,
    },
  ]
}

/* ═══════════════════════════════════════════════ detectors: the classics ══ */

/**
 * Cutting winners short — a high win rate paired with an average win smaller
 * than the average loss. The shape of a trader who takes profit for relief.
 */
export function detectCuttingWinners(input: Trade[]): Insight[] {
  const trades = closedOnly(input)
  if (trades.length < MIN.history) return []

  const wins = trades.filter((t) => t.pnl > 0)
  const losses = trades.filter((t) => t.pnl < 0)
  if (wins.length < MIN.group || losses.length < MIN.group) return []

  const winR = rs(wins)
  const lossR = rs(losses).map(Math.abs)
  if (winR.length < MIN.group || lossR.length < MIN.group) return []

  const avgWin = mean(winR)
  const avgLoss = mean(lossR)
  if (avgWin >= avgLoss) return []

  const stats = computeStats(trades)
  const winRate = stats.winRate ?? 0
  // Only interesting when they *are* winning often — otherwise it's just a
  // losing system, which the P&L already says plainly.
  if (winRate < 50) return []

  const breakeven = (avgLoss / (avgWin + avgLoss)) * 100

  return [
    {
      kind: 'cutting-winners',
      weight: 'notable',
      title: 'You win often, but small',
      detail:
        `You win ${pct(winRate)} of the time, yet your average win is ${rr(avgWin)} against ${rr(-avgLoss)} on losers. ` +
        `At that ratio you need to win ${pct(breakeven)} of the time just to break even.`,
      evidence: `${wins.length} winners avg ${rr(avgWin)} · ${losses.length} losers avg ${rr(-avgLoss)} · expectancy ${stats.expectancyR === null ? '—' : rr(stats.expectancyR)}`,
      tradeIds: wins.map((t) => t.id),
      sample: trades.length,
    },
  ]
}

/**
 * The disposition effect: holding losers longer than winners, in the hope they
 * come back. Needs both open and close clock times to be visible at all.
 */
export function detectHoldingLosers(input: Trade[]): Insight[] {
  const trades = closedOnly(input)
  const timed = trades
    .map((t) => ({ t, mins: durationMinutes(t) }))
    .filter((x): x is { t: Trade; mins: number } => x.mins !== null && x.mins > 0)

  const winHold = timed.filter((x) => x.t.pnl > 0).map((x) => x.mins)
  const lossHold = timed.filter((x) => x.t.pnl < 0).map((x) => x.mins)
  if (winHold.length < MIN.group || lossHold.length < MIN.group) return []
  if (!isRealDifference(lossHold, winHold, MIN.group)) return []
  if (mean(lossHold) <= mean(winHold)) return []

  const ratio = mean(lossHold) / mean(winHold)

  return [
    {
      kind: 'holding-losers',
      weight: 'notable',
      title: 'Losers get held longer than winners',
      detail:
        `Your losing trades stay open about ${round2(ratio)}× as long as your winners — ` +
        `${fmtMins(mean(lossHold))} against ${fmtMins(mean(winHold))}.`,
      evidence: `${lossHold.length} timed losers vs ${winHold.length} timed winners · median ${fmtMins(median(lossHold))} vs ${fmtMins(median(winHold))}`,
      tradeIds: timed.filter((x) => x.t.pnl < 0).map((x) => x.t.id),
      sample: timed.length,
    },
  ]
}

/**
 * Does performance decay as the day goes on? Compares the first trade of each
 * day against the third and later.
 */
export function detectTradeOrderDecay(input: Trade[]): Insight[] {
  const trades = closedOnly(input)
  const byDay = bucketBy(trades, (t) => t.date)

  const firsts: Trade[] = []
  const laters: Trade[] = []
  for (const [, list] of byDay) {
    const ordered = sortChronological(list)
    if (ordered.length >= 1) firsts.push(ordered[0])
    if (ordered.length >= 3) laters.push(...ordered.slice(2))
  }
  if (firsts.length < MIN.bucket || laters.length < MIN.bucket) return []

  const fR = rs(firsts)
  const lR = rs(laters)
  if (fR.length < MIN.group || lR.length < MIN.group) return []
  if (!isRealDifference(fR, lR, MIN.group)) return []

  const better = mean(fR) > mean(lR)
  const fStats = computeStats(firsts)
  const lStats = computeStats(laters)

  return [
    {
      kind: 'trade-order-decay',
      weight: better ? 'critical' : 'informational',
      title: better ? 'Your first trade of the day is your best' : 'You warm up as the day goes on',
      detail: better
        ? `First trades average ${rr(mean(fR))}. From the third trade onward that drops to ${rr(mean(lR))}.`
        : `Your third-and-later trades average ${rr(mean(lR))}, ahead of ${rr(mean(fR))} on first trades.`,
      evidence: `${firsts.length} first trades ${money(fStats.pnl)} · ${laters.length} later trades ${money(lStats.pnl)}`,
      tradeIds: (better ? laters : firsts).map((t) => t.id),
      sample: firsts.length + laters.length,
    },
  ]
}

/* ══════════════════════════════════════════════════ detectors: the slices ══ */

/**
 * One bucket standing clearly apart from the rest. Shared by weekday, session,
 * pair and strategy, because the statistical question is identical and only
 * the labels change.
 */
function sliceEdge(
  trades: Trade[],
  keyOf: (t: Trade) => string | null,
  label: (key: string) => string,
  kind: InsightKind,
  noun: string,
): Insight[] {
  const buckets = bucketBy(trades, keyOf)
  if (buckets.size < 2) return []

  const eligible = [...buckets.entries()].filter(([, l]) => l.length >= MIN.bucket)
  if (eligible.length < 2) return []

  const scored = eligible
    .map(([key, list]) => ({ key, list, r: rs(list), stats: computeStats(list) }))
    .filter((x) => x.r.length >= MIN.group)
  if (scored.length < 2) return []

  scored.sort((a, b) => mean(b.r) - mean(a.r))
  const best = scored[0]
  const worst = scored[scored.length - 1]
  if (best.key === worst.key) return []

  // The rest of the book, so "worst" is compared against everything else
  // rather than only against the single best bucket.
  const others = scored.filter((x) => x.key !== worst.key).flatMap((x) => x.r)
  if (!isRealDifference(worst.r, others, MIN.group)) return []
  if (mean(worst.r) >= mean(others)) return []

  const out: Insight[] = [
    {
      kind,
      weight: worst.stats.pnl < 0 ? 'critical' : 'notable',
      title: `${label(worst.key)} is your weakest ${noun}`,
      detail:
        `${label(worst.key)} averages ${rr(mean(worst.r))} per trade against ${rr(mean(others))} everywhere else, ` +
        `over ${plural(worst.list.length, 'trade')} for ${money(worst.stats.pnl)}.`,
      evidence: scored
        .map((x) => `${label(x.key)} ${rr(mean(x.r))} (${x.list.length})`)
        .join(' · '),
      tradeIds: worst.list.map((t) => t.id),
      sample: worst.list.length,
    },
  ]

  // Only call out a best when it is *also* separable from the field.
  const bestOthers = scored.filter((x) => x.key !== best.key).flatMap((x) => x.r)
  if (isRealDifference(best.r, bestOthers, MIN.group) && mean(best.r) > mean(bestOthers)) {
    out.push({
      kind,
      weight: 'informational',
      title: `${label(best.key)} is your strongest ${noun}`,
      detail: `${label(best.key)} averages ${rr(mean(best.r))} per trade against ${rr(mean(bestOthers))} elsewhere, over ${plural(best.list.length, 'trade')}.`,
      evidence: `${money(best.stats.pnl)} across ${best.list.length} trades · win rate ${best.stats.winRate === null ? '—' : pct(best.stats.winRate)}`,
      tradeIds: best.list.map((t) => t.id),
      sample: best.list.length,
    })
  }

  return out
}

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function detectWeekdayEdge(input: Trade[]): Insight[] {
  return sliceEdge(
    closedOnly(input),
    (t) => String(new Date(`${t.date}T00:00:00Z`).getUTCDay()),
    (k) => WEEKDAY[Number(k)],
    'weekday-edge',
    'day',
  )
}

export function detectSessionEdge(
  input: Trade[],
  windows?: SessionWindow[],
): Insight[] {
  // The trader's own windows when they have them — their "London" is the one
  // worth reporting on, not ours.
  if (windows && windows.length > 0) {
    return sliceEdge(
      closedOnly(input),
      (t) => sessionLabelFor(t.time, windows),
      (k) => k,
      'session-edge',
      'session',
    )
  }
  return sliceEdge(
    closedOnly(input),
    (t) => {
      const s = sessionOf(t.time)
      return s && s !== 'off' ? s : null
    },
    (k) => SESSION_LABEL[k as keyof typeof SESSION_LABEL] ?? k,
    'session-edge',
    'session',
  )
}

export function detectPairLeak(input: Trade[]): Insight[] {
  return sliceEdge(
    closedOnly(input),
    (t) => t.pair.toUpperCase() || null,
    (k) => k,
    'pair-leak',
    'pair',
  )
}

export function detectStrategyEdge(input: Trade[], strategies: Strategy[] = []): Insight[] {
  const nameOf = (id: string) =>
    strategies.find((s) => s.id === id)?.name ?? 'an unnamed strategy'
  return sliceEdge(
    closedOnly(input),
    (t) => t.strategyId ?? null,
    nameOf,
    'strategy-edge',
    'strategy',
  )
}

/* ══════════════════════════════════════════════ detectors: the sequences ══ */

/** What happens on the trade immediately after a loss, and after a win. */
function afterOutcome(input: Trade[], want: 'loss' | 'win'): Insight[] {
  const trades = sortChronological(closedOnly(input))
  if (trades.length < MIN.history) return []

  const following: Trade[] = []
  const baseline: Trade[] = []
  for (let i = 1; i < trades.length; i++) {
    const prev = trades[i - 1]
    const isMatch = want === 'loss' ? prev.pnl < 0 : prev.pnl > 0
    if (isMatch) following.push(trades[i])
    else baseline.push(trades[i])
  }
  if (following.length < MIN.sequence || baseline.length < MIN.sequence) return []

  const fR = rs(following)
  const bR = rs(baseline)
  if (fR.length < MIN.group || bR.length < MIN.group) return []
  if (!isRealDifference(fR, bR, MIN.group)) return []

  const worse = mean(fR) < mean(bR)
  const fStats = computeStats(following)

  // Size behaviour alongside the result, because that is the actionable half.
  const fSizes = sizes(following)
  const bSizes = sizes(baseline)
  const sizeNote =
    fSizes.length >= MIN.group && bSizes.length >= MIN.group
      ? ` Size after: ${round2(mean(fSizes))} lots against ${round2(mean(bSizes))} otherwise.`
      : ''

  return [
    {
      kind: want === 'loss' ? 'after-loss' : 'after-win',
      weight: worse ? 'critical' : 'informational',
      title: worse
        ? `The trade after a ${want} is your weak spot`
        : `You handle the trade after a ${want} well`,
      detail:
        `Trades taken straight after a ${want} average ${rr(mean(fR))}, against ${rr(mean(bR))} otherwise.` +
        sizeNote,
      evidence: `${following.length} such trades ${money(fStats.pnl)} · win rate ${fStats.winRate === null ? '—' : pct(fStats.winRate)}`,
      tradeIds: following.map((t) => t.id),
      sample: following.length,
    },
  ]
}

export const detectAfterLoss = (t: Trade[]) => afterOutcome(t, 'loss')
export const detectAfterWin = (t: Trade[]) => afterOutcome(t, 'win')

/** Sizing up while already in a losing streak. */
export function detectStreakSizing(input: Trade[]): Insight[] {
  const trades = sortChronological(closedOnly(input))
  if (trades.length < MIN.history) return []

  const inStreak: Trade[] = []
  const normal: Trade[] = []
  let run = 0
  for (const t of trades) {
    if (run >= 2) inStreak.push(t)
    else normal.push(t)
    run = t.pnl < 0 ? run + 1 : 0
  }

  const a = sizes(inStreak)
  const b = sizes(normal)
  if (a.length < MIN.group || b.length < MIN.group) return []
  if (!isRealDifference(a, b, MIN.group)) return []
  if (mean(a) <= mean(b)) return []

  const stats = computeStats(inStreak)
  return [
    {
      kind: 'streak-sizing',
      weight: 'critical',
      title: 'You size up during losing streaks',
      detail:
        `After two or more losses in a row your next trade averages ${round2(mean(a))} lots, against ${round2(mean(b))} normally. ` +
        `Those trades came to ${money(stats.pnl)}.`,
      evidence: `${inStreak.length} trades taken mid-streak · win rate ${stats.winRate === null ? '—' : pct(stats.winRate)}`,
      tradeIds: inStreak.map((t) => t.id),
      sample: inStreak.length,
    },
  ]
}

/** Loss bigger than the risk that was declared — a stop that moved. */
export function detectStopDiscipline(input: Trade[]): Insight[] {
  const trades = closedOnly(input)
  const candidates = trades.filter(
    (t) =>
      t.pnl < 0 &&
      typeof t.riskAmount === 'number' &&
      t.riskAmount > 0 &&
      Math.abs(t.pnl) > t.riskAmount * 1.15,
  )
  if (candidates.length < 3) return []

  const overshoot = candidates.map((t) => Math.abs(t.pnl) / (t.riskAmount as number))
  const excess = candidates.reduce(
    (sum, t) => sum + (Math.abs(t.pnl) - (t.riskAmount as number)),
    0,
  )

  return [
    {
      kind: 'stop-discipline',
      weight: 'critical',
      title: 'Some losses ran past the risk you set',
      detail:
        `${plural(candidates.length, 'losing trade')} lost more than the risk recorded on them — ` +
        `on average ${round2(mean(overshoot))}× the planned amount. The extra came to ${money(-excess)}.`,
      evidence: candidates
        .slice(0, 4)
        .map((t) => `${t.date} ${t.pair.toUpperCase()} risked ${money(t.riskAmount as number)}, lost ${money(t.pnl)}`)
        .join(' · '),
      tradeIds: candidates.map((t) => t.id),
      sample: candidates.length,
    },
  ]
}

/** Do trades you wrote a reason for perform differently from ones you didn't? */
export function detectJournalingQuality(input: Trade[]): Insight[] {
  const trades = closedOnly(input)
  if (trades.length < MIN.history) return []

  const withReason = trades.filter((t) => (t.reason ?? '').trim().length > 0)
  const without = trades.filter((t) => (t.reason ?? '').trim().length === 0)
  const a = rs(withReason)
  const b = rs(without)
  if (a.length < MIN.bucket || b.length < MIN.bucket) return []
  if (!isRealDifference(a, b, MIN.group)) return []

  const better = mean(a) > mean(b)
  // Correlation, not cause, and the copy says so — the trades you can explain
  // are probably the ones you had a reason for taking.
  return [
    {
      kind: 'journaling-quality',
      weight: better ? 'notable' : 'informational',
      title: better
        ? 'Trades you explained did better'
        : 'Trades you explained did worse',
      detail:
        `Trades with a written reason average ${rr(mean(a))}, against ${rr(mean(b))} for the ones logged without. ` +
        `That is a pattern in the data, not proof the writing caused it.`,
      evidence: `${withReason.length} with a reason ${money(computeStats(withReason).pnl)} · ${without.length} without ${money(computeStats(without).pnl)}`,
      tradeIds: (better ? without : withReason).map((t) => t.id),
      sample: trades.length,
    },
  ]
}

/** The day after a heavy loss — do they come back swinging, or step back? */
export function detectRecovery(input: Trade[]): Insight[] {
  const trades = closedOnly(input)
  const byDay = bucketBy(trades, (t) => t.date)
  const days = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
  if (days.length < 8) return []

  const dayPnl = days.map(([date, list]) => ({ date, pnl: computeStats(list).pnl, list }))
  const losses = dayPnl.filter((d) => d.pnl < 0).map((d) => d.pnl)
  if (losses.length < 4) return []
  // "Heavy" is relative to this trader: worse than their typical losing day.
  const heavyLine = median(losses)

  const nextDays: Trade[] = []
  for (let i = 0; i < dayPnl.length - 1; i++) {
    if (dayPnl[i].pnl > heavyLine) continue
    const next = dayPnl[i + 1]
    if (daysBetween(dayPnl[i].date, next.date) > 3) continue
    nextDays.push(...next.list)
  }
  if (nextDays.length < MIN.sequence) return []

  const rest = trades.filter((t) => !nextDays.includes(t))
  const a = rs(nextDays)
  const b = rs(rest)
  if (a.length < MIN.group || b.length < MIN.group) return []
  if (!isRealDifference(a, b, MIN.group)) return []

  const worse = mean(a) < mean(b)
  const stats = computeStats(nextDays)

  return [
    {
      kind: 'recovery',
      weight: worse ? 'critical' : 'informational',
      title: worse ? 'The day after a heavy loss goes badly' : 'You recover well after a heavy loss',
      detail:
        `Trading the session after one of your worse days averages ${rr(mean(a))}, against ${rr(mean(b))} otherwise. ` +
        `Those days total ${money(stats.pnl)}.`,
      evidence: `${nextDays.length} trades on recovery days · heavy day defined as worse than ${money(heavyLine)}`,
      tradeIds: nextDays.map((t) => t.id),
      sample: nextDays.length,
    },
  ]
}

/** Does trade count on a day predict how that day goes? */
export function detectDayVolume(input: Trade[]): Insight[] {
  const trades = closedOnly(input)
  const byDay = bucketBy(trades, (t) => t.date)
  if (byDay.size < 10) return []

  const rows = [...byDay.values()].map((l) => ({ n: l.length, stats: computeStats(l) }))
  const light = rows.filter((r) => r.n <= 2)
  const heavy = rows.filter((r) => r.n >= 4)
  if (light.length < 4 || heavy.length < 4) return []

  // Per-trade, so a busy day isn't penalised merely for having more trades.
  const lightPer = light.map((r) => r.stats.pnl / r.n)
  const heavyPer = heavy.map((r) => r.stats.pnl / r.n)
  const t = welchT(heavyPer, lightPer)
  const d = cohensD(heavyPer, lightPer)
  if (t === null || d === null) return []
  if (Math.abs(t) < SIGNIFICANT || Math.abs(d) < 0.5) return []

  const heavyWorse = mean(heavyPer) < mean(lightPer)
  return [
    {
      kind: 'day-volume',
      weight: heavyWorse ? 'notable' : 'informational',
      title: heavyWorse ? 'Quieter days pay better per trade' : 'Busier days pay better per trade',
      detail:
        `On days with four or more trades you make ${money(mean(heavyPer))} per trade. ` +
        `On days with two or fewer, ${money(mean(lightPer))}.`,
      evidence: `${heavy.length} busy days vs ${light.length} quiet days`,
      tradeIds: [],
      sample: heavy.length + light.length,
    },
  ]
}

/**
 * What the trader's own post-mortems add up to.
 *
 * The one detector that reads something self-reported rather than derived —
 * and it earns its place precisely because the vocabulary is fixed. Six trades
 * ticked "moved my stop" is a countable habit with a price attached; six
 * sentences saying roughly that are not.
 */
export function detectSelfReported(input: Trade[]): Insight[] {
  const trades = closedOnly(input)
  const tagged = trades.filter((t) => (t.reasonTags?.length ?? 0) > 0)
  if (tagged.length < MIN.bucket) return []

  const buckets = new Map<string, Trade[]>()
  for (const t of tagged) {
    for (const id of t.reasonTags ?? []) {
      if (!isCostly(id)) continue
      const arr = buckets.get(id)
      if (arr) arr.push(t)
      else buckets.set(id, [t])
    }
  }
  if (buckets.size === 0) return []

  const ranked = [...buckets.entries()]
    .map(([id, list]) => ({ id, list, stats: computeStats(list) }))
    // Ranked by what it cost, not how often it happened — three expensive
    // admissions matter more than ten cheap ones.
    .filter((x) => x.list.length >= 3)
    .sort((a, b) => a.stats.pnl - b.stats.pnl)

  const worst = ranked[0]
  if (!worst || worst.stats.pnl >= 0) return []

  const link = weakestLink(
    tagged.map((t) => ({ tags: t.reasonTags ?? [], pnl: t.pnl })),
  )

  const out: Insight[] = []

  if (link) {
    out.push({
      kind: 'self-reported',
      weight: 'notable',
      title: `${REASON_GROUP_LABEL[link.group]} is where it breaks down`,
      detail:
        `Across ${plural(link.count, 'trade')} you marked something in "${REASON_GROUP_LABEL[link.group]}" as the problem, ` +
        `and those trades came to ${money(link.pnl)}. Your own notes, counted up.`,
      evidence: ranked
        .slice(0, 5)
        .map((x) => `${reasonLabel(x.id)} ${money(x.stats.pnl)} (${x.list.length})`)
        .join(' · '),
      tradeIds: tagged.map((t) => t.id),
      sample: link.count,
    })
  }

  out.push(
    {
      kind: 'self-reported',
      weight: 'notable',
      title: `"${reasonLabel(worst.id)}" is your most expensive habit`,
      detail:
        `You've marked ${plural(worst.list.length, 'trade')} with it, and together they came to ${money(worst.stats.pnl)}. ` +
        `That's your own note on your own trades, not something we inferred.`,
      evidence: ranked
        .slice(0, 4)
        .map((x) => `${reasonLabel(x.id)} ${money(x.stats.pnl)} (${x.list.length})`)
        .join(' · '),
      tradeIds: worst.list.map((t) => t.id),
      sample: worst.list.length,
    },
  )

  return out
}

/**
 * Sizing that wanders, and what the wandering costs.
 *
 * A declared limit is a promise; this reads what was actually used. The two
 * come apart more often than traders expect, and when they do the account's
 * results are decided almost entirely by the handful of trades that got sized
 * up rather than by the edge itself.
 */
export function detectRiskConsistency(
  input: Trade[],
  declaredPct?: number,
  riskBase?: number | null,
): Insight[] {
  const trades = closedOnly(input)
  const summary = riskConsistency({ trades, declaredPct, riskBase })
  if (summary.tradesWithRisk < MIN.history) return []

  const out: Insight[] = []

  // Erratic sizing, stated with what "erratic" means here.
  if (summary.consistencyScore !== null && summary.consistencyScore < 45) {
    out.push({
      kind: 'risk-consistency',
      weight: 'critical',
      title: 'Your position sizing is inconsistent',
      detail:
        `You typically risk ${summary.medianRiskPct}% but the range runs ${summary.smallestRiskPct}% to ${summary.largestRiskPct}%. ` +
        `Only ${Math.round(summary.withinBandPct ?? 0)}% of trades sit near your own normal size.`,
      evidence: `${summary.tradesWithRisk} sized trades · ${money(summary.totalRisked)} risked in total · ${money(summary.netPnl)} made`,
      tradeIds: [],
      sample: summary.tradesWithRisk,
    })
  }

  // The rule and the habit having drifted apart.
  if (
    summary.declaredPct !== null &&
    summary.medianRiskPct !== null &&
    summary.driftPct !== null &&
    Math.abs(summary.driftPct) > summary.declaredPct * 0.3
  ) {
    const over = summary.driftPct > 0
    out.push({
      kind: 'risk-consistency',
      weight: over ? 'critical' : 'notable',
      title: over
        ? 'You risk more than the rule you set'
        : 'You risk less than the rule you set',
      detail: over
        ? `Your limit is ${summary.declaredPct}% but you typically risk ${summary.medianRiskPct}%, and ${plural(summary.overDeclared, 'trade')} went over it outright.`
        : `Your limit is ${summary.declaredPct}% but you typically risk ${summary.medianRiskPct}% — consistently less than you allow yourself.`,
      evidence: `${summary.tradesWithRisk} sized trades · median ${summary.medianRiskPct}% · largest ${summary.largestRiskPct}%`,
      tradeIds: [],
      sample: summary.tradesWithRisk,
    })
  }

  // Whether backing a trade harder actually works.
  const conviction = convictionCheck(trades, riskBase)
  if (
    conviction.line &&
    conviction.bigExpectancyR !== null &&
    conviction.normalExpectancyR !== null &&
    conviction.bigExpectancyR < conviction.normalExpectancyR
  ) {
    out.push({
      kind: 'risk-consistency',
      weight: 'critical',
      title: 'The trades you back hardest do worst',
      detail: conviction.line,
      evidence: `${conviction.bigTrades} bigger trades ${money(conviction.bigPnl)} · ${conviction.normalTrades} normal ${money(conviction.normalPnl)}`,
      tradeIds: [],
      sample: conviction.bigTrades + conviction.normalTrades,
    })
  }

  return out
}

/* ═══════════════════════════════════════════════════════════ the runner ══ */

const WEIGHT_ORDER: Record<InsightWeight, number> = {
  critical: 0,
  notable: 1,
  informational: 2,
}

export interface EngineOptions extends DetectorOptions {
  strategies?: Strategy[]
  /** The trader's own sessions, if they've defined any. */
  sessionWindows?: SessionWindow[]
  /** The account's declared max risk, for the declared-vs-used comparison. */
  declaredRiskPct?: number
  /** Balance to rebuild a risk percentage from, when only money was stored. */
  riskBase?: number | null
  /** Cap the returned list; the ranking already puts the useful ones first. */
  limit?: number
}

/**
 * Run every detector and rank what survived.
 *
 * Detectors are independent and none of them see each other's output, so a
 * quiet result here means the data genuinely didn't support anything — not
 * that a check was skipped.
 */
export function analyse(trades: Trade[], opts: EngineOptions = {}): Insight[] {
  const { strategies = [], limit } = opts
  const closed = closedOnly(trades)

  const found: Insight[] = [
    ...detectRevenge(closed, opts),
    ...detectOvertrading(closed, opts),
    ...detectTilt(closed),
    ...detectSizeCreep(closed),
    ...detectCuttingWinners(closed),
    ...detectHoldingLosers(closed),
    ...detectTradeOrderDecay(closed),
    ...detectWeekdayEdge(closed),
    ...detectSessionEdge(closed, opts.sessionWindows),
    ...detectPairLeak(closed),
    ...detectStrategyEdge(closed, strategies),
    ...detectAfterLoss(closed),
    ...detectAfterWin(closed),
    ...detectStreakSizing(closed),
    ...detectStopDiscipline(closed),
    ...detectJournalingQuality(closed),
    ...detectRecovery(closed),
    ...detectDayVolume(closed),
    ...detectSelfReported(closed),
    ...detectRiskConsistency(closed, opts.declaredRiskPct, opts.riskBase),
  ]

  found.sort((a, b) => {
    const w = WEIGHT_ORDER[a.weight] - WEIGHT_ORDER[b.weight]
    if (w !== 0) return w
    // Within a weight, the larger sample is the more trustworthy claim.
    return b.sample - a.sample
  })

  return typeof limit === 'number' ? found.slice(0, limit) : found
}

/**
 * How much of the engine can even run yet.
 *
 * Shown to the trader so an empty Insights page reads as "not yet" rather than
 * "nothing wrong" — which would be a much worse thing to imply.
 */
export interface EngineReadiness {
  closedTrades: number
  /** 0–1, how close they are to the point where most detectors can speak. */
  progress: number
  missing: string[]
}

export function readiness(trades: Trade[]): EngineReadiness {
  const closed = closedOnly(trades)
  const missing: string[] = []

  if (closed.length < MIN.history) {
    missing.push(`${MIN.history - closed.length} more logged trades`)
  }
  if (rs(closed).length < MIN.group) {
    missing.push('risk or R on a few trades, so results are comparable')
  }
  if (closed.filter((t) => t.time).length < MIN.bucket) {
    missing.push('a clock time on a few trades, for session patterns')
  }
  if (closed.filter((t) => durationMinutes(t) !== null).length < MIN.group) {
    missing.push('close times, so hold length can be read')
  }

  return {
    closedTrades: closed.length,
    progress: Math.min(1, closed.length / MIN.history),
    missing,
  }
}

/* ═══════════════════════════════════════════════════════════════ streak ══ */

export interface Streak {
  current: number
  longest: number
  lastLoggedDate: string | null
}

/**
 * Consecutive *days logged* — never consecutive wins. Gamifying wins would
 * gamify risk-taking, which is the opposite of the point.
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
  const gap = daysBetween(last, todayStr)
  let current = 0
  if (gap === 0 || gap === 1) {
    current = 1
    for (let i = days.length - 1; i > 0; i--) {
      if (daysBetween(days[i - 1], days[i]) === 1) current++
      else break
    }
  }
  return { current, longest, lastLoggedDate: last }
}

/* ══════════════════════════════════════════════════════ legacy surface ══ */

/**
 * The old flag shape, kept so existing screens keep working while they move
 * over to `analyse`. New code should use `Insight`.
 */
export interface BehaviourFlag {
  kind: string
  title: string
  detail: string
  tradeIds: string[]
  date?: string
}

export function allFlags(trades: Trade[], opts: EngineOptions = {}): BehaviourFlag[] {
  return analyse(trades, opts).map((i) => ({
    kind: i.kind,
    title: i.title,
    detail: i.detail,
    tradeIds: i.tradeIds,
  }))
}

/* ═══════════════════════════════════════════════════════════════ utils ══ */

function minutesBetween(a: Trade, b: Trade): number | null {
  if (!a.time || !b.time) return null
  const dayGap = daysBetween(a.date, b.date)
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  return dayGap * 1440 + toMin(b.time) - toMin(a.time)
}

function fmtMins(mins: number): string {
  if (mins < 60) return `${Math.round(mins)}m`
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  if (h < 24) return m === 0 ? `${h}h` : `${h}h ${m}m`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}

export { computeStats }
export type { Stats }
export { wilsonLowerBound, twoProportionZ }
