import { describe, expect, it } from 'vitest'
import {
  consistencyFromVariation,
  convictionCheck,
  riskConsistency,
} from './risk-consistency'
import { makeTrade } from '#/test/factories'
import type { Trade } from './types'

/** n trades all risking the same percentage. */
function uniform(n: number, pct: number, pnl = 100): Trade[] {
  return Array.from({ length: n }, (_, i) =>
    makeTrade({ riskPct: pct, riskAmount: pct * 500, pnl, rMultiple: 1, createdAt: i }),
  )
}

describe('when there is nothing to measure', () => {
  it('says so rather than showing zeros', () => {
    const r = riskConsistency({ trades: [makeTrade({ pnl: 500 })], declaredPct: 1 })
    expect(r.tradesWithRisk).toBe(0)
    expect(r.consistencyScore).toBeNull()
    expect(r.verdict).toMatch(/none of these trades record what was risked/i)
  })

  it('still reports the P&L, which is real regardless', () => {
    const r = riskConsistency({ trades: [makeTrade({ pnl: 500 })] })
    expect(r.netPnl).toBe(500)
  })

  it('is empty for an empty journal', () => {
    expect(riskConsistency({ trades: [] }).tradesTotal).toBe(0)
  })

  it('ignores open trades, which have risked nothing yet', () => {
    const r = riskConsistency({
      trades: [makeTrade({ status: 'open', pnl: 0, riskPct: 1 })],
      declaredPct: 1,
    })
    expect(r.tradesWithRisk).toBe(0)
  })
})

describe('return on risk — the number P&L alone hides', () => {
  it('divides what was made by what was exposed', () => {
    // 10 trades risking $500 each = $5,000 deployed, +$1,000 made.
    const trades = uniform(10, 1, 100)
    const r = riskConsistency({ trades, declaredPct: 1 })
    expect(r.totalRisked).toBe(5_000)
    expect(r.netPnl).toBe(1_000)
    expect(r.returnOnRisk).toBe(0.2)
  })

  it('separates a big number made cheaply from one made expensively', () => {
    // Same +$1,000, wildly different risk behind it.
    const careful = riskConsistency({ trades: uniform(10, 0.5, 100) })
    const reckless = riskConsistency({ trades: uniform(10, 4, 100) })
    expect(careful.netPnl).toBe(reckless.netPnl)
    expect(careful.returnOnRisk!).toBeGreaterThan(reckless.returnOnRisk!)
  })

  it('goes negative on a losing period', () => {
    expect(riskConsistency({ trades: uniform(10, 1, -250) }).returnOnRisk).toBe(-0.5)
  })
})

describe('declared versus actual — the whole point', () => {
  it('confirms when the rule is genuinely being followed', () => {
    const r = riskConsistency({ trades: uniform(10, 1), declaredPct: 1 })
    expect(r.driftPct).toBe(0)
    expect(r.verdict).toMatch(/the rule is real/i)
    expect(r.overDeclared).toBe(0)
  })

  it('catches a habit that drifted above the rule', () => {
    const r = riskConsistency({ trades: uniform(10, 2.5), declaredPct: 1 })
    expect(r.driftPct).toBe(1.5)
    expect(r.overDeclared).toBe(10)
    expect(r.verdict).toMatch(/drifted apart/i)
  })

  it('treats habitual under-risking as a finding, not a virtue', () => {
    // Capping your own edge is worth knowing about too.
    const r = riskConsistency({ trades: uniform(10, 0.3), declaredPct: 1 })
    expect(r.underUsed).toBe(10)
    expect(r.verdict).toMatch(/less than you allow yourself/i)
  })

  it('counts only the trades that actually exceeded the rule', () => {
    const trades = [...uniform(8, 0.9), ...uniform(2, 3)]
    const r = riskConsistency({ trades, declaredPct: 1 })
    expect(r.overDeclared).toBe(2)
  })

  it('works with no rule set, reporting the habit alone', () => {
    const r = riskConsistency({ trades: uniform(10, 1.4) })
    expect(r.declaredPct).toBeNull()
    expect(r.driftPct).toBeNull()
    expect(r.verdict).toMatch(/typically risk 1.4%/i)
  })
})

