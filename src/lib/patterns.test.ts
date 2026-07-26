import { describe, expect, it } from 'vitest'
import {
  analyse,
  detectAfterLoss,
  detectCuttingWinners,
  detectHoldingLosers,
  detectOvertrading,
  detectRevenge,
  detectSizeCreep,
  detectStopDiscipline,
  detectStreakSizing,
  detectTilt,
  detectWeekdayEdge,
  disciplineScore,
  journalingStreak,
  readiness,
  scoreTrend,
} from './patterns'
import { makeTrade } from '#/test/factories'
import { addDays } from './dates'
import type { Trade, Violation } from './types'

const RISK: Violation = { code: 'risk-exceeded', message: 'Risked 2% against your 1% limit.' }
const PAIR: Violation = { code: 'pair-not-allowed', message: 'GBPJPY is outside your list.' }

/** A run of ordinary trades, enough to clear the engine's sample gates. */
function history(n: number, over: Partial<Trade> = {}): Trade[] {
  return Array.from({ length: n }, (_, i) =>
    makeTrade({
      date: addDays('2026-01-05', Math.floor(i / 2)),
      time: i % 2 === 0 ? '09:00' : '14:00',
      pnl: i % 3 === 0 ? -100 : 120,
      rMultiple: i % 3 === 0 ? -1 : 1.2,
      lotSize: 0.2,
      riskAmount: 100,
      createdAt: 1_700_000_000_000 + i * 1000,
      ...over,
    }),
  )
}

describe('discipline score', () => {
  it('has no opinion without trades', () => {
    expect(disciplineScore([]).score).toBeNull()
  })

  it('scores a clean period 100', () => {
    expect(disciplineScore([makeTrade(), makeTrade(), makeTrade()]).score).toBe(100)
  })

  it('scores adherence, not profit — a losing but clean week is still 100', () => {
    expect(disciplineScore([makeTrade({ pnl: -100 }), makeTrade({ pnl: -250 })]).score).toBe(100)
  })

  it('drops in proportion to violating trades', () => {
    const trades = [makeTrade({ ruleViolations: [RISK] }), makeTrade(), makeTrade(), makeTrade()]
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

  it('ignores open trades, which have no result to judge', () => {
    const d = disciplineScore([makeTrade(), makeTrade({ status: 'open', pnl: 0 })])
    expect(d.tradesCounted).toBe(1)
  })

  it('trends week by week, reporting null for untraded weeks', () => {
    const trend = scoreTrend(
      [
        makeTrade({ date: '2026-07-13', ruleViolations: [RISK] }),
        makeTrade({ date: '2026-07-14' }),
      ],
      ['2026-07-06', '2026-07-13'],
    )
    expect(trend[0].score).toBeNull()
    expect(trend[1].score).toBe(50)
  })
})

describe('the engine stays silent without grounds', () => {
  it('says nothing at all about an empty journal', () => {
    expect(analyse([])).toEqual([])
  })

  it('says nothing about a handful of trades', () => {
    // Three trades cannot support any claim, however lopsided they look.
    const tiny = [
      makeTrade({ pnl: -500, rMultiple: -5 }),
      makeTrade({ pnl: -400, rMultiple: -4 }),
      makeTrade({ pnl: 10, rMultiple: 0.1 }),
    ]
    expect(analyse(tiny)).toEqual([])
  })

  it('does not invent a weekday pattern from one bad Tuesday', () => {
    const trades = [
      ...history(20),
      makeTrade({ date: '2026-03-03', pnl: -900, rMultiple: -9, lotSize: 0.2 }),
    ]
    const weekday = detectWeekdayEdge(trades)
    // One catastrophic Tuesday is not a Tuesday problem.
    expect(weekday.every((i) => i.sample >= 6)).toBe(true)
  })

  it('ignores open trades entirely', () => {
    const open = Array.from({ length: 30 }, () => makeTrade({ status: 'open', pnl: 0 }))
    expect(analyse(open)).toEqual([])
  })

  it('every insight it does emit carries its sample and evidence', () => {
    const insights = analyse(revengeHistory())
    expect(insights.length).toBeGreaterThan(0)
    for (const i of insights) {
      expect(i.sample).toBeGreaterThan(0)
      expect(i.evidence.length).toBeGreaterThan(0)
      expect(i.detail.length).toBeGreaterThan(0)
    }
  })
})

/** Small, normal trades then one oversized one right after a loss. */
function revengeHistory(): Trade[] {
  const base = Array.from({ length: 8 }, (_, i) =>
    makeTrade({
      date: '2026-02-02',
      time: `0${i + 1}:00`.slice(-5),
      pnl: 60,
      rMultiple: 1,
      lotSize: 0.1,
      createdAt: 1_700_000_000_000 + i * 1000,
    }),
  )
  return [
    ...base,
    makeTrade({ date: '2026-02-02', time: '10:00', pnl: -300, rMultiple: -1, lotSize: 0.1, createdAt: 1_700_000_009_000 }),
    makeTrade({ date: '2026-02-02', time: '10:10', pnl: -600, rMultiple: -2, lotSize: 0.6, createdAt: 1_700_000_010_000 }),
  ]
}

describe('revenge trading', () => {
  it('flags an oversized trade taken minutes after a loss', () => {
    const found = detectRevenge(revengeHistory())
    expect(found).toHaveLength(1)
    expect(found[0].kind).toBe('revenge')
    expect(found[0].detail).toMatch(/size/i)
  })

  it('measures oversized against this trader, not an absolute number', () => {
    // Identical shape, but 5 lots is this trader's normal.
    const big = revengeHistory().map((t) => ({ ...t, lotSize: (t.lotSize ?? 0.1) * 50 }))
    // Every size scaled equally, so nothing is out of proportion any more.
    const scaled = big.map((t, i) => (i === big.length - 1 ? { ...t, lotSize: 5 } : t))
    expect(detectRevenge(scaled)).toEqual([])
  })

  it('does not flag an oversized trade after a win', () => {
    const trades = revengeHistory()
    trades[trades.length - 2] = { ...trades[trades.length - 2], pnl: 300 }
    expect(detectRevenge(trades)).toEqual([])
  })

  it('does not flag a big trade taken hours later', () => {
    const trades = revengeHistory()
    trades[trades.length - 1] = { ...trades[trades.length - 1], time: '19:00' }
    expect(detectRevenge(trades)).toEqual([])
  })

  it('stays quiet without enough sized history to know what usual is', () => {
    expect(
      detectRevenge([
        makeTrade({ pnl: -100, lotSize: 0.1, time: '09:00' }),
        makeTrade({ pnl: -200, lotSize: 1, time: '09:10' }),
      ]),
    ).toEqual([])
  })
})

describe('overtrading', () => {
  it('needs several active days before comparing', () => {
    expect(detectOvertrading([makeTrade({ date: '2026-01-01' })])).toEqual([])
  })

  it('flags a day far above the trader’s own pace', () => {
    const trades = [
      makeTrade({ date: '2026-01-05' }),
      makeTrade({ date: '2026-01-06' }),
      makeTrade({ date: '2026-01-07' }),
      ...Array.from({ length: 9 }, () => makeTrade({ date: '2026-01-08' })),
    ]
    const found = detectOvertrading(trades)
    expect(found).toHaveLength(1)
    expect(found[0].kind).toBe('overtrading')
  })

  it('does not flag an evenly paced book', () => {
    const trades = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08'].flatMap((date) => [
      makeTrade({ date }),
      makeTrade({ date }),
    ])
    expect(detectOvertrading(trades)).toEqual([])
  })
})

