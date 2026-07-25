import { describe, expect, it } from 'vitest'
import {
  detectOvertrading,
  detectRevengeTrades,
  detectTiltDays,
  disciplineScore,
  journalingStreak,
  planVsActual,
  scoreTrend,
} from './patterns'
import { makeTrade } from '#/test/factories'
import type { PeriodPlan, Violation } from './types'

const RISK: Violation = { code: 'risk-exceeded', message: 'Risked 2% against your 1% limit.' }
const PAIR: Violation = { code: 'pair-not-allowed', message: 'GBPJPY is outside your list.' }

describe('discipline score', () => {
  it('has no opinion when there are no trades', () => {
    expect(disciplineScore([]).score).toBeNull()
  })

  it('scores a clean period 100', () => {
    expect(disciplineScore([makeTrade(), makeTrade(), makeTrade()]).score).toBe(100)
  })

  it('scores adherence, not profitability — a losing but clean week is still 100', () => {
    const losing = [makeTrade({ pnl: -100 }), makeTrade({ pnl: -250 })]
    expect(disciplineScore(losing).score).toBe(100)
  })

  it('drops in proportion to violating trades', () => {
    const trades = [
      makeTrade({ ruleViolations: [RISK] }),
      makeTrade(),
      makeTrade(),
      makeTrade(),
    ]
    expect(disciplineScore(trades).score).toBe(75)
  })

  it('penalises two broken rules on one trade more than one', () => {
    const one = disciplineScore([makeTrade({ ruleViolations: [RISK] }), makeTrade()])
    const two = disciplineScore([makeTrade({ ruleViolations: [RISK, PAIR] }), makeTrade()])
    expect(two.score!).toBeLessThan(one.score!)
  })

  it('never goes below zero', () => {
    const trades = Array.from({ length: 3 }, () =>
      makeTrade({ ruleViolations: [RISK, PAIR, RISK, PAIR] }),
    )
    expect(disciplineScore(trades).score).toBeGreaterThanOrEqual(0)
  })

  it('names the trades that pulled the score down', () => {
    const bad = makeTrade({ ruleViolations: [RISK] })
    const d = disciplineScore([bad, makeTrade()])
    expect(d.violatingTrades).toEqual([bad.id])
  })

  it('trends week by week, reporting null for untraded weeks', () => {
    const trend = scoreTrend(
      [makeTrade({ date: '2026-07-13', ruleViolations: [RISK] }), makeTrade({ date: '2026-07-14' })],
      ['2026-07-06', '2026-07-13'],
    )
    expect(trend[0].score).toBeNull()
    expect(trend[1].score).toBe(50)
  })
})

