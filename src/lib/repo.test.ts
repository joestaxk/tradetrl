import { describe, expect, it } from 'vitest'
import { clean } from './repo'

describe('clean — the Firestore boundary', () => {
  it('drops undefined, which Firestore rejects outright', () => {
    expect(clean({ a: 1, b: undefined, c: 'x' })).toEqual({ a: 1, c: 'x' })
  })

  it('keeps null, zero, empty string and false — all meaningful values', () => {
    expect(clean({ a: null, b: 0, c: '', d: false })).toEqual({
      a: null,
      b: 0,
      c: '',
      d: false,
    })
  })

  it('keeps arrays intact, including empty ones', () => {
    expect(clean({ tags: ['a', 'b'], violations: [] })).toEqual({
      tags: ['a', 'b'],
      violations: [],
    })
  })

  it('cleans nested objects such as riskRules', () => {
    expect(
      clean({ prefs: { level: 'minimal', accountSize: undefined } }),
    ).toEqual({ prefs: { level: 'minimal' } })
  })

  it('omits an object that cleaned down to nothing', () => {
    // An all-undefined riskRules must not write an empty map over real rules.
    expect(clean({ riskRules: { maxRiskPerTradePct: undefined } })).toEqual({})
  })

  it('leaves a minimal-level trade genuinely small', () => {
    const draft = {
      date: '2026-07-14',
      pair: 'EURUSD',
      direction: 'buy',
      pnl: 120,
      lotSize: undefined,
      riskAmount: undefined,
      entryPrice: undefined,
      reason: undefined,
    }
    expect(Object.keys(clean(draft)).sort()).toEqual(['date', 'direction', 'pair', 'pnl'])
  })
})