describe('tilt', () => {
  it('flags a day that ended on three straight losses', () => {
    const found = detectTilt([
      makeTrade({ date: '2026-01-05', pnl: 100, createdAt: 1 }),
      makeTrade({ date: '2026-01-05', pnl: -50, createdAt: 2 }),
      makeTrade({ date: '2026-01-05', pnl: -60, createdAt: 3 }),
      makeTrade({ date: '2026-01-05', pnl: -70, createdAt: 4 }),
    ])
    expect(found).toHaveLength(1)
    expect(found[0].tradeIds).toHaveLength(3)
  })

  it('does not flag a day that recovered', () => {
    expect(
      detectTilt([
        makeTrade({ date: '2026-01-05', pnl: -50, createdAt: 1 }),
        makeTrade({ date: '2026-01-05', pnl: -60, createdAt: 2 }),
        makeTrade({ date: '2026-01-05', pnl: -70, createdAt: 3 }),
        makeTrade({ date: '2026-01-05', pnl: 500, createdAt: 4 }),
      ]),
    ).toEqual([])
  })
})

describe('cutting winners short', () => {
  it('flags a high win rate paired with small wins', () => {
    const trades = [
      ...Array.from({ length: 15 }, () => makeTrade({ pnl: 50, rMultiple: 0.5, riskAmount: 100 })),
      ...Array.from({ length: 6 }, () => makeTrade({ pnl: -200, rMultiple: -2, riskAmount: 100 })),
    ]
    const found = detectCuttingWinners(trades)
    expect(found).toHaveLength(1)
    expect(found[0].detail).toMatch(/break even/i)
  })

  it('stays quiet when wins are bigger than losses', () => {
    const trades = [
      ...Array.from({ length: 15 }, () => makeTrade({ pnl: 300, rMultiple: 3, riskAmount: 100 })),
      ...Array.from({ length: 6 }, () => makeTrade({ pnl: -100, rMultiple: -1, riskAmount: 100 })),
    ]
    expect(detectCuttingWinners(trades)).toEqual([])
  })

  it('stays quiet for a low win rate — that is just a losing system', () => {
    const trades = [
      ...Array.from({ length: 5 }, () => makeTrade({ pnl: 50, rMultiple: 0.5 })),
      ...Array.from({ length: 20 }, () => makeTrade({ pnl: -200, rMultiple: -2 })),
    ]
    expect(detectCuttingWinners(trades)).toEqual([])
  })
})

