import { describe, expect, it } from 'vitest'
import {
  computeRisk,
  conversionNeeded,
  formatPips,
  pipValueInQuoteCurrency,
  riskBudgetFrom,
  riskTone,
  stopDistance,
  suggestLotSize,
} from './risk'
import { findInstrument, groupInstruments, INSTRUMENTS, normalizeSymbol } from './instruments'

describe('curated instrument list', () => {
  it('covers all 28 crosses between the 8 majors', () => {
    expect(INSTRUMENTS.filter((i) => i.class === 'forex')).toHaveLength(28)
  })

  it('uses conventional base/quote ordering', () => {
    // EURUSD exists, USDEUR does not — the market quotes it one way round.
    expect(findInstrument('EURUSD')).not.toBeNull()
    expect(findInstrument('USDEUR')).toBeNull()
    expect(findInstrument('USDJPY')).not.toBeNull()
    expect(findInstrument('JPYUSD')).toBeNull()
  })

  it('gives JPY pairs a 0.01 pip', () => {
    expect(findInstrument('USDJPY')!.pipSize).toBe(0.01)
    expect(findInstrument('EURUSD')!.pipSize).toBe(0.0001)
  })

  it('matches however the trader typed it', () => {
    expect(normalizeSymbol('eur/usd')).toBe('EURUSD')
    expect(findInstrument('eur-usd')?.symbol).toBe('EURUSD')
    expect(findInstrument(' xauusd ')?.symbol).toBe('XAUUSD')
  })

  it('flags the classes where broker specs genuinely vary', () => {
    expect(findInstrument('XAUUSD')!.contractSizeVaries).toBe(true)
    expect(findInstrument('BTCUSD')!.contractSizeVaries).toBe(true)
    // Forex contract sizes are standard, so no disclaimer.
    expect(findInstrument('EURUSD')!.contractSizeVaries).toBeUndefined()
  })

  it('returns null for anything uncurated, rather than guessing', () => {
    expect(findInstrument('US30')).toBeNull()
    expect(findInstrument('TSLA')).toBeNull()
  })
})

describe('combobox grouping', () => {
  it('groups into forex, metals and crypto', () => {
    expect(groupInstruments().map((g) => g.class)).toEqual(['forex', 'metal', 'crypto'])
  })

  it('filters across every group at once', () => {
    const groups = groupInstruments('USD')
    expect(groups.flatMap((g) => g.items).length).toBeGreaterThan(5)
  })

  it('finds a pair typed in either order', () => {
    const a = groupInstruments('eur usd').flatMap((g) => g.items)
    expect(a.map((i) => i.symbol)).toContain('EURUSD')
  })

  it('matches on the human name too', () => {
    expect(groupInstruments('gold').flatMap((g) => g.items)[0]?.symbol).toBe('XAUUSD')
  })

  it('drops empty groups instead of rendering an empty heading', () => {
    expect(groupInstruments('bitcoin').map((g) => g.class)).toEqual(['crypto'])
  })
})

describe('pip value per lot, in the quote currency', () => {
  it('is $10 for a standard forex lot', () => {
    expect(pipValueInQuoteCurrency(findInstrument('EURUSD')!)).toBeCloseTo(10, 6)
  })

  it('is ¥1000 for a standard JPY lot', () => {
    expect(pipValueInQuoteCurrency(findInstrument('USDJPY')!)).toBeCloseTo(1000, 6)
  })

  it('makes a $1 gold move worth $100 a lot', () => {
    const gold = findInstrument('XAUUSD')!
    // 0.01 pip × 100 oz = $1 per pip, so 100 pips ($1) = $100.
    expect(pipValueInQuoteCurrency(gold) * (1 / gold.pipSize)).toBeCloseTo(100, 6)
  })

  it('makes a $1 silver move worth $5000 a lot', () => {
    const silver = findInstrument('XAGUSD')!
    expect(pipValueInQuoteCurrency(silver) * (1 / silver.pipSize)).toBeCloseTo(5000, 6)
  })
})

