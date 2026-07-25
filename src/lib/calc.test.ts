import { describe, expect, it } from 'vitest'
import {
  classifyPair,
  computePnl,
  computeR,
  computeRiskAmount,
  derive,
  formatMoney,
  formatR,
  outcomeOf,
  pairPrecision,
  riskPctOf,
} from './calc'

describe('instrument classification', () => {
  it('recognises the classes that price differently', () => {
    expect(classifyPair('EURUSD')).toBe('fx')
    expect(classifyPair('usd/jpy')).toBe('fx-jpy')
    expect(classifyPair('XAUUSD')).toBe('metal')
    expect(classifyPair('US30')).toBe('index')
    expect(classifyPair('BTCUSD')).toBe('crypto')
  })

  it('quotes each class to the right precision', () => {
    expect(pairPrecision('EURUSD')).toBe(5)
    expect(pairPrecision('USDJPY')).toBe(3)
    expect(pairPrecision('XAUUSD')).toBe(2)
  })
})

describe('PnL computation', () => {
  it('computes a long FX win', () => {
    // 20 pips on 1.00 lot EURUSD = $200
    expect(
      computePnl({
        pair: 'EURUSD',
        direction: 'buy',
        entryPrice: 1.085,
        exitPrice: 1.087,
        lotSize: 1,
      }),
    ).toBe(200)
  })

  it('inverts the sign for shorts', () => {
    expect(
      computePnl({
        pair: 'EURUSD',
        direction: 'sell',
        entryPrice: 1.085,
        exitPrice: 1.087,
        lotSize: 1,
      }),
    ).toBe(-200)
  })

  it('uses the gold contract size, not the FX one', () => {
    // $10 move on 1.00 lot XAUUSD (100 oz) = $1000
    expect(
      computePnl({
        pair: 'XAUUSD',
        direction: 'buy',
        entryPrice: 2400,
        exitPrice: 2410,
        lotSize: 1,
      }),
    ).toBe(1000)
  })

  it('scales with lot size', () => {
    const base = computePnl({
      pair: 'EURUSD',
      direction: 'buy',
      entryPrice: 1.085,
      exitPrice: 1.087,
      lotSize: 0.1,
    })
    expect(base).toBe(20)
  })

  it('returns null rather than guessing when an input is missing', () => {
    expect(
      computePnl({ pair: 'EURUSD', direction: 'buy', entryPrice: 1.085, lotSize: 1 }),
    ).toBeNull()
    expect(
      computePnl({
        pair: 'EURUSD',
        direction: 'buy',
        entryPrice: 1.085,
        exitPrice: 1.087,
        lotSize: 0,
      }),
    ).toBeNull()
  })
})

describe('risk and R', () => {
  it('computes money at risk from the stop distance', () => {
    expect(
      computeRiskAmount({
        pair: 'EURUSD',
        direction: 'buy',
        entryPrice: 1.085,
        stopPrice: 1.084,
        lotSize: 1,
      }),
    ).toBe(100)
  })

  it('stays silent when the stop is on the wrong side of entry', () => {
    // A "stop" above entry on a long is a typo, not a 0-risk trade.
    expect(
      computeRiskAmount({
        pair: 'EURUSD',
        direction: 'buy',
        entryPrice: 1.085,
        stopPrice: 1.086,
        lotSize: 1,
      }),
    ).toBeNull()
  })

  it('computes R as PnL over risk', () => {
    expect(computeR(200, 100)).toBe(2)
    expect(computeR(-100, 100)).toBe(-1)
    expect(computeR(150, 100)).toBe(1.5)
  })

  it('never divides by zero risk', () => {
    expect(computeR(200, 0)).toBeNull()
    expect(computeR(200, undefined)).toBeNull()
    expect(computeR(undefined, 100)).toBeNull()
  })

  it('derives risk percentage from account size', () => {
    expect(riskPctOf(100, 10_000)).toBe(1)
    expect(riskPctOf(250, 10_000)).toBe(2.5)
    expect(riskPctOf(100, 0)).toBeNull()
    expect(riskPctOf(100, undefined)).toBeNull()
  })
})

describe('outcome derivation', () => {
  it('maps sign to outcome, treating exact zero as flat', () => {
    expect(outcomeOf(1)).toBe('win')
    expect(outcomeOf(-1)).toBe('loss')
    expect(outcomeOf(0)).toBe('flat')
  })
})

describe('derive — the one pass the entry form uses', () => {
  const base = {
    pair: 'EURUSD' as const,
    direction: 'buy' as const,
    entryPrice: 1.085,
    exitPrice: 1.087,
    stopPrice: 1.084,
    lotSize: 1,
    accountSize: 10_000,
  }

  it('fills in every derivable figure at once', () => {
    expect(derive(base)).toEqual({
      pnl: 200,
      riskAmount: 100,
      riskPct: 1,
      rMultiple: 2,
      outcome: 'win',
    })
  })

  it('lets a hand-typed PnL win over the computed one', () => {
    // The trader's broker statement is the source of truth, not our math.
    const d = derive({ ...base, pnl: 187.5 })
    expect(d.pnl).toBe(187.5)
    expect(d.rMultiple).toBe(1.88)
  })

  it('lets a hand-typed risk amount win over the stop-derived one', () => {
    expect(derive({ ...base, riskAmount: 50 }).riskAmount).toBe(50)
  })

  it('degrades gracefully for a minimal-level trade', () => {
    const d = derive({ pair: 'EURUSD', direction: 'buy', pnl: 120 })
    expect(d).toEqual({
      pnl: 120,
      riskAmount: null,
      riskPct: null,
      rMultiple: null,
      outcome: 'win',
    })
  })

  it('reports nothing at all when nothing is known', () => {
    const d = derive({ pair: 'EURUSD', direction: 'buy' })
    expect(d.pnl).toBeNull()
    expect(d.outcome).toBeNull()
  })
})

describe('formatting', () => {
  it('signs money with a true minus sign and tabular-friendly digits', () => {
    expect(formatMoney(1240.5)).toBe('+$1,240.50')
    expect(formatMoney(-320)).toBe('−$320.00')
    expect(formatMoney(0)).toBe('$0.00')
  })

  it('can drop the sign for absolute figures', () => {
    expect(formatMoney(-320, { signed: false })).toBe('$320.00')
  })

  it('formats R consistently with money', () => {
    expect(formatR(2)).toBe('+2.00R')
    expect(formatR(-1.5)).toBe('−1.50R')
    expect(formatR(0)).toBe('0.00R')
  })
})