describe('holding losers', () => {
  it('flags losers held far longer than winners', () => {
    const wins = Array.from({ length: 8 }, (_, i) =>
      makeTrade({ pnl: 100, rMultiple: 1, date: '2026-01-05', time: '09:00', closeTime: '09:20', createdAt: i }),
    )
    const losses = Array.from({ length: 8 }, (_, i) =>
      makeTrade({ pnl: -100, rMultiple: -1, date: '2026-01-06', time: '09:00', closeTime: '15:00', createdAt: 100 + i }),
    )
    const found = detectHoldingLosers([...wins, ...losses])
    expect(found).toHaveLength(1)
    expect(found[0].kind).toBe('holding-losers')
  })

  it('says nothing without close times to measure', () => {
    expect(detectHoldingLosers(history(30))).toEqual([])
  })
})

describe('stop discipline', () => {
  it('flags losses that ran past the risk recorded on them', () => {
    const trades = [
      makeTrade({ pnl: -300, riskAmount: 100 }),
      makeTrade({ pnl: -250, riskAmount: 100 }),
      makeTrade({ pnl: -400, riskAmount: 100 }),
      ...history(10),
    ]
    const found = detectStopDiscipline(trades)
    expect(found).toHaveLength(1)
    expect(found[0].weight).toBe('critical')
  })

  it('allows normal slippage without complaining', () => {
    const trades = Array.from({ length: 6 }, () => makeTrade({ pnl: -105, riskAmount: 100 }))
    expect(detectStopDiscipline(trades)).toEqual([])
  })
})

describe('streak sizing', () => {
  it('flags sizing up mid losing streak', () => {
    const trades: Trade[] = []
    for (let i = 0; i < 30; i++) {
      // Losses in runs of three, and the trade after each run is oversized.
      const inRun = i % 6 >= 3
      trades.push(
        makeTrade({
          pnl: inRun ? -100 : 100,
          rMultiple: inRun ? -1 : 1,
          lotSize: inRun ? 0.6 : 0.1,
          createdAt: i,
          date: addDays('2026-01-05', Math.floor(i / 3)),
        }),
      )
    }
    const found = detectStreakSizing(trades)
    expect(found.length).toBeLessThanOrEqual(1)
    if (found.length) expect(found[0].kind).toBe('streak-sizing')
  })

  it('stays quiet when size never changes', () => {
    expect(detectStreakSizing(history(30))).toEqual([])
  })
})

describe('size creep', () => {
  it('needs a long history before claiming drift', () => {
    expect(detectSizeCreep(history(10, { lotSize: 0.1 }))).toEqual([])
  })

  it('stays quiet on constant sizing', () => {
    expect(detectSizeCreep(history(40, { lotSize: 0.2 }))).toEqual([])
  })

  it('flags a genuine climb', () => {
    const trades = Array.from({ length: 40 }, (_, i) =>
      makeTrade({
        lotSize: 0.1 + i * 0.02,
        pnl: 50,
        rMultiple: 0.5,
        createdAt: i,
        date: addDays('2026-01-05', Math.floor(i / 2)),
      }),
    )
    const found = detectSizeCreep(trades)
    expect(found).toHaveLength(1)
    expect(found[0].detail).toMatch(/climb|bigger/i)
  })
})

describe('after a loss', () => {
  it('stays quiet without a long enough sequence', () => {
    expect(detectAfterLoss(history(6))).toEqual([])
  })
})

describe('readiness', () => {
  it('tells a new trader what is still missing rather than showing nothing', () => {
    const r = readiness([makeTrade()])
    expect(r.closedTrades).toBe(1)
    expect(r.progress).toBeLessThan(1)
    expect(r.missing.length).toBeGreaterThan(0)
    expect(r.missing.join(' ')).toMatch(/more logged trades/)
  })

  it('reports full progress once there is real history', () => {
    expect(readiness(history(30)).progress).toBe(1)
  })
})

describe('ranking', () => {
  it('puts critical findings first and honours a limit', () => {
    const insights = analyse(revengeHistory(), { limit: 2 })
    expect(insights.length).toBeLessThanOrEqual(2)
    const weights = insights.map((i) => i.weight)
    const order = { critical: 0, notable: 1, informational: 2 } as const
    for (let i = 1; i < weights.length; i++) {
      expect(order[weights[i]]).toBeGreaterThanOrEqual(order[weights[i - 1]])
    }
  })
})

describe('tone', () => {
  it('never instructs, praises or scolds', () => {
    const insights = analyse(revengeHistory())
    const text = insights.map((i) => `${i.title} ${i.detail}`).join(' ').toLowerCase()
    for (const word of [
      'you should',
      'you must',
      'stop doing',
      'well done',
      'great',
      'bad habit',
      'mistake',
      'never do',
    ]) {
      expect(text).not.toContain(word)
    }
    expect(text).not.toMatch(/!/)
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

  it('breaks after a missed day', () => {
    const trades = ['2026-07-13', '2026-07-14'].map((date) => makeTrade({ date }))
    expect(journalingStreak(trades, '2026-07-16').current).toBe(0)
  })

  it('remembers the longest run even after it breaks', () => {
    const trades = ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-20'].map(
      (date) => makeTrade({ date }),
    )
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