describe('revenge trading detection', () => {
  const usual = (over: Parameters<typeof makeTrade>[0] = {}) =>
    makeTrade({ lotSize: 0.1, time: '09:00', ...over })

  it('stays quiet without enough history to know what "usual" is', () => {
    expect(
      detectRevengeTrades([
        usual({ pnl: -100, time: '09:00' }),
        usual({ pnl: 50, lotSize: 1, time: '09:10' }),
      ]),
    ).toEqual([])
  })

  it('flags an oversized trade shortly after a loss', () => {
    const flags = detectRevengeTrades([
      usual({ time: '09:00' }),
      usual({ time: '09:20' }),
      usual({ time: '09:40' }),
      usual({ time: '10:00', pnl: -300 }),
      usual({ time: '10:10', lotSize: 0.5, pnl: -600 }),
    ])
    expect(flags).toHaveLength(1)
    expect(flags[0].kind).toBe('revenge')
    expect(flags[0].detail).toContain('10 min after a loss')
  })

  it('measures "oversized" against this trader, not an absolute number', () => {
    // Same shape as above but a large-size trader: 5 lots is their normal.
    const flags = detectRevengeTrades([
      usual({ lotSize: 5, time: '09:00' }),
      usual({ lotSize: 5, time: '09:20' }),
      usual({ lotSize: 5, time: '09:40' }),
      usual({ lotSize: 5, time: '10:00', pnl: -300 }),
      usual({ lotSize: 5, time: '10:10', pnl: -600 }),
    ])
    expect(flags).toEqual([])
  })

  it('does not flag an oversized trade after a win', () => {
    const flags = detectRevengeTrades([
      usual({ time: '09:00' }),
      usual({ time: '09:20' }),
      usual({ time: '09:40' }),
      usual({ time: '10:00', pnl: 300 }),
      usual({ time: '10:10', lotSize: 0.5 }),
    ])
    expect(flags).toEqual([])
  })

  it('does not flag a big trade taken hours later', () => {
    const flags = detectRevengeTrades([
      usual({ time: '09:00' }),
      usual({ time: '09:20' }),
      usual({ time: '09:40' }),
      usual({ time: '10:00', pnl: -300 }),
      usual({ time: '18:00', lotSize: 0.5 }),
    ])
    expect(flags).toEqual([])
  })

  it('still reads the sequence when the trader logged no clock times', () => {
    const flags = detectRevengeTrades([
      makeTrade({ lotSize: 0.1, createdAt: 1 }),
      makeTrade({ lotSize: 0.1, createdAt: 2 }),
      makeTrade({ lotSize: 0.1, createdAt: 3 }),
      makeTrade({ lotSize: 0.1, pnl: -300, createdAt: 4 }),
      makeTrade({ lotSize: 0.5, pnl: -600, createdAt: 5 }),
    ])
    expect(flags).toHaveLength(1)
    expect(flags[0].detail).toContain('same day')
  })

  it('ignores trades with no size at all', () => {
    const flags = detectRevengeTrades([
      usual(),
      usual(),
      usual(),
      usual({ pnl: -300 }),
      makeTrade({ pnl: -600 }), // minimal-level, no lot size
    ])
    expect(flags).toEqual([])
  })
})

describe('overtrading detection', () => {
  it('stays quiet without enough active days to average', () => {
    expect(
      detectOvertrading([makeTrade({ date: '2026-07-13' }), makeTrade({ date: '2026-07-14' })]),
    ).toEqual([])
  })

  it('flags a day well above the trader’s own average', () => {
    const trades = [
      makeTrade({ date: '2026-07-13' }),
      makeTrade({ date: '2026-07-14' }),
      makeTrade({ date: '2026-07-15' }),
      makeTrade({ date: '2026-07-16' }),
      ...Array.from({ length: 9 }, () => makeTrade({ date: '2026-07-17' })),
    ]
    const flags = detectOvertrading(trades)
    expect(flags).toHaveLength(1)
    expect(flags[0].date).toBe('2026-07-17')
    expect(flags[0].detail).toContain('9 trades')
  })

  it('does not flag an evenly-paced set of days', () => {
    const trades = ['2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16'].flatMap((date) => [
      makeTrade({ date }),
      makeTrade({ date }),
    ])
    expect(detectOvertrading(trades)).toEqual([])
  })
})

describe('tilt day detection', () => {
  it('flags a day that ended on three or more consecutive losses', () => {
    const flags = detectTiltDays([
      makeTrade({ date: '2026-07-14', pnl: 100, createdAt: 1 }),
      makeTrade({ date: '2026-07-14', pnl: -50, createdAt: 2 }),
      makeTrade({ date: '2026-07-14', pnl: -60, createdAt: 3 }),
      makeTrade({ date: '2026-07-14', pnl: -70, createdAt: 4 }),
    ])
    expect(flags).toHaveLength(1)
    expect(flags[0].tradeIds).toHaveLength(3)
  })

  it('does not flag a day that recovered', () => {
    const flags = detectTiltDays([
      makeTrade({ date: '2026-07-14', pnl: -50, createdAt: 1 }),
      makeTrade({ date: '2026-07-14', pnl: -60, createdAt: 2 }),
      makeTrade({ date: '2026-07-14', pnl: -70, createdAt: 3 }),
      makeTrade({ date: '2026-07-14', pnl: 500, createdAt: 4 }),
    ])
    expect(flags).toEqual([])
  })
})

