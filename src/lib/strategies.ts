/**
 * Strategies and the period plan.
 *
 * This replaces the free-text "entry model note", which asked the trader to
 * describe their setup in prose and then had almost nothing to do with it. A
 * paragraph cannot be counted, compared or attributed to a trade, so the note
 * was busywork wearing the costume of a feature.
 *
 * A named strategy can be. Tag the trade with which setup it was and the
 * journal can finally answer the question the trader actually has: *which of
 * my setups makes money, and which one am I losing on while believing
 * otherwise.*
 *
 * The plan layer adds intent. At the start of a period you say which
 * strategies you mean to trade. Deviating is never blocked — but it is
 * recorded, and reported afterwards whether it won or lost. Only reporting the
 * losing deviations would teach "trust your gut when it works", which is
 * exactly the lesson that ruins accounts.
 */

import { dayOfWeek, periodId, periodRange, today } from './dates'
import { computeStats, type Stats } from './aggregate'
import type { PeriodKind, PeriodPlan, Strategy, Trade } from './types'

/* ------------------------------------------------------------------ rules */

/**
 * Risk rules freeze once the first trade of a period is logged.
 *
 * The reason is narrow and important: without it, a trader who exceeds their
 * 1% limit can open Settings, change the limit to 2%, and make the violation
 * disappear. That isn't journalling, it's editing the evidence. Before the
 * first trade, rules are entirely yours to set.
 */
export function rulesLocked(
  plan: PeriodPlan | null | undefined,
  journalId?: string,
  now: string = today(),
): boolean {
  if (!plan) return false

  /*
    The weekend is for planning. Markets are shut, the trading week is done,
    and someone sitting down on Sunday to set up the week ahead should not be
    told their rules are frozen — the lock exists to stop you rewriting a rule
    you just broke *while still trading against it*, which is not what a
    Saturday edit is.
  */
  const dow = dayOfWeek(now)
  if (dow === 0 || dow === 6) return false

  // Per-account. An older plan only recorded that *something* traded, so it
  // falls back to the global flag rather than silently unlocking.
  if (plan.lockedAccounts && plan.lockedAccounts.length > 0) {
    return journalId ? plan.lockedAccounts.includes(journalId) : true
  }
  return Boolean(plan.lockedAt)
}

export function ruleLockReason(
  plan: PeriodPlan | null | undefined,
  journalId?: string,
  now: string = today(),
): string | null {
  if (!rulesLocked(plan, journalId, now)) return null
  return "You've already traded this week with these rules, so they're locked until Monday. That's on purpose — otherwise you could break a rule and then quietly rewrite it. Your strategies stay editable."
}

/** Strategies stay editable all period. A real setup needs somewhere to go. */
export function strategiesLocked(): boolean {
  return false
}

/* ------------------------------------------------------------- strategies */

export function activeStrategies(strategies: Strategy[]): Strategy[] {
  return strategies.filter((s) => !s.archivedAt)
}

export function strategyById(
  strategies: Strategy[],
  id: string | undefined,
): Strategy | undefined {
  if (!id) return undefined
  return strategies.find((s) => s.id === id)
}

export function strategyName(
  strategies: Strategy[],
  id: string | undefined,
): string | undefined {
  return strategyById(strategies, id)?.name
}

/** Names must be distinguishable at a glance in a picker; near-dupes aren't. */
export function isDuplicateName(
  strategies: Strategy[],
  name: string,
  exceptId?: string,
): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
  const target = norm(name)
  return activeStrategies(strategies).some(
    (s) => s.id !== exceptId && norm(s.name) === target,
  )
}

/* ------------------------------------------------------------------ plans */

export function planIdFor(day: string, kind: PeriodKind): string {
  return periodId(day, kind)
}

/** Was this trade using a strategy the trader planned for its period? */
export function isOffPlan(
  trade: Pick<Trade, 'strategyId'>,
  plan: PeriodPlan | null | undefined,
): boolean {
  // No plan, or a plan with no strategies named, means nothing was promised —
  // so nothing can be a deviation.
  if (!plan || plan.strategyIds.length === 0) return false
  if (!trade.strategyId) return false
  return !plan.strategyIds.includes(trade.strategyId)
}

/* ------------------------------------------------------- per-strategy view */

export interface StrategyPerformance {
  strategyId: string
  name: string
  stats: Stats
  /** Trades on this strategy that were outside the period's plan. */
  offPlanCount: number
  /** Whether this strategy was planned in the period being viewed. */
  planned: boolean
}

export function strategyPerformance(
  trades: Trade[],
  strategies: Strategy[],
  plan?: PeriodPlan | null,
): StrategyPerformance[] {
  const buckets = new Map<string, Trade[]>()
  for (const t of trades) {
    if (!t.strategyId) continue
    const arr = buckets.get(t.strategyId)
    if (arr) arr.push(t)
    else buckets.set(t.strategyId, [t])
  }

  return [...buckets.entries()]
    .map(([strategyId, list]) => ({
      strategyId,
      name: strategyName(strategies, strategyId) ?? 'Removed strategy',
      stats: computeStats(list),
      offPlanCount: list.filter((t) => t.offPlan).length,
      planned: plan ? plan.strategyIds.includes(strategyId) : false,
    }))
    .sort((a, b) => b.stats.pnl - a.stats.pnl)
}

