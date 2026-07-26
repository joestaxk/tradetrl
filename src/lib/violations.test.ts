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

describe('weekend rule', () => {
  // 2026-07-18 is a Saturday, 2026-07-19 a Sunday, 2026-07-17 a Friday.
  it('flags a Saturday when the trader keeps weekends clear', () => {
    const v = computeViolations(
      { pair: 'EURUSD', date: '2026-07-18' },
      { rules: { noWeekendTrading: true } },
    )
    expect(v.map((x) => x.code)).toEqual(['weekend-trade'])
    expect(v[0].message).toBe('Taken on a Saturday, which you keep clear.')
  })

  it('names Sunday correctly', () => {
    const v = computeViolations(
      { pair: 'EURUSD', date: '2026-07-19' },
      { rules: { noWeekendTrading: true } },
    )
    expect(v[0].message).toContain('Sunday')
  })

  it('leaves weekdays alone', () => {
    expect(
      computeViolations(
        { pair: 'EURUSD', date: '2026-07-17' },
        { rules: { noWeekendTrading: true } },
      ),
    ).toEqual([])
  })

  it('says nothing when the rule is off — crypto runs all weekend', () => {
    expect(
      computeViolations({ pair: 'BTCUSD', date: '2026-07-18' }, { rules: {} }),
    ).toEqual([])
    expect(
      computeViolations(
        { pair: 'BTCUSD', date: '2026-07-18' },
        { rules: { noWeekendTrading: false } },
      ),
    ).toEqual([])
  })

  it('counts as a configured rule on its own', () => {
    expect(rulesAreSet({ noWeekendTrading: true })).toBe(true)
    expect(rulesAreSet({ noWeekendTrading: false })).toBe(false)
  })
})

describe('sessions you trade', () => {
  // The trader's own windows, not hardcoded boundaries.
  const windows = [
    { id: 'asia', name: 'Asia', start: '00:00', end: '07:00' },
    { id: 'london', name: 'London', start: '07:00', end: '12:00' },
    { id: 'ny', name: 'New York', start: '12:00', end: '21:00' },
  ]

  it('flags an Asian trade when you said you trade New York', () => {
    const v = computeViolations(
      { pair: 'EURUSD', date: '2026-07-14', time: '02:30' },
      { rules: { allowedSessionIds: ['ny'] }, sessionWindows: windows },
    )
    expect(v.map((x) => x.code)).toEqual(['session-not-allowed'])
    expect(v[0].message).toBe('Taken in Asia, and you trade New York.')
  })

  it('names every session you declared', () => {
    const v = computeViolations(
      { pair: 'EURUSD', date: '2026-07-14', time: '02:30' },
      { rules: { allowedSessionIds: ['london', 'ny'] }, sessionWindows: windows },
    )
    expect(v[0].message).toBe('Taken in Asia, and you trade London and New York.')
  })

  it('says nothing when the trade is in a session you trade', () => {
    expect(
      computeViolations(
        { pair: 'EURUSD', date: '2026-07-14', time: '14:00' },
        { rules: { allowedSessionIds: ['ny'] }, sessionWindows: windows },
      ),
    ).toEqual([])
  })

  it('treats an empty list as no limit, not as nothing allowed', () => {
    expect(
      computeViolations(
        { pair: 'EURUSD', date: '2026-07-14', time: '02:30' },
        { rules: { allowedSessionIds: [] }, sessionWindows: windows },
      ),
    ).toEqual([])
  })

  it('never flags a trade with no clock time', () => {
    // Absence of data is not evidence of drift.
    expect(
      computeViolations(
        { pair: 'EURUSD', date: '2026-07-14' },
        { rules: { allowedSessionIds: ['ny'] }, sessionWindows: windows },
      ),
    ).toEqual([])
  })

  it('uses the trader’s own boundaries, not ours', () => {
    // This trader's "London" runs to 18:00. A 14:00 trade is inside it, even
    // though a hardcoded London would have ended hours earlier.
    const theirs = [{ id: 'london', name: 'London', start: '07:00', end: '18:00' }]
    expect(
      computeViolations(
        { pair: 'EURUSD', date: '2026-07-14', time: '14:00' },
        { rules: { allowedSessionIds: ['london'] }, sessionWindows: theirs },
      ),
    ).toEqual([])
  })

  it('handles a session that wraps past midnight', () => {
    const overnight = [{ id: 'asia', name: 'Asia', start: '22:00', end: '06:00' }]
    expect(
      computeViolations(
        { pair: 'USDJPY', date: '2026-07-14', time: '23:30' },
        { rules: { allowedSessionIds: ['asia'] }, sessionWindows: overnight },
      ),
    ).toEqual([])
  })

  it('says nothing without the windows to judge against', () => {
    expect(
      computeViolations(
        { pair: 'EURUSD', date: '2026-07-14', time: '02:30' },
        { rules: { allowedSessionIds: ['ny'] } },
      ),
    ).toEqual([])
  })

  it('counts as a configured rule on its own', () => {
    expect(rulesAreSet({ allowedSessionIds: ['ny'] })).toBe(true)
    expect(rulesAreSet({ allowedSessionIds: [] })).toBe(false)
  })

  it('stays non-shaming', () => {
    const v = computeViolations(
      { pair: 'EURUSD', date: '2026-07-14', time: '02:30' },
      { rules: { allowedSessionIds: ['ny'] }, sessionWindows: windows },
    )
    expect(v[0].message).not.toMatch(/!/)
    expect(v[0].message.toLowerCase()).not.toMatch(/never|must|should|bad|wrong/)
  })
})
