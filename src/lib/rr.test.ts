import { describe, expect, it } from 'vitest'
import { computeFromR, DEFAULT_LOSS_R, formatRShort, rFromMoney } from './rr'

describe('computeFromR', () => {
  it('turns a win into signed R and money', () => {
    const r = computeFromR({ outcome: 'win', r: 2, riskAmount: 500 })
    expect(r.rMultiple).toBe(2)
    expect(r.pnl).toBe(1_000)
    expect(r.assumedR).toBe(false)
  })

  it('assumes exactly −1R for a loss with nothing typed', () => {
    // The whole trick: a losing trade needs no input beyond the tap.
    const r = computeFromR({ outcome: 'loss', riskAmount: 500 })
    expect(r.rMultiple).toBe(-DEFAULT_LOSS_R)
    expect(r.pnl).toBe(-500)
    expect(r.assumedR).toBe(true)
  })

  it('lets a worse loss be stated — stops do slip', () => {
    const r = computeFromR({ outcome: 'loss', r: 2.4, riskAmount: 500 })
    expect(r.rMultiple).toBe(-2.4)
    expect(r.pnl).toBe(-1_200)
    expect(r.assumedR).toBe(false)
  })

  it('never invents an R for a win — there is no sensible default', () => {
    // Assuming 1R would fabricate an edge out of nothing.
    const r = computeFromR({ outcome: 'win', riskAmount: 500 })
    expect(r.rMultiple).toBeNull()
    expect(r.pnl).toBeNull()
  })

  it('gives R without money when the risk amount is unknown', () => {
    const r = computeFromR({ outcome: 'win', r: 3 })
    expect(r.rMultiple).toBe(3)
    expect(r.pnl).toBeNull()
  })

  it('treats break-even as exactly zero on both scales', () => {
    const r = computeFromR({ outcome: 'flat', riskAmount: 500 })
    expect(r.rMultiple).toBe(0)
    expect(r.pnl).toBe(0)
  })

  it('ignores a nonsensical R rather than producing a negative win', () => {
    const r = computeFromR({ outcome: 'win', r: -2, riskAmount: 500 })
    expect(r.rMultiple).toBeNull()
  })

  it('ignores a zero or non-finite risk amount', () => {
    expect(computeFromR({ outcome: 'win', r: 2, riskAmount: 0 }).pnl).toBeNull()
    expect(computeFromR({ outcome: 'win', r: 2, riskAmount: NaN }).pnl).toBeNull()
  })

  it('scales money with the account, not with the pair', () => {
    // Same 2R on two different accounts is different money — which is exactly
    // why R is the thing worth storing.
    expect(computeFromR({ outcome: 'win', r: 2, riskAmount: 500 }).pnl).toBe(1_000)
    expect(computeFromR({ outcome: 'win', r: 2, riskAmount: 1_000 }).pnl).toBe(2_000)
  })
})

describe('rFromMoney', () => {
  it('recovers R from a money result', () => {
    expect(rFromMoney(1_000, 500)).toBe(2)
    expect(rFromMoney(-500, 500)).toBe(-1)
  })

  it('refuses to divide by an unknown risk', () => {
    expect(rFromMoney(1_000, 0)).toBeNull()
    expect(rFromMoney(1_000, undefined)).toBeNull()
  })
})

describe('formatRShort', () => {
  it('drops pointless decimals', () => {
    expect(formatRShort(2)).toBe('+2R')
    expect(formatRShort(-1)).toBe('−1R')
  })

  it('keeps decimals that carry information', () => {
    expect(formatRShort(1.5)).toBe('+1.5R')
    expect(formatRShort(-2.25)).toBe('−2.25R')
  })

  it('spells out break even rather than showing 0R', () => {
    expect(formatRShort(0)).toBe('break even')
  })

  it('shows a dash when there is no R', () => {
    expect(formatRShort(null)).toBe('—')
    expect(formatRShort(undefined)).toBe('—')
  })
})
