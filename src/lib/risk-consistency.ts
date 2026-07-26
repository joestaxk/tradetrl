/**
 * How much was risked to make it — and whether the sizing held.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 * "+$4,200 this month" is a vanity number. It means one thing if it came from
 * forty trades risking $100 each, and something completely different if it
 * came from three trades risking $2,000. The first is a process; the second is
 * a coin that landed well.
 *
 * ── The gap this closes ───────────────────────────────────────────────────
 * Setting "max risk 1%" in Settings is a *declaration*. It proves nothing
 * about what actually happened. A trader can declare 1% and then risk 0.3% on
 * the setups they half-believe and 3% on the one they're sure about — never
 * technically breaking the rule often enough to notice, while their real
 * expectancy is decided entirely by the trades they sized up on.
 *
 * So this module measures what was *used*, not what was promised:
 *
 *   - total risk deployed, against what it returned
 *   - typical actual risk, against the declared rule
 *   - how tightly sizing clusters (consistency), and what the outliers cost
 *
 * Everything here needs `riskAmount` or `riskPct` on the trade. A trader
 * logging minimally has neither, and this module says so rather than
 * inventing a denominator.
 */

import { isNum, round2 } from './calc'
import { closedOnly, computeStats } from './aggregate'
import { mean, median, stdev } from './stats'
import type { Trade } from './types'

export interface RiskConsistency {
  /** Trades carrying enough information to be measured at all. */
  tradesWithRisk: number
  tradesTotal: number

  /** Every dollar put at risk across those trades. */
  totalRisked: number
  netPnl: number
  /**
   * Net P&L per unit of risk deployed — the honest "was it worth it".
   * 0.25 means a quarter of a dollar back for every dollar exposed.
   */
  returnOnRisk: number | null

  /** What they actually risk, typically. Median resists one wild trade. */
  medianRiskPct: number | null
  meanRiskPct: number | null
  largestRiskPct: number | null
  smallestRiskPct: number | null

  /** The rule they set for themselves, if any. */
  declaredPct: number | null
  /**
   * Typical actual minus declared. Negative means they habitually risk less
   * than they allow themselves, which is its own kind of inconsistency.
   */
  driftPct: number | null

  /** Coefficient of variation of risk %. 0 is identical sizing every time. */
  variation: number | null
  /** 0–100. How tightly sizing clusters around their own norm. */
  consistencyScore: number | null
  /** Share of trades within ±25% of their own typical size. */
  withinBandPct: number | null

  /** Trades risking more than the declared rule. */
  overDeclared: number
  /** Trades risking less than half of it — leaving the edge unused. */
  underUsed: number

  verdict: string | null
}

export const EMPTY_CONSISTENCY: RiskConsistency = {
  tradesWithRisk: 0,
  tradesTotal: 0,
  totalRisked: 0,
  netPnl: 0,
  returnOnRisk: null,
  medianRiskPct: null,
  meanRiskPct: null,
  largestRiskPct: null,
  smallestRiskPct: null,
  declaredPct: null,
  driftPct: null,
  variation: null,
  consistencyScore: null,
  withinBandPct: null,
  overDeclared: 0,
  underUsed: 0,
  verdict: null,
}

/** Within this much of their own norm counts as "the same size". */
const BAND = 0.25

/**
 * Sizing is never perfectly uniform and shouldn't need to be — a stop is where
 * the chart says, not where the arithmetic is tidy. This maps the coefficient
 * of variation onto a score that treats modest spread as fine and only
 * punishes genuine erraticism.
 */
export function consistencyFromVariation(cv: number): number {
  return Math.max(0, Math.min(100, Math.round(100 - cv * 200)))
}

export interface ConsistencyInput {
  trades: Trade[]
  /** The account's declared max risk, if set. */
  declaredPct?: number
  /** Balance to derive a percentage from, when the trade stored only money. */
  riskBase?: number | null
}