/** Trades logged with no strategy at all — the honest "untagged" bucket. */
export function untaggedStats(trades: Trade[]): Stats {
  return computeStats(trades.filter((t) => !t.strategyId))
}

/* ------------------------------------------------------- plan vs reality */

export interface PlanOutcome {
  /** Trades that used a planned strategy. */
  onPlan: Stats
  /** Trades that didn't. */
  offPlan: Stats
  offPlanTrades: Trade[]
  /**
   * The honest headline. Deliberately reports a *profitable* deviation as
   * prominently as a costly one — see the module note.
   */
  verdict: string | null
}

export function planOutcome(
  trades: Trade[],
  plan: PeriodPlan | null | undefined,
  strategies: Strategy[],
): PlanOutcome {
  const off = trades.filter((t) => t.offPlan)
  const on = trades.filter((t) => !t.offPlan && t.strategyId)
  const offStats = computeStats(off)
  const onStats = computeStats(on)

  let verdict: string | null = null

  if (off.length > 0) {
    const names = [
      ...new Set(off.map((t) => strategyName(strategies, t.strategyId) ?? 'something else')),
    ]
    const list = names.slice(0, 3).join(', ')

    if (offStats.pnl > 0) {
      // Stated plainly and without praise. It made money *and* it wasn't the
      // plan; both halves are true and the trader gets to weigh them.
      verdict =
        `${off.length} of your ${trades.length} trades used ${list}, which wasn't in this period's plan. ` +
        `They made ${signed(offStats.pnl)}. Worth deciding whether that belongs in next period's plan, or whether it just happened to work.`
    } else if (offStats.pnl < 0) {
      verdict =
        `${off.length} of your ${trades.length} trades used ${list}, which wasn't in this period's plan. ` +
        `They cost ${signed(offStats.pnl)}.`
    } else {
      verdict = `${off.length} of your ${trades.length} trades used ${list}, outside this period's plan, and came out flat.`
    }

    // The comparison that actually matters, when both sides exist.
    if (onStats.trades > 0 && offStats.trades > 0) {
      const onExp = onStats.expectancyR
      const offExp = offStats.expectancyR
      if (onExp !== null && offExp !== null) {
        verdict += ` Planned setups ran at ${fmtR(onExp)} per trade, off-plan at ${fmtR(offExp)}.`
      }
    }
  } else if (plan && plan.strategyIds.length > 0 && trades.length > 0) {
    verdict = `Every trade this period used a strategy you planned.`
  }

  return { onPlan: onStats, offPlan: offStats, offPlanTrades: off, verdict }
}

/* ----------------------------------------------------------------- bias */

export interface BiasAlignment {
  /** Trades where direction agreed with the stated higher-timeframe bias. */
  withBias: Stats
  againstBias: Stats
  line: string | null
}

/**
 * Do you actually win when you trade with your own higher-timeframe read?
 *
 * A question no individual trade can answer and most traders assume they know.
 */
export function biasAlignment(trades: Trade[], timeframe: 'weekly' | 'daily'): BiasAlignment {
  const withB: Trade[] = []
  const against: Trade[] = []

  for (const t of trades) {
    const bias = t.bias?.[timeframe]
    if (!bias || bias === 'neutral') continue
    const agrees =
      (bias === 'bullish' && t.direction === 'buy') ||
      (bias === 'bearish' && t.direction === 'sell')
    if (agrees) withB.push(t)
    else against.push(t)
  }

  const w = computeStats(withB)
  const a = computeStats(against)

  let line: string | null = null
  // Both sides need enough trades before a comparison means anything.
  if (w.trades >= 3 && a.trades >= 3) {
    const label = timeframe === 'weekly' ? 'weekly' : 'daily'
    if (w.expectancyR !== null && a.expectancyR !== null) {
      line =
        a.expectancyR > w.expectancyR
          ? `Counter-trend trades beat your ${label} bias this period: ${fmtR(a.expectancyR)} against ${fmtR(w.expectancyR)} per trade.`
          : `Trading with your ${label} bias paid better: ${fmtR(w.expectancyR)} against ${fmtR(a.expectancyR)} per trade.`
    } else {
      line =
        a.pnl > w.pnl
          ? `Trades against your ${label} bias made more this period (${signed(a.pnl)} vs ${signed(w.pnl)}).`
          : `Trades with your ${label} bias made more this period (${signed(w.pnl)} vs ${signed(a.pnl)}).`
    }
  }

  return { withBias: w, againstBias: a, line }
}

/* ------------------------------------------------------------------ utils */

function signed(n: number): string {
  const s = n > 0 ? '+' : n < 0 ? '−' : ''
  return `${s}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}

function fmtR(r: number): string {
  const s = r > 0 ? '+' : r < 0 ? '−' : ''
  return `${s}${Math.abs(r).toFixed(2)}R`
}

export { periodRange }
