/**
 * Silent rule-violation computation (§5).
 *
 * Contract for this module, and it is not negotiable:
 *   - it is called at write time and its result is *stored*, never thrown;
 *   - it can never fail a save, so it never throws and never returns undefined
 *     in a way a caller could mistake for "invalid";
 *   - its messages are plain and non-shaming. No "you broke", no "!", no
 *     second-person scolding. They read like a ledger note, not a parent.
 */

import { isNum, riskPctOf } from './calc'
import { dayOfWeek } from './dates'
import { sessionFor } from './sessions'
import type { RiskRules, SessionWindow, Trade, Violation } from './types'

/** Normalise 'eur/usd', 'EURUSD ', 'eur-usd' → 'EURUSD' for comparison. */
export function normalizePair(pair: string): string {
  return pair.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export interface ViolationContext {
  rules: RiskRules
  accountSize?: number
  /** Other trades already logged the same day — for the daily cap check. */
  sameDayTradeCount?: number
  /**
   * Strategies the trader said they'd use this period. A trade using anything
   * else is noted, never blocked — see `off-plan-strategy` below.
   */
  plannedStrategyIds?: string[]
  strategyNameOf?: (id: string) => string | undefined
  /** The trader's own session definitions, for the session check. */
  sessionWindows?: SessionWindow[]
}

export function computeViolations(
  // `date` is optional: the weekend check simply doesn't fire without one,
  // and every other rule is date-independent.
  trade: Pick<Trade, 'pair' | 'riskPct' | 'riskAmount'> & {
    date?: string
    time?: string
    strategyId?: string
  },
  ctx: ViolationContext,
): Violation[] {
  const out: Violation[] = []
  const { rules, accountSize } = ctx

  // --- risk ceiling ---
  const pct = isNum(trade.riskPct)
    ? trade.riskPct
    : riskPctOf(trade.riskAmount, accountSize)

  if (isNum(rules.maxRiskPerTradePct) && isNum(pct)) {
    // Float tolerance: 1.0000000001% is not a broken rule.
    if (pct - rules.maxRiskPerTradePct > 1e-9) {
      out.push({
        code: 'risk-exceeded',
        message: `Risked ${trim(pct)}% against your ${trim(rules.maxRiskPerTradePct)}% limit.`,
      })
    }
  }

  // --- allowed pairs ---
  const allowed = rules.allowedPairs?.map(normalizePair).filter(Boolean)
  if (allowed && allowed.length > 0) {
    const p = normalizePair(trade.pair)
    if (p && !allowed.includes(p)) {
      out.push({
        code: 'pair-not-allowed',
        message: `${trade.pair.toUpperCase()} is outside the pairs you listed.`,
      })
    }
  }

  // --- weekend ---
  if (rules.noWeekendTrading && trade.date) {
    const dow = dayOfWeek(trade.date)
    if (dow === 0 || dow === 6) {
      out.push({
        code: 'weekend-trade',
        message: `Taken on a ${dow === 6 ? 'Saturday' : 'Sunday'}, which you keep clear.`,
      })
    }
  }

  /*
    --- sessions ---

    Checked against the trader's *own* windows, never a hardcoded
    Asia/London/New York. Their "London" might be ninety minutes; ours would
    be a guess, and a guess is a poor basis for telling someone they went
    off-plan.

    A trade with no clock time can't be placed in a session, so it is never
    counted as a breach — absence of data is not evidence of drift.
  */
  const allowedIds = rules.allowedSessionIds?.filter(Boolean)
  if (allowedIds && allowedIds.length > 0 && trade.time && ctx.sessionWindows?.length) {
    const session = sessionFor(trade.time, ctx.sessionWindows)
    if (session && !allowedIds.includes(session.id)) {
      const names = ctx.sessionWindows
        .filter((w) => allowedIds.includes(w.id))
        .map((w) => w.name)
      out.push({
        code: 'session-not-allowed',
        message: names.length
          ? `Taken in ${session.name}, and you trade ${listOf(names)}.`
          : `Taken in ${session.name}, outside the sessions you trade.`,
      })
    }
  }

  // --- trading window ---
  const win = rules.tradingWindow
  if (win?.start && win?.end && trade.time) {
    if (!withinWindow(trade.time, win.start, win.end)) {
      out.push({
        code: 'outside-trading-hours',
        message: `Taken at ${trade.time}, outside your ${win.start}–${win.end} window.`,
      })
    }
  }

  // --- strategy off plan ---
  // Never a block, and deliberately neutral in tone: deviating is sometimes
  // the right call, and the review reports winners and losers alike.
  if (
    ctx.plannedStrategyIds &&
    ctx.plannedStrategyIds.length > 0 &&
    trade.strategyId &&
    !ctx.plannedStrategyIds.includes(trade.strategyId)
  ) {
    const name = ctx.strategyNameOf?.(trade.strategyId)
    out.push({
      code: 'off-plan-strategy',
      message: name
        ? `${name} wasn't among the strategies you planned this period.`
        : `A strategy outside this period's plan.`,
    })
  }

  // --- self-imposed daily cap ---
  if (isNum(rules.maxTradesPerDay) && isNum(ctx.sameDayTradeCount)) {
    // The trade being saved is the (count + 1)th of the day.
    if (ctx.sameDayTradeCount + 1 > rules.maxTradesPerDay) {
      out.push({
        code: 'over-trade-cap',
        message: `Trade ${ctx.sameDayTradeCount + 1} of the day, past your cap of ${rules.maxTradesPerDay}.`,
      })
    }
  }

  return out
}

/** Did this trade break anything? Cheap check for list rendering. */
export function hasViolation(trade: Pick<Trade, 'ruleViolations'>): boolean {
  return (trade.ruleViolations?.length ?? 0) > 0
}

/** True when the user has actually configured something to be measured against. */
export function rulesAreSet(rules: RiskRules | undefined): boolean {
  if (!rules) return false
  return (
    isNum(rules.maxRiskPerTradePct) ||
    (rules.allowedPairs?.length ?? 0) > 0 ||
    isNum(rules.maxTradesPerDay) ||
    rules.noWeekendTrading === true ||
    (rules.allowedSessionIds?.length ?? 0) > 0 ||
    Boolean(rules.tradingWindow?.start && rules.tradingWindow?.end)
  )
}

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100)
}

/**
 * Is 'HH:mm' inside [start, end]? Handles a window that wraps past midnight,
 * which an Asia-session trader genuinely has (22:00–06:00).
 */
export function withinWindow(time: string, start: string, end: string): boolean {
  const mins = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null
  }
  const t = mins(time)
  const s = mins(start)
  const e = mins(end)
  if (t === null || s === null || e === null) return true
  return s <= e ? t >= s && t <= e : t >= s || t <= e
}

/** 'London and New York' / 'Asia, London and New York'. */
function listOf(names: string[]): string {
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
