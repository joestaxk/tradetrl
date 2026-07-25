import { describe, expect, it } from 'vitest'
import { computeViolations, normalizePair, rulesAreSet } from './violations'

describe('pair normalisation', () => {
  it('compares pairs regardless of how they were typed', () => {
    expect(normalizePair('eur/usd')).toBe('EURUSD')
    expect(normalizePair(' EUR-USD ')).toBe('EURUSD')
    expect(normalizePair('US30')).toBe('US30')
  })
})

describe('risk ceiling', () => {
  it('flags a trade over the configured percentage', () => {
    const v = computeViolations(
      { pair: 'EURUSD', riskPct: 2.5 },
      { rules: { maxRiskPerTradePct: 1 } },
    )
    expect(v).toHaveLength(1)
    expect(v[0].code).toBe('risk-exceeded')
    expect(v[0].message).toBe('Risked 2.5% against your 1% limit.')
  })

  it('does not flag a trade exactly at the limit', () => {
    expect(
      computeViolations({ pair: 'EURUSD', riskPct: 1 }, { rules: { maxRiskPerTradePct: 1 } }),
    ).toEqual([])
  })

  it('tolerates floating point noise at the boundary', () => {
    expect(
      computeViolations(
        { pair: 'EURUSD', riskPct: 0.1 + 0.2 },
        { rules: { maxRiskPerTradePct: 0.3 } },
      ),
    ).toEqual([])
  })

  it('derives the percentage from risk amount when it was not given', () => {
    const v = computeViolations(
      { pair: 'EURUSD', riskAmount: 300 },
      { rules: { maxRiskPerTradePct: 1 }, accountSize: 10_000 },
    )
    expect(v.map((x) => x.code)).toEqual(['risk-exceeded'])
  })

  it('says nothing when risk is simply unknown', () => {
    // A minimal-level trader logs no risk at all. That is not a violation.
    expect(
      computeViolations({ pair: 'EURUSD' }, { rules: { maxRiskPerTradePct: 1 } }),
    ).toEqual([])
  })

  it('says nothing when no rule is set', () => {
    expect(computeViolations({ pair: 'EURUSD', riskPct: 9 }, { rules: {} })).toEqual([])
  })
})

describe('allowed pairs', () => {
  it('flags a pair outside the list', () => {
    const v = computeViolations(
      { pair: 'GBPJPY' },
      { rules: { allowedPairs: ['EURUSD', 'XAUUSD'] } },
    )
    expect(v.map((x) => x.code)).toEqual(['pair-not-allowed'])
    expect(v[0].message).toBe('GBPJPY is outside the pairs you listed.')
  })

  it('matches regardless of formatting on either side', () => {
    expect(
      computeViolations({ pair: 'eur/usd' }, { rules: { allowedPairs: ['EURUSD'] } }),
    ).toEqual([])
    expect(
      computeViolations({ pair: 'EURUSD' }, { rules: { allowedPairs: ['eur-usd'] } }),
    ).toEqual([])
  })

  it('treats an empty list as "no rule", not "nothing allowed"', () => {
    expect(computeViolations({ pair: 'GBPJPY' }, { rules: { allowedPairs: [] } })).toEqual([])
  })
})

describe('daily trade cap', () => {
  it('flags the trade that goes past the cap', () => {
    const v = computeViolations(
      { pair: 'EURUSD' },
      { rules: { maxTradesPerDay: 3 }, sameDayTradeCount: 3 },
    )
    expect(v.map((x) => x.code)).toEqual(['over-trade-cap'])
    expect(v[0].message).toBe('Trade 4 of the day, past your cap of 3.')
  })

  it('allows the trade that exactly reaches the cap', () => {
    expect(
      computeViolations(
        { pair: 'EURUSD' },
        { rules: { maxTradesPerDay: 3 }, sameDayTradeCount: 2 },
      ),
    ).toEqual([])
  })
})

describe('composition and tone', () => {
  it('reports every broken rule on one trade', () => {
    const v = computeViolations(
      { pair: 'GBPJPY', riskPct: 4 },
      {
        rules: { maxRiskPerTradePct: 1, allowedPairs: ['EURUSD'], maxTradesPerDay: 2 },
        sameDayTradeCount: 5,
      },
    )
    expect(v.map((x) => x.code).sort()).toEqual([
      'over-trade-cap',
      'pair-not-allowed',
      'risk-exceeded',
    ])
  })

  it('never shouts', () => {
    const v = computeViolations(
      { pair: 'GBPJPY', riskPct: 4 },
      { rules: { maxRiskPerTradePct: 1, allowedPairs: ['EURUSD'] } },
    )
    for (const { message } of v) {
      expect(message).not.toMatch(/!/)
      expect(message.toLowerCase()).not.toMatch(/never|must|should|stop|bad|wrong/)
    }
  })

  it('is total — it returns a value for any input rather than throwing', () => {
    expect(() =>
      computeViolations({ pair: '' }, { rules: { allowedPairs: ['EURUSD'] } }),
    ).not.toThrow()
    expect(computeViolations({ pair: '' }, { rules: { allowedPairs: ['EURUSD'] } })).toEqual(
      [],
    )
  })
})

describe('rulesAreSet', () => {
  it('distinguishes a configured trader from a fresh one', () => {
    expect(rulesAreSet(undefined)).toBe(false)
    expect(rulesAreSet({})).toBe(false)
    expect(rulesAreSet({ allowedPairs: [] })).toBe(false)
    expect(rulesAreSet({ maxRiskPerTradePct: 1 })).toBe(true)
    expect(rulesAreSet({ allowedPairs: ['EURUSD'] })).toBe(true)
  })
})
