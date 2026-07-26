import { describe, expect, it } from 'vitest'
import {
  biasAlignment,
  isDuplicateName,
  isOffPlan,
  planOutcome,
  ruleLockReason,
  rulesLocked,
  strategiesLocked,
  strategyPerformance,
} from './strategies'
import { makeTrade } from '#/test/factories'
import type { PeriodPlan, Strategy } from './types'

const strat = (id: string, name: string): Strategy => ({ id, name, createdAt: 0 })

const STRATS = [strat('s1', 'London sweep'), strat('s2', 'NY open range'), strat('s3', 'Swing')]

const plan = (strategyIds: string[], over: Partial<PeriodPlan> = {}): PeriodPlan => ({
  id: 'W-2026-02',
  kind: 'week',
  periodStart: '2026-01-05',
  periodEnd: '2026-01-11',
  strategyIds,
  riskRuleSnapshot: {},
  createdAt: 0,
  ...over,
})

describe('rule lock', () => {
  it('is open before the first trade of the period', () => {
    expect(rulesLocked(plan(['s1']))).toBe(false)
    expect(ruleLockReason(plan(['s1']))).toBeNull()
  })

  it('closes once a trade has been logged against the rules', () => {
    const locked = plan(['s1'], { lockedAt: 123 })
    // Pinned to a Wednesday: the lock releases at the weekend by design, so a
    // test that relied on "today" would pass or fail depending on the day it
    // happened to run.
    expect(rulesLocked(locked, undefined, '2026-07-22')).toBe(true)
    // The reason matters: it explains rather than just refusing.
    expect(ruleLockReason(locked, undefined, '2026-07-22')).toMatch(/already traded/i)
  })

  it('treats a missing plan as unlocked', () => {
    expect(rulesLocked(null)).toBe(false)
    expect(rulesLocked(undefined)).toBe(false)
  })
})

describe('off-plan detection', () => {
  it('flags a strategy that was not in the plan', () => {
    expect(isOffPlan({ strategyId: 's2' }, plan(['s1']))).toBe(true)
  })

  it('accepts a strategy that was', () => {
    expect(isOffPlan({ strategyId: 's1' }, plan(['s1', 's2']))).toBe(false)
  })

  it('promises nothing when the plan named no strategies', () => {
    // Nothing was declared, so nothing can be a deviation.
    expect(isOffPlan({ strategyId: 's2' }, plan([]))).toBe(false)
    expect(isOffPlan({ strategyId: 's2' }, null)).toBe(false)
  })

  it('does not call an untagged trade a deviation', () => {
    expect(isOffPlan({ strategyId: undefined }, plan(['s1']))).toBe(false)
  })
})

describe('strategy performance', () => {
  it('splits results by strategy, best first', () => {
    const rows = strategyPerformance(
      [
        makeTrade({ strategyId: 's1', pnl: 100 }),
        makeTrade({ strategyId: 's1', pnl: -40 }),
        makeTrade({ strategyId: 's2', pnl: 500 }),
      ],
      STRATS,
    )
    expect(rows.map((r) => r.name)).toEqual(['NY open range', 'London sweep'])
    expect(rows[1].stats.pnl).toBe(60)
  })

  it('ignores trades with no strategy', () => {
    const rows = strategyPerformance([makeTrade({ pnl: 100 })], STRATS)
    expect(rows).toEqual([])
  })

  it('survives a strategy that was archived away', () => {
    const rows = strategyPerformance([makeTrade({ strategyId: 'gone', pnl: 10 })], STRATS)
    expect(rows[0].name).toBe('Removed strategy')
  })

  it('counts off-plan trades per strategy', () => {
    const rows = strategyPerformance(
      [
        makeTrade({ strategyId: 's2', pnl: 100, offPlan: true }),
        makeTrade({ strategyId: 's2', pnl: 50 }),
      ],
      STRATS,
      plan(['s1']),
    )
    expect(rows[0].offPlanCount).toBe(1)
    expect(rows[0].planned).toBe(false)
  })
})

