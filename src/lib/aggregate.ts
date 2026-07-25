/**
 * Rollups and trader math. Pure functions over Trade[] — no Firestore, no
 * React — so the calendar, the review screen, the Pro analytics and the
 * end-of-day email all compute identical numbers from identical code.
 */

import { round2 } from './calc'
import { durationMinutes, sessionOf, type TradingSession } from './dates'
import type { Trade } from './types'

export interface Stats {
  trades: number
  wins: number
  losses: number
  flats: number
  pnl: number
  winRate: number | null
  /** gross profit ÷ gross loss. null when there are no losses to divide by. */
  profitFactor: number | null
  grossProfit: number
  grossLoss: number
  avgWin: number | null
  avgLoss: number | null
  /** Average R per trade — the number that actually predicts an edge. */
  expectancyR: number | null
  /** Average PnL per trade in currency. */
  expectancy: number | null
  bestTrade: number | null
  worstTrade: number | null
  totalR: number | null
}

export const EMPTY_STATS: Stats = {
  trades: 0,
  wins: 0,
  losses: 0,
  flats: 0,
  pnl: 0,
  winRate: null,
  profitFactor: null,
  grossProfit: 0,
  grossLoss: 0,
  avgWin: null,
  avgLoss: null,
  expectancyR: null,
  expectancy: null,
  bestTrade: null,
  worstTrade: null,
  totalR: null,
}

/** Trades that have a result. Everything statistical runs on these only. */
export function closedOnly(trades: Trade[]): Trade[] {
  return trades.filter((t) => t.status !== 'open')
}

export function openOnly(trades: Trade[]): Trade[] {
  return trades.filter((t) => t.status === 'open')
}

/**
 * Stats over *closed* trades only.
 *
 * Filtering here rather than at every call site is deliberate: an open trade
 * carries a placeholder P&L of 0, and letting one leak into a win-rate or a
 * profit-factor would quietly understate the trader's edge. One gate, one
 * place, impossible to forget.
 */
export function computeStats(input: Trade[]): Stats {
  const trades = closedOnly(input)
  if (trades.length === 0) return EMPTY_STATS

  let wins = 0
  let losses = 0
  let flats = 0
  let grossProfit = 0
  let grossLoss = 0
  let rSum = 0
  let rCount = 0
  let best = -Infinity
  let worst = Infinity

  for (const t of trades) {
    const pnl = t.pnl
    if (pnl > 0) {
      wins++
      grossProfit += pnl
    } else if (pnl < 0) {
      losses++
      grossLoss += Math.abs(pnl)
    } else {
      flats++
    }
    if (pnl > best) best = pnl
    if (pnl < worst) worst = pnl
    if (typeof t.rMultiple === 'number' && Number.isFinite(t.rMultiple)) {
      rSum += t.rMultiple
      rCount++
    }
  }

  const pnl = round2(grossProfit - grossLoss)
  // Flats are trades taken, so they count against win rate honestly.
  const decided = wins + losses + flats

  return {
    trades: trades.length,
    wins,
    losses,
    flats,
    pnl,
    winRate: decided > 0 ? round2((wins / decided) * 100) : null,
    profitFactor: grossLoss > 0 ? round2(grossProfit / grossLoss) : null,
    grossProfit: round2(grossProfit),
    grossLoss: round2(grossLoss),
    avgWin: wins > 0 ? round2(grossProfit / wins) : null,
    avgLoss: losses > 0 ? round2(grossLoss / losses) : null,
    expectancyR: rCount > 0 ? round2(rSum / rCount) : null,
    expectancy: round2(pnl / trades.length),
    bestTrade: best === -Infinity ? null : round2(best),
    worstTrade: worst === Infinity ? null : round2(worst),
    totalR: rCount > 0 ? round2(rSum) : null,
  }
}

// ---------------------------------------------------------------------------
// Bucketing

export type DayBuckets = Map<string, Trade[]>

export function groupByDay(trades: Trade[]): DayBuckets {
  const map: DayBuckets = new Map()
  for (const t of trades) {
    const arr = map.get(t.date)
    if (arr) arr.push(t)
    else map.set(t.date, [t])
  }
  return map
}

export interface DaySummary {
  date: string
  /** Everything logged that day, open and closed. */
  trades: Trade[]
  /** Closed trades only — what the stats were computed from. */
  stats: Stats
  /** Still waiting on a result. Never colours the day. */
  open: number
  outcome: 'win' | 'loss' | 'flat' | 'open'
  violations: number
}

export function summarizeDay(date: string, trades: Trade[]): DaySummary {
  const stats = computeStats(trades)
  const open = openOnly(trades).length

  return {
    date,
    trades,
    stats,
    open,
    // A day with nothing resolved yet is 'open', not 'flat' — showing a
    // break-even day when the trade is still running would be a lie.
    outcome:
      stats.trades === 0 && open > 0
        ? 'open'
        : stats.pnl > 0
          ? 'win'
          : stats.pnl < 0
            ? 'loss'
            : 'flat',
    violations: trades.reduce((n, t) => n + (t.ruleViolations?.length ?? 0), 0),
  }
}