describe('stop distance', () => {
  it('converts a price gap into pips', () => {
    const eu = findInstrument('EURUSD')!
    expect(stopDistance({ entryPrice: 1.085, stopPrice: 1.083 }, eu)).toBeCloseTo(20, 6)
  })

  it('is the same whichever side the stop is on', () => {
    const eu = findInstrument('EURUSD')!
    const a = stopDistance({ entryPrice: 1.085, stopPrice: 1.083 }, eu)
    const b = stopDistance({ entryPrice: 1.083, stopPrice: 1.085 }, eu)
    expect(a).toBe(b)
  })

  it('does not leak float noise from subtracting prices', () => {
    const eu = findInstrument('EURUSD')!
    // 1.1 − 1.0999 is 0.00009999999999998899 in binary floating point.
    expect(stopDistance({ entryPrice: 1.1, stopPrice: 1.0999 }, eu)).toBeCloseTo(1, 6)
  })

  it('returns null when entry and stop are the same', () => {
    expect(
      stopDistance({ entryPrice: 1.085, stopPrice: 1.085 }, findInstrument('EURUSD')),
    ).toBeNull()
  })
})

describe('computeRisk — forex, same currency as the account', () => {
  const base = {
    pair: 'EURUSD',
    entryPrice: 1.085,
    stopPrice: 1.083,
    lotSize: 0.5,
    accountCurrency: 'USD',
    accountSize: 5_000,
  }

  it('computes the money at risk', () => {
    // 20 pips × $10/lot × 0.5 lots = $100
    const r = computeRisk(base)
    expect(r.riskAmount).toBe(100)
    expect(r.mode).toBe('curated')
  })

  it('expresses it as a share of the account', () => {
    expect(computeRisk(base).riskPct).toBe(2)
  })

  it('needs no FX rate for a USD account on a USD-quoted pair', () => {
    const r = computeRisk(base)
    expect(r.needsConversion).toBe(false)
    expect(r.missingRate).toBe(false)
  })

  it('scales linearly with lot size', () => {
    expect(computeRisk({ ...base, lotSize: 1 }).riskAmount).toBe(200)
    expect(computeRisk({ ...base, lotSize: 0.01 }).riskAmount).toBe(2)
  })
})

describe('computeRisk — conversion', () => {
  const base = {
    pair: 'EURGBP',
    entryPrice: 0.855,
    stopPrice: 0.853,
    lotSize: 1,
    accountCurrency: 'USD',
    accountSize: 10_000,
  }

  it('knows a conversion is required', () => {
    expect(conversionNeeded('EURGBP', 'USD')).toEqual({ from: 'GBP', to: 'USD' })
    expect(conversionNeeded('EURUSD', 'USD')).toBeNull()
    expect(conversionNeeded('EURGBP', 'GBP')).toBeNull()
  })

  it('applies the rate to the quote-currency pip value', () => {
    // 20 pips × £10 × 1.27 = $254
    const r = computeRisk({ ...base, fxRate: 1.27 })
    expect(r.riskAmount).toBeCloseTo(254, 2)
    expect(r.needsConversion).toBe(true)
    expect(r.missingRate).toBe(false)
  })

  it('reports a missing rate rather than silently using 1:1', () => {
    // Treating £10 as $10 would understate the risk by ~27%.
    const r = computeRisk(base)
    expect(r.riskAmount).toBeNull()
    expect(r.missingRate).toBe(true)
  })

  it('ignores a nonsensical rate', () => {
    expect(computeRisk({ ...base, fxRate: 0 }).missingRate).toBe(true)
    expect(computeRisk({ ...base, fxRate: -1 }).missingRate).toBe(true)
  })
})

describe('computeRisk — metals and crypto', () => {
  it('prices a gold trade off the 100oz convention', () => {
    // $5 stop × $100/lot per $1 × 0.2 lots = $100
    const r = computeRisk({
      pair: 'XAUUSD',
      entryPrice: 2400,
      stopPrice: 2395,
      lotSize: 0.2,
      accountCurrency: 'USD',
      accountSize: 10_000,
    })
    expect(r.riskAmount).toBe(100)
    expect(r.riskPct).toBe(1)
  })

  it('prices crypto per coin, with no pip lookup', () => {
    // $500 stop × 1 unit × 0.5 = $250
    const r = computeRisk({
      pair: 'BTCUSD',
      entryPrice: 64_000,
      stopPrice: 63_500,
      lotSize: 0.5,
      accountCurrency: 'USD',
      accountSize: 25_000,
    })
    expect(r.riskAmount).toBe(250)
  })
})