export function riskConsistency({
  trades,
  declaredPct,
  riskBase,
}: ConsistencyInput): RiskConsistency {
  const closed = closedOnly(trades)
  if (closed.length === 0) return EMPTY_CONSISTENCY

  // A trade counts if it says what it risked, either directly or via a
  // percentage we can rebuild from the account balance.
  const measured = closed
    .map((t) => {
      const amount = isNum(t.riskAmount) && t.riskAmount > 0 ? t.riskAmount : null
      const pct = isNum(t.riskPct) && t.riskPct > 0
        ? t.riskPct
        : amount !== null && isNum(riskBase) && riskBase > 0
          ? (amount / riskBase) * 100
          : null
      return { trade: t, amount, pct }
    })
    .filter((x) => x.amount !== null || x.pct !== null)

  const stats = computeStats(closed)

  if (measured.length === 0) {
    return {
      ...EMPTY_CONSISTENCY,
      tradesTotal: closed.length,
      netPnl: stats.pnl,
      declaredPct: declaredPct ?? null,
      verdict:
        'None of these trades record what was risked, so there is no way to say whether the sizing held. Adding a risk amount or a stop turns this into the most useful panel here.',
    }
  }

  const amounts = measured.map((m) => m.amount).filter((a): a is number => a !== null)
  const pcts = measured.map((m) => m.pct).filter((p): p is number => p !== null)

  const totalRisked = round2(amounts.reduce((a, b) => a + b, 0))
  const medianPct = pcts.length > 0 ? round2(median(pcts)) : null
  const meanPct = pcts.length > 0 ? round2(mean(pcts)) : null

  // Variation is measured on percentages, not money — a trader whose account
  // grew 40% did not become inconsistent by risking proportionally more.
  const cv =
    pcts.length >= 3 && mean(pcts) > 0 ? round2(stdev(pcts) / mean(pcts)) : null

  const withinBand =
    medianPct !== null && pcts.length > 0
      ? round2(
          (pcts.filter((p) => Math.abs(p - medianPct) <= medianPct * BAND).length /
            pcts.length) *
            100,
        )
      : null

  const declared = isNum(declaredPct) && declaredPct > 0 ? declaredPct : null
  const overDeclared =
    declared !== null ? pcts.filter((p) => p - declared > 1e-9).length : 0
  const underUsed =
    declared !== null ? pcts.filter((p) => p < declared * 0.5).length : 0

  const consistency = cv !== null ? consistencyFromVariation(cv) : null

  return {
    tradesWithRisk: measured.length,
    tradesTotal: closed.length,
    totalRisked,
    netPnl: stats.pnl,
    returnOnRisk: totalRisked > 0 ? round2(stats.pnl / totalRisked) : null,
    medianRiskPct: medianPct,
    meanRiskPct: meanPct,
    largestRiskPct: pcts.length > 0 ? round2(Math.max(...pcts)) : null,
    smallestRiskPct: pcts.length > 0 ? round2(Math.min(...pcts)) : null,
    declaredPct: declared,
    driftPct: declared !== null && medianPct !== null ? round2(medianPct - declared) : null,
    variation: cv,
    consistencyScore: consistency,
    withinBandPct: withinBand,
    overDeclared,
    underUsed,
    verdict: buildVerdict({
      measured: measured.length,
      total: closed.length,
      declared,
      medianPct,
      largest: pcts.length > 0 ? Math.max(...pcts) : null,
      consistency,
      withinBand,
      overDeclared,
      underUsed,
    }),
  }
}

function buildVerdict(x: {
  measured: number
  total: number
  declared: number | null
  medianPct: number | null
  largest: number | null
  consistency: number | null
  withinBand: number | null
  overDeclared: number
  underUsed: number
}): string | null {
  if (x.measured < 5) {
    return `Only ${x.measured} of ${x.total} trades record what was risked — not enough to judge the sizing yet.`
  }

  const parts: string[] = []

  if (x.declared !== null && x.medianPct !== null) {
    const drift = x.medianPct - x.declared
    if (Math.abs(drift) < x.declared * 0.15) {
      parts.push(`You set ${trim(x.declared)}% and typically risk ${trim(x.medianPct)}% — the rule is real.`)
    } else if (drift > 0) {
      parts.push(
        `You set ${trim(x.declared)}% but typically risk ${trim(x.medianPct)}%. The rule and the habit have drifted apart.`,
      )
    } else {
      // Under-risking is a finding, not a virtue: it caps the edge you
      // presumably did the work to find.
      parts.push(
        `You set ${trim(x.declared)}% but typically risk ${trim(x.medianPct)}% — consistently less than you allow yourself.`,
      )
    }
  } else if (x.medianPct !== null) {
    parts.push(`You typically risk ${trim(x.medianPct)}% a trade.`)
  }

  if (x.consistency !== null && x.withinBand !== null) {
    if (x.consistency >= 75) {
      parts.push(`Sizing is tight — ${Math.round(x.withinBand)}% of trades sit near that.`)
    } else if (x.consistency >= 45) {
      parts.push(
        `Sizing wanders: only ${Math.round(x.withinBand)}% of trades are close to your own norm.`,
      )
    } else {
      parts.push(
        `Sizing is all over the place — just ${Math.round(x.withinBand)}% of trades are near your typical size.`,
      )
    }
  }

  if (x.largest !== null && x.medianPct !== null && x.largest > x.medianPct * 3) {
    parts.push(
      `Your biggest was ${trim(x.largest)}%, about ${Math.round(x.largest / x.medianPct)}× your normal.`,
    )
  }

  if (x.overDeclared > 0) {
    parts.push(`${x.overDeclared} went over the limit you set.`)
  }

  return parts.length > 0 ? parts.join(' ') : null
}

