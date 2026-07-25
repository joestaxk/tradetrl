/**
 * A realistic month of trading, used by the dev-only design preview and by
 * component tests. Deliberately messy: a flat day, a rule-breaking day, days
 * with no reasons written, and one trader who logs times only sometimes —
 * because a fixture where everything is filled in hides exactly the layout
 * bugs this product needs to get right.
 */

import { addDays, startOfMonth, today } from '#/lib/dates'
import type { Journal, Trade, UserDoc } from '#/lib/types'

const PAIRS = ['EURUSD', 'XAUUSD', 'GBPUSD', 'US30', 'USDJPY']

const REASONS = [
  'London swept the Asia low, took the reclaim on the 5m.',
  'Continuation off the daily level. Nothing clever.',
  'Chased it after the first one stopped out. Knew better.',
  '',
  'NY open range break, waited for the retest.',
  '',
  'Small size, half conviction. Should probably have skipped it.',
]

let counter = 0

function trade(over: Partial<Trade> & { date: string }): Trade {
  counter += 1
  const pnl = over.pnl ?? 0
  return {
    id: `fx-${counter}`,
    journalId: 'default',
    pair: PAIRS[counter % PAIRS.length],
    direction: counter % 3 === 0 ? 'sell' : 'buy',
    status: 'closed',
    outcome: pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'flat',
    createdAt: 1_700_000_000_000 + counter * 1000,
    ...over,
    pnl,
  }
}

/** ~30 trades across the current month, anchored to today so it never looks stale. */
export function fixtureTrades(now: string = today()): Trade[] {
  counter = 0
  const first = startOfMonth(now)
  const d = (n: number) => addDays(first, n)

  const rows: Array<Partial<Trade> & { date: string }> = [
    { date: d(1), pnl: 240, time: '08:40', closeTime: '09:25', lotSize: 0.2, riskAmount: 120, riskPct: 1.2, rMultiple: 2, reason: REASONS[0], tags: ['london', 'sweep'] },
    { date: d(1), pnl: -120, time: '13:10', lotSize: 0.2, riskAmount: 120, riskPct: 1.2, rMultiple: -1 },
    { date: d(2), pnl: 610, time: '09:05', closeTime: '13:40', lotSize: 0.3, riskAmount: 180, riskPct: 1.8, rMultiple: 3.39, reason: REASONS[1], tags: ['continuation'] },
    { date: d(3), pnl: -95, time: '14:20', lotSize: 0.1, riskAmount: 90, riskPct: 0.9, rMultiple: -1.06, tags: ['continuation'] },
    { date: d(6), pnl: 180, time: '08:15', lotSize: 0.2, riskAmount: 100, riskPct: 1, rMultiple: 1.8, tags: ['london'] },
    { date: d(6), pnl: -100, time: '09:50', lotSize: 0.2, riskAmount: 100, riskPct: 1, rMultiple: -1, tags: ['london'] },
    { date: d(6), pnl: -320, time: '10:05', lotSize: 0.6, riskAmount: 320, riskPct: 3.2, rMultiple: -1, reason: REASONS[2], tags: ['london', 'sweep'], ruleViolations: [{ code: 'risk-exceeded', message: 'Risked 3.2% against your 1% limit.' }] },
    { date: d(7), pnl: 0, time: '11:00', lotSize: 0.1, riskAmount: 60, riskPct: 0.6, rMultiple: 0, reason: REASONS[6] },
    { date: d(8), pnl: 425, time: '15:30', lotSize: 0.25, riskAmount: 140, riskPct: 1.4, rMultiple: 3.04, reason: REASONS[4], tags: ['ny-open'], beforeChartUrl: 'https://www.tradingview.com/x/example1', afterChartUrl: 'https://www.tradingview.com/x/example2' },
    { date: d(9), pnl: -140, time: '08:55', lotSize: 0.2, riskAmount: 130, riskPct: 1.3, rMultiple: -1.08 },
    { date: d(10), pnl: 290, time: '13:45', lotSize: 0.2, riskAmount: 110, riskPct: 1.1, rMultiple: 2.64, tags: ['ny-open'] },
    { date: d(13), pnl: 155, lotSize: 0.15, riskAmount: 90, riskPct: 0.9, rMultiple: 1.72 },
    { date: d(14), pnl: -210, time: '02:30', lotSize: 0.2, riskAmount: 200, riskPct: 2, rMultiple: -1.05, pair: 'USDJPY', ruleViolations: [{ code: 'pair-not-allowed', message: 'USDJPY is outside the pairs you listed.' }] },
    { date: d(15), pnl: 880, time: '09:20', closeTime: '11:05', lotSize: 0.4, riskAmount: 220, riskPct: 2.2, rMultiple: 4, reason: REASONS[0], tags: ['london', 'sweep'], ruleViolations: [{ code: 'risk-exceeded', message: 'Risked 2.2% against your 1% limit.' }] },
    { date: d(16), pnl: -75, time: '16:10', lotSize: 0.1, riskAmount: 70, riskPct: 0.7, rMultiple: -1.07, tags: ['ny-open'] },
    { date: d(17), pnl: 340, time: '08:30', lotSize: 0.2, riskAmount: 120, riskPct: 1.2, rMultiple: 2.83, tags: ['london'] },
    { date: d(17), pnl: 120, time: '14:00', lotSize: 0.1, riskAmount: 80, riskPct: 0.8, rMultiple: 1.5 },
    { date: d(20), pnl: -260, time: '09:15', lotSize: 0.25, riskAmount: 150, riskPct: 1.5, rMultiple: -1.73, tags: ['ny-open'] },
    { date: d(21), pnl: -180, time: '10:30', lotSize: 0.2, riskAmount: 130, riskPct: 1.3, rMultiple: -1.38 },
    { date: d(21), pnl: -90, time: '11:15', lotSize: 0.15, riskAmount: 95, riskPct: 0.95, rMultiple: -0.95 },
    { date: d(21), pnl: -150, time: '12:05', lotSize: 0.2, riskAmount: 140, riskPct: 1.4, rMultiple: -1.07, reason: REASONS[2], tags: ['sweep'] },
    { date: d(22), pnl: 520, time: '13:50', closeTime: '15:10', lotSize: 0.3, riskAmount: 160, riskPct: 1.6, rMultiple: 3.25, reason: REASONS[4], tags: ['ny-open'] },
    { date: d(23), pnl: 95, lotSize: 0.1, riskAmount: 70, riskPct: 0.7, rMultiple: 1.36 },
    { date: d(24), pnl: 0, time: '08:45', lotSize: 0.1, riskAmount: 60, riskPct: 0.6, rMultiple: 0 },
    { date: d(27), pnl: 730, time: '09:40', closeTime: '14:55', lotSize: 0.35, riskAmount: 190, riskPct: 1.9, rMultiple: 3.84, reason: REASONS[1], tags: ['continuation', 'london'] },
    { date: d(28), pnl: -130, time: '15:05', lotSize: 0.2, riskAmount: 120, riskPct: 1.2, rMultiple: -1.08, closeDate: d(28), closeTime: '16:20' },
    // Two limits set and still waiting — the open-trade path.
    { date: d(24), pnl: 0, status: 'open', time: '07:55', pair: 'GBPUSD', lotSize: 0.2, entryPrice: 1.268, stopPrice: 1.2655, targetPrice: 1.276, riskAmount: 50, riskPct: 0.5, reason: 'Limit at the daily level, waiting.' },
    { date: d(24), pnl: 0, status: 'open', pair: 'XAUUSD', direction: 'sell', lotSize: 0.1, entryPrice: 2412, stopPrice: 2418, targetPrice: 2396 },
  ]

  return rows.map(trade)
}