describe('journaling streak', () => {
  it('is zero with nothing logged', () => {
    expect(journalingStreak([], '2026-07-14')).toEqual({
      current: 0,
      longest: 0,
      lastLoggedDate: null,
    })
  })

  it('counts consecutive logged days', () => {
    const trades = ['2026-07-12', '2026-07-13', '2026-07-14'].map((date) => makeTrade({ date }))
    expect(journalingStreak(trades, '2026-07-14').current).toBe(3)
  })

  it('survives to the next day so an evening journaller does not lose it', () => {
    const trades = ['2026-07-13', '2026-07-14'].map((date) => makeTrade({ date }))
    expect(journalingStreak(trades, '2026-07-15').current).toBe(2)
  })

  it('is not zeroed by a future-dated trade', () => {
    // A timezone edge or a typed date can land tomorrow. Losing the streak
    // over our own date arithmetic would be the worst kind of bug here.
    const trades = ['2026-07-14', '2026-07-15', '2026-07-16'].map((date) => makeTrade({ date }))
    expect(journalingStreak(trades, '2026-07-14').current).toBe(3)
  })

  it('breaks after a missed day', () => {
    const trades = ['2026-07-13', '2026-07-14'].map((date) => makeTrade({ date }))
    expect(journalingStreak(trades, '2026-07-16').current).toBe(0)
  })

  it('remembers the longest run even after it breaks', () => {
    const trades = [
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
      '2026-07-04',
      '2026-07-20',
    ].map((date) => makeTrade({ date }))
    const s = journalingStreak(trades, '2026-07-20')
    expect(s.longest).toBe(4)
    expect(s.current).toBe(1)
  })

  it('counts a day once no matter how many trades it holds', () => {
    const trades = [
      makeTrade({ date: '2026-07-13' }),
      makeTrade({ date: '2026-07-13' }),
      makeTrade({ date: '2026-07-14' }),
    ]
    expect(journalingStreak(trades, '2026-07-14').current).toBe(2)
  })
})

describe('plan vs actual', () => {
  const plan = (note: string, cap?: number): PeriodPlan => ({
    id: 'W-2026-29',
    kind: 'week',
    periodStart: '2026-07-13',
    periodEnd: '2026-07-19',
    entryModelNote: note,
    riskRuleSnapshot: cap === undefined ? {} : { maxRiskPerTradePct: cap },
    createdAt: 0,
  })

  it('says nothing about an empty period', () => {
    expect(planVsActual(plan('I trade EURUSD breakouts'), [])).toEqual([])
  })

  it('confirms pairs the trader wrote about and actually traded', () => {
    const diff = planVsActual(plan('I trade EURUSD breakouts at London open'), [
      makeTrade({ pair: 'EURUSD' }),
    ])
    expect(diff.some((d) => d.kind === 'match' && d.line.includes('EURUSD'))).toBe(true)
  })

  it('surfaces pairs the note never mentioned', () => {
    const diff = planVsActual(plan('I trade EURUSD breakouts'), [
      makeTrade({ pair: 'EURUSD' }),
      makeTrade({ pair: 'GBPJPY' }),
    ])
    const drift = diff.find((d) => d.kind === 'drift')
    expect(drift?.line).toContain('GBPJPY')
    expect(drift?.line).not.toContain('EURUSD')
  })

  it('handles a missing note without pretending there is one', () => {
    const diff = planVsActual(null, [makeTrade()])
    expect(diff[0].kind).toBe('neutral')
    expect(diff[0].line).toContain('No entry-model note')
  })

  it('checks risk against the snapshot the plan was written under', () => {
    const clean = planVsActual(plan('EURUSD', 1), [makeTrade({ riskPct: 0.8 })])
    expect(clean.some((d) => d.kind === 'match' && d.line.includes('1%'))).toBe(true)

    const drifted = planVsActual(plan('EURUSD', 1), [
      makeTrade({ riskPct: 2 }),
      makeTrade({ riskPct: 0.5 }),
    ])
    expect(drifted.some((d) => d.kind === 'drift' && d.line.includes('1 of 2'))).toBe(true)
  })
})
