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
import type { RiskRules, Trade, Violation } from './types'

/** Normalise 'eur/usd', 'EURUSD ', 'eur-usd' → 'EURUSD' for comparison. */
export function normalizePair(pair: string): string {
  return pair.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export interface ViolationContext {
  rules: RiskRules
  accountSize?: number
  /** Other trades already logged the same day — for the daily cap check. */
  sameDayTradeCount?: number
}

export function computeViolations(
  trade: Pick<Trade, 'pair' | 'riskPct' | 'riskAmount'>,
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
    isNum(rules.maxTradesPerDay)
  )
}

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100)
}
