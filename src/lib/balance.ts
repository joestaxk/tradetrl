/**
 * Account balance.
 *
 * Until now the account was decorative: a number you typed once, used only as
 * a denominator. This module makes it the spine of the journal — every closed
 * trade moves it, and the trader can see what their P&L has actually done to
 * the money since the day they opened the account.
 *
 * The one subtlety worth stating: `riskBase` is not always the current
 * balance. Prop firms define "1%" against the deposit, fixed forever, so an
 * account set to `starting` keeps the same risk allowance through a drawdown.
 * An account set to `current` compounds. Both are legitimate; conflating them
 * would silently misstate every risk figure on one of them.
 */

import { round2 } from './calc'
import { closedOnly, sortChronological } from './aggregate'
import type { AccountStanding, ResolvedJournal, Trade } from './types'

export const EMPTY_STANDING: AccountStanding = {
  startingBalance: null,
  currentBalance: null,
  netPnl: 0,
  returnPct: null,
  riskBase: null,
  peakBalance: null,
  maxDrawdown: 0,
  maxDrawdownPct: null,
  closedTrades: 0,
}

/**
 * Everything the account is currently worth, derived from its trades.
 *
 * Trades are filtered to the journal by the caller; passing another account's
 * trades would produce a confidently wrong balance, which is worse than none.
 */
export function accountStanding(
  journal: Pick<ResolvedJournal, 'startingBalance' | 'startedOn' | 'riskBasis'>,
  trades: Trade[],
): AccountStanding {
  /*
    Every closed trade in the account moves its balance. Full stop.

    This used to filter to `t.date >= startedOn`, which was wrong and quietly
    destructive: a trade belongs to an account by `journalId`, not by date, so
    the filter could never prevent cross-account leakage — it only hid money.
    Create an account today, back-fill last week, and the balance sat at the
    opening figure while the very same trades showed up in the calendar and
    the P&L. `startedOn` is a label for when the account opened, nothing more.
  */
  const closed = sortChronological(closedOnly(trades))

  const netPnl = round2(closed.reduce((sum, t) => sum + t.pnl, 0))
  const starting = isPositiveNumber(journal.startingBalance)
    ? journal.startingBalance
    : null

  if (starting === null) {
    return {
      ...EMPTY_STANDING,
      netPnl,
      closedTrades: closed.length,
    }
  }

  const currentBalance = round2(starting + netPnl)

  // Walk the equity curve for the true peak-to-trough, which is not the same
  // as the worst single day and is the number a prop evaluation cares about.
  let running = starting
  let peak = starting
  let worstDrop = 0
  let worstDropPct = 0
  for (const t of closed) {
    running = running + t.pnl
    if (running > peak) peak = running
    const drop = peak - running
    if (drop > worstDrop) {
      worstDrop = drop
      worstDropPct = peak > 0 ? (drop / peak) * 100 : 0
    }
  }

  return {
    startingBalance: starting,
    currentBalance,
    netPnl,
    returnPct: round2((netPnl / starting) * 100),
    riskBase: journal.riskBasis === 'current' ? currentBalance : starting,
    peakBalance: round2(peak),
    maxDrawdown: round2(worstDrop),
    maxDrawdownPct: round2(worstDropPct),
    closedTrades: closed.length,
  }
}

/**
 * The money a single trade is allowed to risk under this account's rules.
 * null when either the balance or the rule is missing — we never guess one.
 */
export function riskAllowance(standing: AccountStanding, maxRiskPct?: number): number | null {
  if (standing.riskBase === null) return null
  if (!isPositiveNumber(maxRiskPct)) return null
  return round2((standing.riskBase * maxRiskPct) / 100)
}

/**
 * Balance after each closed trade, for the account equity curve. Starts at the
 * opening balance rather than zero — the whole point is seeing the real money.
 */
export interface BalancePoint {
  index: number
  balance: number
  date: string
  trade?: Trade
}

export function balanceCurve(
  journal: Pick<ResolvedJournal, 'startingBalance' | 'startedOn' | 'riskBasis'>,
  trades: Trade[],
): BalancePoint[] {
  const starting = isPositiveNumber(journal.startingBalance) ? journal.startingBalance : null
  if (starting === null) return []

  // Same rule as `accountStanding`: everything in the account counts.
  const closed = sortChronological(closedOnly(trades))

  const points: BalancePoint[] = [
    { index: 0, balance: starting, date: journal.startedOn ?? closed[0]?.date ?? '' },
  ]
  let running = starting
  closed.forEach((t, i) => {
    running = round2(running + t.pnl)
    points.push({ index: i + 1, balance: running, date: t.date, trade: t })
  })
  return points
}

function isPositiveNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0
}