describe('computeRisk — manual mode', () => {
  const base = {
    pair: 'US30',
    entryPrice: 39_000,
    stopPrice: 38_900,
    lotSize: 1,
    accountCurrency: 'USD',
    accountSize: 10_000,
  }

  it('falls back to manual mode for an uncurated symbol', () => {
    expect(computeRisk(base).mode).toBe('manual')
  })

  it('computes nothing until the trader supplies a value per lot', () => {
    expect(computeRisk(base).riskAmount).toBeNull()
  })

  it('uses the supplied value directly, with no conversion', () => {
    // 100 points × $5 × 1 lot = $500
    const r = computeRisk({ ...base, manualPipValue: 5 })
    expect(r.riskAmount).toBe(500)
    expect(r.riskPct).toBe(5)
    expect(r.needsConversion).toBe(false)
  })

  it('rejects a nonsense manual value', () => {
    expect(computeRisk({ ...base, manualPipValue: 0 }).riskAmount).toBeNull()
  })
})

describe('computeRisk — incomplete input', () => {
  it('says nothing without a stop', () => {
    expect(
      computeRisk({ pair: 'EURUSD', entryPrice: 1.085, lotSize: 1, accountSize: 10_000 })
        .riskAmount,
    ).toBeNull()
  })

  it('says nothing without a lot size', () => {
    expect(
      computeRisk({ pair: 'EURUSD', entryPrice: 1.085, stopPrice: 1.083, accountSize: 10_000 })
        .riskAmount,
    ).toBeNull()
  })

  it('still gives a risk amount when the account size is unknown', () => {
    const r = computeRisk({
      pair: 'EURUSD',
      entryPrice: 1.085,
      stopPrice: 1.083,
      lotSize: 1,
    })
    expect(r.riskAmount).toBe(200)
    expect(r.riskPct).toBeNull()
  })
})

describe('suggestLotSize', () => {
  const base = {
    pair: 'EURUSD',
    entryPrice: 1.085,
    stopPrice: 1.083,
    accountCurrency: 'USD',
    accountSize: 10_000,
  }

  it('sizes a position to a risk budget', () => {
    // $100 budget ÷ (20 pips × $10) = 0.5 lots
    expect(suggestLotSize({ ...base, riskBudget: 100 })).toBe(0.5)
  })

  it('rounds down so the suggestion never exceeds the budget', () => {
    // $100 ÷ (30 pips × $10) = 0.333… → 0.33, which risks $99, not $100.
    const lots = suggestLotSize({ ...base, stopPrice: 1.082, riskBudget: 100 })!
    expect(lots).toBe(0.33)
    const actual = computeRisk({ ...base, stopPrice: 1.082, lotSize: lots }).riskAmount!
    expect(actual).toBeLessThanOrEqual(100)
  })

  it('returns null when the budget is too small for even a micro lot', () => {
    expect(suggestLotSize({ ...base, riskBudget: 0.5 })).toBeNull()
  })

  it('needs a stop to size against', () => {
    expect(suggestLotSize({ pair: 'EURUSD', entryPrice: 1.085, riskBudget: 100 })).toBeNull()
  })

  it('derives the budget from a max-risk rule', () => {
    expect(riskBudgetFrom(10_000, 1)).toBe(100)
    expect(riskBudgetFrom(10_000, 2.5)).toBe(250)
    expect(riskBudgetFrom(undefined, 1)).toBeNull()
    expect(riskBudgetFrom(10_000, 0)).toBeNull()
  })
})

describe('riskTone — observe, never gate', () => {
  it('has no opinion without a rule', () => {
    expect(riskTone(5, undefined)).toBe('neutral')
    expect(riskTone(null, 1)).toBe('neutral')
  })

  it('reads within-limit up to and including the limit', () => {
    expect(riskTone(0.8, 1)).toBe('within')
    expect(riskTone(1, 1)).toBe('within')
  })

  it('warms up above the limit', () => {
    expect(riskTone(1.01, 1)).toBe('over')
  })

  it('agrees with the violation engine at the float boundary', () => {
    // Both use the same 1e-9 tolerance, so a stored violation and the live
    // readout can never contradict each other on the same trade.
    expect(riskTone(0.1 + 0.2, 0.3)).toBe('within')
  })
})

describe('formatPips', () => {
  it('labels forex in pips and everything else in points', () => {
    expect(formatPips(20, findInstrument('EURUSD'))).toBe('20 pips')
    expect(formatPips(500, findInstrument('XAUUSD'))).toBe('500 pts')
  })

  it('rounds large figures and keeps one decimal on small ones', () => {
    expect(formatPips(1234.56, findInstrument('EURUSD'))).toBe('1,235 pips')
    expect(formatPips(19.94, findInstrument('EURUSD'))).toBe('19.9 pips')
  })

  it('shows a dash rather than zero when unknown', () => {
    expect(formatPips(null, null)).toBe('—')
  })
})

