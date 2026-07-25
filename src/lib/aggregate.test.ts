import { describe, expect, it } from 'vitest'
import {
  EMPTY_STATS,
  byPair,
  bySession,
  byTag,
  computeStats,
  equityCurve,
  groupByDay,
  maxDrawdown,
  sessionHeatmap,
  sortChronological,
  summarizeDay,
  tradesInRange,
} from './aggregate'
import { makeTrade, makeTrades } from '#/test/factories'

describe('computeStats', () => {
  it('returns a zeroed shape for no trades rather than NaN', () => {
    expect(computeStats([])).toEqual(EMPTY_STATS)
  })

  it('counts wins, losses and flats separately', () => {
    const s = computeStats(makeTrades([100, -50, 0, 200]))
    expect(s.trades).toBe(4)
    expect(s.wins).toBe(2)
    expect(s.losses).toBe(1)
    expect(s.flats).toBe(1)
  })

  it('sums PnL', () => {
    expect(computeStats(makeTrades([100, -50, 200])).pnl).toBe(250)
  })

  it('counts flats against win rate honestly', () => {
    // 1 win of 2 taken trades is 50%, not 100%.
    expect(computeStats(makeTrades([100, 0])).winRate).toBe(50)
  })

  it('computes profit factor as gross profit over gross loss', () => {
    expect(computeStats(makeTrades([200, 100, -100])).profitFactor).toBe(3)
  })

  it('returns null profit factor when there are no losses, not Infinity', () => {
    expect(computeStats(makeTrades([100, 200])).profitFactor).toBeNull()
  })

  it('averages wins and losses independently', () => {
    const s = computeStats(makeTrades([100, 300, -50, -150]))
    expect(s.avgWin).toBe(200)
    expect(s.avgLoss).toBe(100)
  })

  it('computes expectancy per trade', () => {
    expect(computeStats(makeTrades([100, -50, 100, -50])).expectancy).toBe(25)
  })

  it('averages R only over trades that actually carry one', () => {
    const trades = [
      makeTrade({ pnl: 200, rMultiple: 2 }),
      makeTrade({ pnl: -100, rMultiple: -1 }),
      makeTrade({ pnl: 50 }), // minimal-level trade, no R
    ]
    const s = computeStats(trades)
    expect(s.expectancyR).toBe(0.5)
    expect(s.totalR).toBe(1)
  })

  it('tracks best and worst trade', () => {
    const s = computeStats(makeTrades([100, -400, 900]))
    expect(s.bestTrade).toBe(900)
    expect(s.worstTrade).toBe(-400)
  })

  it('does not accumulate float error', () => {
    expect(computeStats(makeTrades([0.1, 0.2])).pnl).toBe(0.3)
  })
})

describe('day bucketing', () => {
  it('groups trades by their calendar date', () => {
    const trades = [
      makeTrade({ date: '2026-07-14' }),
      makeTrade({ date: '2026-07-14' }),
      makeTrade({ date: '2026-07-15' }),
    ]
    const g = groupByDay(trades)
    expect(g.get('2026-07-14')).toHaveLength(2)
    expect(g.get('2026-07-15')).toHaveLength(1)
  })

  it('labels a day by its net PnL, not its trade count', () => {
    // Two wins and one bigger loss is a losing day.
    const day = summarizeDay('2026-07-14', makeTrades([100, 100, -300]))
    expect(day.outcome).toBe('loss')
    expect(day.stats.wins).toBe(2)
  })

  it('calls a net-zero day flat', () => {
    expect(summarizeDay('2026-07-14', makeTrades([100, -100])).outcome).toBe('flat')
  })

  it('counts violations across the day', () => {
    const day = summarizeDay('2026-07-14', [
      makeTrade({ ruleViolations: [{ code: 'risk-exceeded', message: 'x' }] }),
      makeTrade({
        ruleViolations: [
          { code: 'risk-exceeded', message: 'x' },
          { code: 'pair-not-allowed', message: 'y' },
        ],
      }),
      makeTrade({}),
    ])
    expect(day.violations).toBe(3)
  })

  it('filters an inclusive date range', () => {
    const trades = [
      makeTrade({ date: '2026-07-12' }),
      makeTrade({ date: '2026-07-13' }),
      makeTrade({ date: '2026-07-19' }),
      makeTrade({ date: '2026-07-20' }),
    ]
    expect(tradesInRange(trades, '2026-07-13', '2026-07-19')).toHaveLength(2)
  })
})