export function summarizeDays(trades: Trade[]): Map<string, DaySummary> {
  const out = new Map<string, DaySummary>()
  for (const [date, list] of groupByDay(trades)) {
    out.set(date, summarizeDay(date, list))
  }
  return out
}

export function tradesInRange(trades: Trade[], start: string, end: string): Trade[] {
  return trades.filter((t) => t.date >= start && t.date <= end)
}

// ---------------------------------------------------------------------------
// Equity curve

export interface EquityPoint {
  /** 0 = starting balance, then one point per trade. */
  index: number
  cumulative: number
  trade?: Trade
}

/**
 * Cumulative PnL, trade by trade, starting at 0. Ordered by time when trades
 * carry a clock time, otherwise by insertion (createdAt) — a day's trades
 * without times still produce a stable, meaningful curve.
 */
export function equityCurve(trades: Trade[]): EquityPoint[] {
  // Closed only: an open trade has a placeholder P&L of 0 and would draw a
  // flat step into the curve, implying a break-even that never happened.
  const ordered = sortChronological(closedOnly(trades))
  const points: EquityPoint[] = [{ index: 0, cumulative: 0 }]
  let running = 0
  ordered.forEach((t, i) => {
    running = round2(running + t.pnl)
    points.push({ index: i + 1, cumulative: running, trade: t })
  })
  return points
}

export function sortChronological(trades: Trade[]): Trade[] {
  return [...trades].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    if (a.time && b.time && a.time !== b.time) return a.time < b.time ? -1 : 1
    if (a.time && !b.time) return -1
    if (!a.time && b.time) return 1
    return a.createdAt - b.createdAt
  })
}

/**
 * Median hold time in minutes, over the closed trades that carry a clock on
 * both ends. Median rather than mean because one forgotten overnight position
 * would otherwise triple a scalper's reported average.
 */
export function medianHoldMinutes(trades: Trade[]): number | null {
  const held = closedOnly(trades)
    .map((t) => durationMinutes(t))
    .filter((m): m is number => m !== null)
  if (held.length === 0) return null
  const sorted = held.sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

/** Largest peak-to-trough drop on the cumulative curve, as a positive number. */
export function maxDrawdown(trades: Trade[]): number {
  let peak = 0
  let running = 0
  let worst = 0
  for (const t of sortChronological(closedOnly(trades))) {
    running += t.pnl
    if (running > peak) peak = running
    const dd = peak - running
    if (dd > worst) worst = dd
  }
  return round2(worst)
}

// ---------------------------------------------------------------------------
// Breakdowns (Pro)

export interface Breakdown {
  key: string
  stats: Stats
}

function breakdownBy(trades: Trade[], keyOf: (t: Trade) => string | null): Breakdown[] {
  const map = new Map<string, Trade[]>()
  for (const t of trades) {
    const k = keyOf(t)
    if (k === null) continue
    const arr = map.get(k)
    if (arr) arr.push(t)
    else map.set(k, [t])
  }
  return [...map.entries()]
    .map(([key, list]) => ({ key, stats: computeStats(list) }))
    .sort((a, b) => b.stats.pnl - a.stats.pnl)
}

export function byPair(trades: Trade[]): Breakdown[] {
  return breakdownBy(trades, (t) => t.pair.toUpperCase())
}

export function byTag(trades: Trade[]): Breakdown[] {
  const map = new Map<string, Trade[]>()
  for (const t of trades) {
    for (const tag of t.tags ?? []) {
      const arr = map.get(tag)
      if (arr) arr.push(t)
      else map.set(tag, [t])
    }
  }
  return [...map.entries()]
    .map(([key, list]) => ({ key, stats: computeStats(list) }))
    .sort((a, b) => b.stats.trades - a.stats.trades)
}

export function bySession(trades: Trade[]): Breakdown[] {
  return breakdownBy(trades, (t) => sessionOf(t.time))
}

export function byWeekday(trades: Trade[]): Breakdown[] {
  return breakdownBy(trades, (t) => String(new Date(`${t.date}T00:00:00Z`).getUTCDay()))
}

/**
 * Session × weekday grid for the heatmap (§10). Returns a dense matrix so the
 * grid never has holes — an untraded cell is a real, styleable zero-state.
 */
export interface HeatCell {
  session: TradingSession
  weekday: number
  stats: Stats
}

export const HEAT_SESSIONS: TradingSession[] = ['asia', 'london', 'newyork']

export function sessionHeatmap(trades: Trade[]): HeatCell[] {
  const buckets = new Map<string, Trade[]>()
  for (const t of trades) {
    const s = sessionOf(t.time)
    if (!s || s === 'off') continue
    const wd = new Date(`${t.date}T00:00:00Z`).getUTCDay()
    const k = `${s}|${wd}`
    const arr = buckets.get(k)
    if (arr) arr.push(t)
    else buckets.set(k, [t])
  }
  const cells: HeatCell[] = []
  for (const session of HEAT_SESSIONS) {
    // Mon–Fri only: weekend cells in an FX heatmap are noise.
    for (let wd = 1; wd <= 5; wd++) {
      cells.push({
        session,
        weekday: wd,
        stats: computeStats(buckets.get(`${session}|${wd}`) ?? []),
      })
    }
  }
  return cells
}
