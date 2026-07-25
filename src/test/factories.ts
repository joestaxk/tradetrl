import type { Trade, UserPrefs } from '#/lib/types'

let seq = 0

/** Minimal-by-default trade — mirrors what a `minimal` user actually logs. */
export function makeTrade(overrides: Partial<Trade> = {}): Trade {
  seq += 1
  const pnl = overrides.pnl ?? 100
  return {
    id: `t${seq}`,
    journalId: 'default',
    date: '2026-07-14',
    pair: 'EURUSD',
    direction: 'buy',
    status: 'closed',
    outcome: pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'flat',
    pnl,
    createdAt: 1_700_000_000_000 + seq,
    ...overrides,
  }
}

export function makeTrades(pnls: number[], overrides: Partial<Trade> = {}): Trade[] {
  return pnls.map((pnl) => makeTrade({ pnl, ...overrides }))
}

export function makePrefs(overrides: Partial<UserPrefs> = {}): UserPrefs {
  return {
    entryDetailLevel: 'detailed',
    emailCheckInOptIn: false,
    riskRules: {},
    planCadence: 'week',
    themeLock: 'dark',
    ...overrides,
  }
}

export function resetFactories() {
  seq = 0
}