describe('chronological ordering', () => {
  it('orders by date, then clock time', () => {
    const a = makeTrade({ date: '2026-07-14', time: '14:00' })
    const b = makeTrade({ date: '2026-07-14', time: '09:00' })
    const c = makeTrade({ date: '2026-07-13', time: '23:00' })
    expect(sortChronological([a, b, c]).map((t) => t.id)).toEqual([c.id, b.id, a.id])
  })

  it('falls back to insertion order when times are absent', () => {
    const a = makeTrade({ date: '2026-07-14', createdAt: 2 })
    const b = makeTrade({ date: '2026-07-14', createdAt: 1 })
    expect(sortChronological([a, b]).map((t) => t.id)).toEqual([b.id, a.id])
  })

  it('does not mutate the input array', () => {
    const trades = makeTrades([1, 2, 3])
    const before = trades.map((t) => t.id)
    sortChronological(trades)
    expect(trades.map((t) => t.id)).toEqual(before)
  })
})

describe('equity curve', () => {
  it('starts at zero so the curve has an origin to draw from', () => {
    expect(equityCurve([])).toEqual([{ index: 0, cumulative: 0 }])
  })

  it('accumulates trade by trade', () => {
    const pts = equityCurve(makeTrades([100, -30, 50]))
    expect(pts.map((p) => p.cumulative)).toEqual([0, 100, 70, 120])
  })

  it('has exactly one point more than there are trades', () => {
    expect(equityCurve(makeTrades([1, 2, 3, 4]))).toHaveLength(5)
  })

  it('measures peak-to-trough drawdown', () => {
    // 0 → 100 → 20 → 120: worst drop is 80.
    expect(maxDrawdown(makeTrades([100, -80, 100]))).toBe(80)
  })

  it('reports zero drawdown on a monotonic curve', () => {
    expect(maxDrawdown(makeTrades([50, 50, 50]))).toBe(0)
  })
})

describe('breakdowns', () => {
  it('splits by pair, best first', () => {
    const rows = byPair([
      makeTrade({ pair: 'EURUSD', pnl: 100 }),
      makeTrade({ pair: 'XAUUSD', pnl: 500 }),
      makeTrade({ pair: 'EURUSD', pnl: -20 }),
    ])
    expect(rows.map((r) => r.key)).toEqual(['XAUUSD', 'EURUSD'])
    expect(rows[1].stats.pnl).toBe(80)
  })

  it('counts a multi-tagged trade under each of its tags', () => {
    const rows = byTag([
      makeTrade({ tags: ['breakout', 'london'], pnl: 100 }),
      makeTrade({ tags: ['breakout'], pnl: -50 }),
    ])
    expect(rows.find((r) => r.key === 'breakout')?.stats.trades).toBe(2)
    expect(rows.find((r) => r.key === 'london')?.stats.trades).toBe(1)
  })

  it('skips trades with no clock time when splitting by session', () => {
    const rows = bySession([
      makeTrade({ time: '08:30', pnl: 100 }),
      makeTrade({ pnl: 100 }), // no time — not attributable
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].key).toBe('london')
  })
})

describe('session heatmap', () => {
  it('returns a dense 3×5 grid so cells are never missing', () => {
    const cells = sessionHeatmap([])
    expect(cells).toHaveLength(15)
    expect(cells.every((c) => c.stats.trades === 0)).toBe(true)
  })

  it('places a trade in the right session and weekday cell', () => {
    // 2026-07-14 is a Tuesday (weekday 2), 08:30 is London.
    const cells = sessionHeatmap([makeTrade({ date: '2026-07-14', time: '08:30', pnl: 250 })])
    const cell = cells.find((c) => c.session === 'london' && c.weekday === 2)
    expect(cell?.stats.trades).toBe(1)
    expect(cell?.stats.pnl).toBe(250)
  })

  it('excludes weekend and off-session trades from the grid', () => {
    // 2026-07-18 is a Saturday; 22:00 is off-session.
    const cells = sessionHeatmap([
      makeTrade({ date: '2026-07-18', time: '08:30', pnl: 100 }),
      makeTrade({ date: '2026-07-14', time: '22:00', pnl: 100 }),
    ])
    expect(cells.every((c) => c.stats.trades === 0)).toBe(true)
  })
})