/**
 * Do the trades they size up on actually pay?
 *
 * The question almost nobody asks about themselves, and the answer is
 * uncomfortable more often than not: conviction and edge turn out to be
 * unrelated, so the biggest bets carry the worst results.
 */
export interface ConvictionCheck {
  bigTrades: number
  normalTrades: number
  bigExpectancyR: number | null
  normalExpectancyR: number | null
  bigPnl: number
  normalPnl: number
  line: string | null
}

export function convictionCheck(trades: Trade[], riskBase?: number | null): ConvictionCheck {
  const closed = closedOnly(trades)
  const rows = closed
    .map((t) => {
      const pct = isNum(t.riskPct) && t.riskPct > 0
        ? t.riskPct
        : isNum(t.riskAmount) && t.riskAmount > 0 && isNum(riskBase) && riskBase > 0
          ? (t.riskAmount / riskBase) * 100
          : null
      return { t, pct }
    })
    .filter((x): x is { t: Trade; pct: number } => x.pct !== null)

  const empty: ConvictionCheck = {
    bigTrades: 0,
    normalTrades: 0,
    bigExpectancyR: null,
    normalExpectancyR: null,
    bigPnl: 0,
    normalPnl: 0,
    line: null,
  }
  if (rows.length < 10) return empty

  const typical = median(rows.map((r) => r.pct))
  if (typical <= 0) return empty

  // "Sized up" means meaningfully above their own norm, not an absolute figure.
  const big = rows.filter((r) => r.pct > typical * 1.4).map((r) => r.t)
  const normal = rows.filter((r) => r.pct <= typical * 1.4).map((r) => r.t)
  if (big.length < 4 || normal.length < 4) return empty

  const bigStats = computeStats(big)
  const normalStats = computeStats(normal)

  let line: string | null = null
  if (bigStats.expectancyR !== null && normalStats.expectancyR !== null) {
    line =
      bigStats.expectancyR < normalStats.expectancyR
        ? `The trades you size up on do worse: ${fmtR(bigStats.expectancyR)} a trade against ${fmtR(normalStats.expectancyR)} at your normal size.`
        : `The trades you size up on hold up: ${fmtR(bigStats.expectancyR)} a trade against ${fmtR(normalStats.expectancyR)} at your normal size.`
  } else {
    line =
      bigStats.pnl < 0 && normalStats.pnl > 0
        ? `Your bigger trades lost ${fmtMoney(bigStats.pnl)} while your normal-sized ones made ${fmtMoney(normalStats.pnl)}.`
        : null
  }

  return {
    bigTrades: big.length,
    normalTrades: normal.length,
    bigExpectancyR: bigStats.expectancyR,
    normalExpectancyR: normalStats.expectancyR,
    bigPnl: bigStats.pnl,
    normalPnl: normalStats.pnl,
    line,
  }
}

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : String(round2(n))
}

function fmtR(r: number): string {
  const s = r > 0 ? '+' : r < 0 ? '−' : ''
  return `${s}${Math.abs(r).toFixed(2)}R`
}

function fmtMoney(n: number): string {
  const s = n > 0 ? '+' : n < 0 ? '−' : ''
  return `${s}$${Math.abs(round2(n)).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}