export function fixtureProfile(): UserDoc {
  return {
    uid: 'preview',
    displayName: 'Sam Rivers',
    email: 'sam@example.com',
    photoURL: null,
    createdAt: Date.now() - 90 * 86_400_000,
    lastActiveAt: Date.now(),
    onboardedAt: Date.now() - 90 * 86_400_000,
    plan: 'pro',
    activeJournalId: 'default',
    prefs: {
      entryDetailLevel: 'detailed',
      emailCheckInOptIn: false,
      planCadence: 'week',
      themeLock: 'dark',
      currency: 'USD',
      accountSize: 10_000,
      riskRules: {
        maxRiskPerTradePct: 1,
        allowedPairs: ['EURUSD', 'XAUUSD', 'GBPUSD', 'US30'],
        maxTradesPerDay: 3,
      },
    },
  }
}

/** Two accounts, so the switcher and per-account rules are exercised. */
export function fixtureJournals(): Journal[] {
  return [
    {
      id: 'default',
      name: 'FTMO 50k',
      createdAt: Date.now() - 90 * 86_400_000,
      kind: 'prop',
      accountSize: 50_000,
      currency: 'USD',
      riskRules: {
        maxRiskPerTradePct: 1,
        allowedPairs: ['EURUSD', 'XAUUSD', 'GBPUSD', 'US30'],
        maxTradesPerDay: 3,
        noWeekendTrading: true,
      },
    },
    {
      id: 'personal',
      name: 'Personal 100k',
      createdAt: Date.now() - 40 * 86_400_000,
      kind: 'personal',
      accountSize: 100_000,
      currency: 'USD',
      riskRules: { maxRiskPerTradePct: 2 },
    },
  ]
}