describe('precision — figures that rounding would destroy', () => {
  it('does not flatten a sub-cent pip value to zero', () => {
    // XRPUSD's pip value is 0.0001 per lot. Rounding it to 2dp would make it
    // 0, and every XRP risk figure would silently come out as $0.00.
    const r = computeRisk({
      pair: 'XRPUSD',
      entryPrice: 0.62,
      stopPrice: 0.6,
      lotSize: 10_000,
      accountCurrency: 'USD',
      accountSize: 10_000,
    })
    expect(r.pipValuePerLot).toBeCloseTo(0.0001, 10)
    // 0.02 price move × 10,000 units = $200
    expect(r.riskAmount).toBeCloseTo(200, 2)
  })

  it('keeps a derived rate exact rather than pre-rounded', () => {
    const r = computeRisk({
      pair: 'USDJPY',
      entryPrice: 157,
      stopPrice: 156.8,
      lotSize: 1,
      accountCurrency: 'USD',
      accountSize: 10_000,
    })
    // ¥1000 per pip ÷ 157 = $6.3694…, not $6.37
    expect(r.pipValuePerLot).toBeCloseTo(1000 / 157, 10)
  })

  it('snapshots exactly the value it used', () => {
    const r = computeRisk({
      pair: 'USDJPY',
      entryPrice: 157,
      stopPrice: 156.8,
      lotSize: 1,
      accountCurrency: 'USD',
    })
    expect(r.pipValueUsed).toBe(r.pipValuePerLot)
    // The snapshot reproduces the risk figure to the cent it was rounded to.
    // riskAmount is money and rounds to 2dp; the snapshot stays full precision
    // so a re-derivation years later lands on the same figure.
    const rebuilt = r.stopDistancePips! * r.pipValueUsed! * 1
    expect(Math.round(rebuilt * 100) / 100).toBe(r.riskAmount)
  })
})

describe('rate derived from the price itself', () => {
  it('needs no fetched rate when the account currency is the pair base', () => {
    // USDJPY on a USD account: the JPY→USD rate is exactly 1/price.
    const r = computeRisk({
      pair: 'USDJPY',
      entryPrice: 157,
      stopPrice: 156.8,
      lotSize: 1,
      accountCurrency: 'USD',
      accountSize: 10_000,
    })
    expect(r.rateSource).toBe('derived')
    expect(r.missingRate).toBe(false)
    // 20 pips × ¥1000 ÷ 157 = $127.39
    expect(r.riskAmount).toBeCloseTo(127.39, 2)
  })

  it('applies the same shortcut for a GBP account on GBPUSD', () => {
    const r = computeRisk({
      pair: 'GBPUSD',
      entryPrice: 1.27,
      stopPrice: 1.268,
      lotSize: 1,
      accountCurrency: 'GBP',
      accountSize: 10_000,
    })
    expect(r.rateSource).toBe('derived')
    // 20 pips × $10 ÷ 1.27 = £157.48
    expect(r.riskAmount).toBeCloseTo(157.48, 2)
  })

  it('prefers the derived rate over a supplied one, being exact', () => {
    const r = computeRisk({
      pair: 'USDJPY',
      entryPrice: 157,
      stopPrice: 156.8,
      lotSize: 1,
      accountCurrency: 'USD',
      fxRate: 0.5, // wildly wrong; must be ignored
    })
    expect(r.rateSource).toBe('derived')
    expect(r.riskAmount).toBeCloseTo(127.39, 2)
  })

  it('still needs a fetched rate for a true cross', () => {
    // EURGBP on a USD account: neither side is USD, nothing to derive.
    const r = computeRisk({
      pair: 'EURGBP',
      entryPrice: 0.855,
      stopPrice: 0.853,
      lotSize: 1,
      accountCurrency: 'USD',
    })
    expect(r.rateSource).toBe('none')
    expect(r.missingRate).toBe(true)
  })

  it('reports no conversion at all for the common USD-on-USD case', () => {
    const r = computeRisk({
      pair: 'EURUSD',
      entryPrice: 1.085,
      stopPrice: 1.083,
      lotSize: 1,
      accountCurrency: 'USD',
    })
    expect(r.rateSource).toBe('none')
    expect(r.needsConversion).toBe(false)
  })
})
