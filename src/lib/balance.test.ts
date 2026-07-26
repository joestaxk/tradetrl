import { describe, expect, it } from 'vitest'
import { accountStanding, balanceCurve, riskAllowance } from './balance'
import { makeTrade } from '#/test/factories'

const account = (over: Partial<Parameters<typeof accountStanding>[0]> = {}) => ({
  startingBalance: 50_000,
  startedOn: '2026-01-01',
  riskBasis: 'starting' as const,
  ...over,
})

describe('account standing', () => {
  it('reports nothing useful without a starting balance', () => {
    const s = accountStanding(account({ startingBalance: undefined }), [
      makeTrade({ pnl: 500 }),
    ])
    expect(s.startingBalance).toBeNull()
    expect(s.currentBalance).toBeNull()
    expect(s.riskBase).toBeNull()
    // The P&L is still real even when the balance isn't known.
    expect(s.netPnl).toBe(500)
  })

  it('starts at the opening balance with no trades', () => {
    const s = accountStanding(account(), [])
    expect(s.currentBalance).toBe(50_000)
    expect(s.netPnl).toBe(0)
    expect(s.returnPct).toBe(0)
  })

  it('adds and subtracts every closed trade', () => {
    const s = accountStanding(account(), [
      makeTrade({ date: '2026-01-05', pnl: 1_200 }),
      makeTrade({ date: '2026-01-06', pnl: -450 }),
      makeTrade({ date: '2026-01-07', pnl: 300 }),
    ])
    expect(s.netPnl).toBe(1_050)
    expect(s.currentBalance).toBe(51_050)
    expect(s.returnPct).toBe(2.1)
  })

  it('ignores open trades — an unresolved trade has moved no money', () => {
    const s = accountStanding(account(), [
      makeTrade({ date: '2026-01-05', pnl: 1_000 }),
      makeTrade({ date: '2026-01-06', status: 'open', pnl: 0 }),
    ])
    expect(s.currentBalance).toBe(51_000)
    expect(s.closedTrades).toBe(1)
  })

  it('counts trades dated before the account was created', () => {
    /*
      Regression. This used to filter on `startedOn`, so setting the app up
      today and back-filling last week left the balance frozen at the opening
      figure while the same trades appeared in the calendar and the P&L.
      A trade belongs to an account by journalId, never by date.
    */
    const s = accountStanding(account({ startedOn: '2026-02-01' }), [
      makeTrade({ date: '2026-01-15', pnl: 5_000 }),
      makeTrade({ date: '2026-02-05', pnl: 200 }),
    ])
    expect(s.netPnl).toBe(5_200)
    expect(s.currentBalance).toBe(55_200)
    expect(s.closedTrades).toBe(2)
  })

  it('counts a back-filled week on an account created today', () => {
    // The exact shape of the bug: account opened today, trades dated earlier.
    const s = accountStanding(account({ startingBalance: 2_000, startedOn: '2026-07-26' }), [
      makeTrade({ date: '2026-07-20', pnl: 150 }),
      makeTrade({ date: '2026-07-22', pnl: -80 }),
      makeTrade({ date: '2026-07-24', pnl: 300 }),
    ])
    expect(s.netPnl).toBe(370)
    expect(s.currentBalance).toBe(2_370)
  })

  it('reports a loss honestly', () => {
    const s = accountStanding(account(), [makeTrade({ date: '2026-01-05', pnl: -5_000 })])
    expect(s.currentBalance).toBe(45_000)
    expect(s.returnPct).toBe(-10)
  })
})

describe('risk basis', () => {
  const trades = [makeTrade({ date: '2026-01-05', pnl: 10_000 })]

  it('holds the opening balance on a prop-style account', () => {
    const s = accountStanding(account({ riskBasis: 'starting' }), trades)
    expect(s.currentBalance).toBe(60_000)
    // The whole point: the limit does not drift as the account grows.
    expect(s.riskBase).toBe(50_000)
  })

  it('compounds with the balance when asked to', () => {
    const s = accountStanding(account({ riskBasis: 'current' }), trades)
    expect(s.riskBase).toBe(60_000)
  })

  it('shrinks the risk base after a drawdown when compounding', () => {
    const s = accountStanding(account({ riskBasis: 'current' }), [
      makeTrade({ date: '2026-01-05', pnl: -5_000 }),
    ])
    expect(s.riskBase).toBe(45_000)
  })
})

describe('risk allowance', () => {
  it('turns a percentage into money', () => {
    const s = accountStanding(account(), [])
    expect(riskAllowance(s, 1)).toBe(500)
    expect(riskAllowance(s, 2.5)).toBe(1_250)
  })

  it('follows the account basis after a win', () => {
    const trades = [makeTrade({ date: '2026-01-05', pnl: 10_000 })]
    expect(riskAllowance(accountStanding(account({ riskBasis: 'starting' }), trades), 1)).toBe(500)
    expect(riskAllowance(accountStanding(account({ riskBasis: 'current' }), trades), 1)).toBe(600)
  })

  it('refuses to guess when either half is missing', () => {
    const s = accountStanding(account(), [])
    expect(riskAllowance(s, undefined)).toBeNull()
    expect(riskAllowance(s, 0)).toBeNull()
    expect(riskAllowance(accountStanding(account({ startingBalance: undefined }), []), 1)).toBeNull()
  })
})

describe('drawdown', () => {
  it('measures peak to trough, not the worst single day', () => {
    // 50k → 55k → 48k → 52k. Worst drop is 7k from the 55k peak, not 7k of
    // single-trade loss, and not the 2k the account is currently down.
    const s = accountStanding(account(), [
      makeTrade({ date: '2026-01-05', pnl: 5_000, createdAt: 1 }),
      makeTrade({ date: '2026-01-06', pnl: -7_000, createdAt: 2 }),
      makeTrade({ date: '2026-01-07', pnl: 4_000, createdAt: 3 }),
    ])
    expect(s.peakBalance).toBe(55_000)
    expect(s.maxDrawdown).toBe(7_000)
    expect(s.maxDrawdownPct).toBeCloseTo(12.73, 1)
    expect(s.currentBalance).toBe(52_000)
  })

  it('is zero on an account that only ever went up', () => {
    const s = accountStanding(account(), [
      makeTrade({ date: '2026-01-05', pnl: 100, createdAt: 1 }),
      makeTrade({ date: '2026-01-06', pnl: 200, createdAt: 2 }),
    ])
    expect(s.maxDrawdown).toBe(0)
  })
})

describe('balance curve', () => {
  it('is empty without a starting balance to count from', () => {
    expect(balanceCurve(account({ startingBalance: undefined }), [makeTrade()])).toEqual([])
  })

  it('starts at the opening balance, not at zero', () => {
    const pts = balanceCurve(account(), [makeTrade({ date: '2026-01-05', pnl: 500 })])
    expect(pts[0].balance).toBe(50_000)
    expect(pts.at(-1)!.balance).toBe(50_500)
  })

  it('has one point per closed trade plus the origin', () => {
    const pts = balanceCurve(account(), [
      makeTrade({ date: '2026-01-05', pnl: 100, createdAt: 1 }),
      makeTrade({ date: '2026-01-06', pnl: 100, createdAt: 2 }),
      makeTrade({ date: '2026-01-07', status: 'open', pnl: 0, createdAt: 3 }),
    ])
    expect(pts).toHaveLength(3)
  })
})