describe('plan outcome', () => {
  it('says nothing when there was no deviation and no plan', () => {
    expect(planOutcome([], null, STRATS).verdict).toBeNull()
  })

  it('confirms a period where everything stayed on plan', () => {
    const out = planOutcome(
      [makeTrade({ strategyId: 's1', pnl: 100 }), makeTrade({ strategyId: 's1', pnl: -20 })],
      plan(['s1']),
      STRATS,
    )
    expect(out.verdict).toMatch(/every trade this period used a strategy you planned/i)
  })

  it('reports a costly deviation', () => {
    const out = planOutcome(
      [
        makeTrade({ strategyId: 's1', pnl: 100 }),
        makeTrade({ strategyId: 's2', pnl: -400, offPlan: true }),
      ],
      plan(['s1']),
      STRATS,
    )
    expect(out.verdict).toContain('NY open range')
    expect(out.verdict).toMatch(/cost/i)
    expect(out.offPlanTrades).toHaveLength(1)
  })

  it('reports a PROFITABLE deviation just as plainly', () => {
    // The important one. Only reporting losing deviations would teach
    // "trust your gut when it works", which is how accounts die.
    const out = planOutcome(
      [
        makeTrade({ strategyId: 's1', pnl: 50 }),
        makeTrade({ strategyId: 's2', pnl: 900, offPlan: true }),
      ],
      plan(['s1']),
      STRATS,
    )
    expect(out.verdict).toContain('NY open range')
    expect(out.verdict).toMatch(/made/i)
    expect(out.verdict).toMatch(/next period's plan/i)
  })

  it('never praises the deviation it reports', () => {
    const out = planOutcome(
      [makeTrade({ strategyId: 's2', pnl: 900, offPlan: true })],
      plan(['s1']),
      STRATS,
    )
    const text = (out.verdict ?? '').toLowerCase()
    for (const word of ['well done', 'great', 'nice', 'good call', 'keep it up']) {
      expect(text).not.toContain(word)
    }
  })

  it('compares planned against off-plan expectancy when both exist', () => {
    const out = planOutcome(
      [
        makeTrade({ strategyId: 's1', pnl: 100, rMultiple: 1 }),
        makeTrade({ strategyId: 's1', pnl: 100, rMultiple: 1 }),
        makeTrade({ strategyId: 's2', pnl: -200, rMultiple: -2, offPlan: true }),
        makeTrade({ strategyId: 's2', pnl: -200, rMultiple: -2, offPlan: true }),
      ],
      plan(['s1']),
      STRATS,
    )
    expect(out.verdict).toMatch(/planned setups ran at/i)
  })
})

describe('bias alignment', () => {
  const withBias = (dir: 'buy' | 'sell', bias: 'bullish' | 'bearish', pnl: number, r: number) =>
    makeTrade({ direction: dir, bias: { weekly: bias }, pnl, rMultiple: r })

  it('stays quiet until both sides have enough trades', () => {
    const out = biasAlignment([withBias('buy', 'bullish', 100, 1)], 'weekly')
    expect(out.line).toBeNull()
  })

  it('compares trading with the bias against trading into it', () => {
    const trades = [
      ...Array.from({ length: 4 }, () => withBias('buy', 'bullish', 200, 2)),
      ...Array.from({ length: 4 }, () => withBias('sell', 'bullish', -100, -1)),
    ]
    const out = biasAlignment(trades, 'weekly')
    expect(out.withBias.trades).toBe(4)
    expect(out.againstBias.trades).toBe(4)
    expect(out.line).toMatch(/with your weekly bias paid better/i)
  })

  it('is willing to say the counter-trend trades did better', () => {
    const trades = [
      ...Array.from({ length: 4 }, () => withBias('buy', 'bullish', -100, -1)),
      ...Array.from({ length: 4 }, () => withBias('sell', 'bullish', 300, 3)),
    ]
    expect(biasAlignment(trades, 'weekly').line).toMatch(/counter-trend/i)
  })

  it('ignores a neutral bias, which agrees with nothing', () => {
    const trades = Array.from({ length: 8 }, () =>
      makeTrade({ direction: 'buy', bias: { weekly: 'neutral' }, pnl: 100 }),
    )
    const out = biasAlignment(trades, 'weekly')
    expect(out.withBias.trades).toBe(0)
    expect(out.againstBias.trades).toBe(0)
  })
})

describe('duplicate names', () => {
  it('catches the same name typed differently', () => {
    expect(isDuplicateName(STRATS, 'london sweep')).toBe(true)
    expect(isDuplicateName(STRATS, '  London   Sweep  ')).toBe(true)
  })

  it('allows a genuinely new name', () => {
    expect(isDuplicateName(STRATS, 'Asia range')).toBe(false)
  })

  it('does not count a strategy against itself when renaming', () => {
    expect(isDuplicateName(STRATS, 'London sweep', 's1')).toBe(false)
  })

  it('ignores archived strategies', () => {
    const archived = [{ ...strat('s9', 'Old setup'), archivedAt: 1 }]
    expect(isDuplicateName(archived, 'Old setup')).toBe(false)
  })
})

describe('rule lock — scope and release', () => {
  const plan = (over = {}) => ({
    id: 'W-2026-30',
    kind: 'week' as const,
    periodStart: '2026-07-20',
    periodEnd: '2026-07-26',
    strategyIds: [],
    riskRuleSnapshot: {},
    createdAt: 0,
    ...over,
  })

  // 2026-07-22 is a Wednesday; 07-25 Saturday; 07-26 Sunday.
  const WED = '2026-07-22'
  const SAT = '2026-07-25'
  const SUN = '2026-07-26'

  it('locks the account that actually traded', () => {
    const p = plan({ lockedAt: 1, lockedAccounts: ['prop'] })
    expect(rulesLocked(p, 'prop', WED)).toBe(true)
  })

  it('leaves other accounts alone', () => {
    // Trading the prop account has no business freezing the personal one —
    // they have entirely separate rules.
    const p = plan({ lockedAt: 1, lockedAccounts: ['prop'] })
    expect(rulesLocked(p, 'personal', WED)).toBe(false)
  })

  it('opens at the weekend so the week ahead can be planned', () => {
    const p = plan({ lockedAt: 1, lockedAccounts: ['prop'] })
    expect(rulesLocked(p, 'prop', SAT)).toBe(false)
    expect(rulesLocked(p, 'prop', SUN)).toBe(false)
  })

  it('is never locked without a plan', () => {
    expect(rulesLocked(null, 'prop', WED)).toBe(false)
  })

  it('falls back to the global flag for plans written before per-account locks', () => {
    // Old documents recorded only that *something* traded. Unlocking them
    // silently would quietly reopen rules someone traded against.
    const p = plan({ lockedAt: 1 })
    expect(rulesLocked(p, 'prop', WED)).toBe(true)
  })

  it('explains itself only while actually locked', () => {
    const p = plan({ lockedAt: 1, lockedAccounts: ['prop'] })
    expect(ruleLockReason(p, 'prop', WED)).toMatch(/locked until Monday/i)
    expect(ruleLockReason(p, 'prop', SUN)).toBeNull()
    expect(ruleLockReason(p, 'personal', WED)).toBeNull()
  })

  it('says strategies stay editable, because they do', () => {
    const p = plan({ lockedAt: 1, lockedAccounts: ['prop'] })
    expect(ruleLockReason(p, 'prop', WED)).toMatch(/strategies stay editable/i)
    expect(strategiesLocked()).toBe(false)
  })
})