describe('consistency of sizing', () => {
  it('scores identical sizing perfectly', () => {
    const r = riskConsistency({ trades: uniform(12, 1), declaredPct: 1 })
    expect(r.variation).toBe(0)
    expect(r.consistencyScore).toBe(100)
    expect(r.withinBandPct).toBe(100)
  })

  it('scores erratic sizing badly', () => {
    const trades = [0.2, 3, 0.4, 2.8, 0.3, 4, 0.5, 3.5, 0.2, 5].map((pct, i) =>
      makeTrade({ riskPct: pct, riskAmount: pct * 500, pnl: 50, createdAt: i }),
    )
    const r = riskConsistency({ trades, declaredPct: 1 })
    expect(r.consistencyScore!).toBeLessThan(45)
    expect(r.verdict).toMatch(/all over the place/i)
  })

  it('tolerates the modest spread a real stop placement produces', () => {
    // A stop goes where the chart says, so sizing is never perfectly uniform.
    const trades = [0.9, 1.1, 1.0, 0.95, 1.05, 1.0, 0.92, 1.08, 1.0, 1.02].map((pct, i) =>
      makeTrade({ riskPct: pct, riskAmount: pct * 500, pnl: 50, createdAt: i }),
    )
    const r = riskConsistency({ trades, declaredPct: 1 })
    expect(r.consistencyScore!).toBeGreaterThan(80)
  })

  it('uses the median so one wild trade does not define "typical"', () => {
    const trades = [...uniform(9, 1), makeTrade({ riskPct: 20, riskAmount: 10_000, pnl: 0 })]
    const r = riskConsistency({ trades, declaredPct: 1 })
    expect(r.medianRiskPct).toBe(1)
    expect(r.meanRiskPct!).toBeGreaterThan(2)
    expect(r.largestRiskPct).toBe(20)
  })

  it('calls out a single outsized bet', () => {
    const trades = [...uniform(9, 1), makeTrade({ riskPct: 6, riskAmount: 3_000, pnl: 0 })]
    expect(riskConsistency({ trades, declaredPct: 1 }).verdict).toMatch(/your biggest was 6%/i)
  })

  it('needs a few trades before scoring consistency at all', () => {
    const r = riskConsistency({ trades: uniform(2, 1), declaredPct: 1 })
    expect(r.variation).toBeNull()
    expect(r.verdict).toMatch(/not enough to judge/i)
  })
})

describe('deriving percentage from money', () => {
  it('rebuilds risk % from the amount and the balance', () => {
    const trades = Array.from({ length: 6 }, (_, i) =>
      makeTrade({ riskAmount: 500, riskPct: undefined, pnl: 100, createdAt: i }),
    )
    const r = riskConsistency({ trades, declaredPct: 1, riskBase: 50_000 })
    expect(r.medianRiskPct).toBe(1)
  })

  it('refuses to guess without a balance', () => {
    const trades = Array.from({ length: 6 }, (_, i) =>
      makeTrade({ riskAmount: 500, riskPct: undefined, pnl: 100, createdAt: i }),
    )
    const r = riskConsistency({ trades, declaredPct: 1 })
    expect(r.medianRiskPct).toBeNull()
    // The money is still known even when the percentage isn't.
    expect(r.totalRisked).toBe(3_000)
  })
})

describe('consistencyFromVariation', () => {
  it('maps uniform sizing to 100 and chaos to 0', () => {
    expect(consistencyFromVariation(0)).toBe(100)
    expect(consistencyFromVariation(0.5)).toBe(0)
    expect(consistencyFromVariation(2)).toBe(0)
  })

  it('is forgiving of modest spread', () => {
    expect(consistencyFromVariation(0.1)).toBe(80)
  })
})

describe('conviction check — do your big bets actually pay?', () => {
  it('stays quiet without enough of both kinds', () => {
    expect(convictionCheck(uniform(6, 1)).line).toBeNull()
  })

  it('reports when the sized-up trades do worse', () => {
    const normal = Array.from({ length: 10 }, (_, i) =>
      makeTrade({ riskPct: 1, riskAmount: 500, pnl: 150, rMultiple: 1.5, createdAt: i }),
    )
    const big = Array.from({ length: 6 }, (_, i) =>
      makeTrade({ riskPct: 3, riskAmount: 1_500, pnl: -1_500, rMultiple: -1, createdAt: 100 + i }),
    )
    const c = convictionCheck([...normal, ...big])
    expect(c.bigTrades).toBe(6)
    expect(c.line).toMatch(/do worse/i)
  })

  it('is willing to say the big trades held up', () => {
    const normal = Array.from({ length: 10 }, (_, i) =>
      makeTrade({ riskPct: 1, riskAmount: 500, pnl: 50, rMultiple: 0.1, createdAt: i }),
    )
    const big = Array.from({ length: 6 }, (_, i) =>
      makeTrade({ riskPct: 3, riskAmount: 1_500, pnl: 4_500, rMultiple: 3, createdAt: 100 + i }),
    )
    expect(convictionCheck([...normal, ...big]).line).toMatch(/hold up/i)
  })

  it('measures "big" against this trader, not an absolute number', () => {
    // Everyone risks 5% here, so nobody is sizing up.
    expect(convictionCheck(uniform(16, 5)).line).toBeNull()
  })
})
