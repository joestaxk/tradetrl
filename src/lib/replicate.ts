/**
 * Taking the same trade across several accounts.
 *
 * ── The problem ───────────────────────────────────────────────────────────
 * A trader running four funded accounts takes one setup on all four. It is one
 * decision, one chart, one reason — but four separate journal entries, each
 * needing its own numbers because each account has a different balance. In
 * practice people give up and log it once, which quietly corrupts every
 * statistic: the risk they actually took was four times what the journal says.
 *
 * ── The rule ──────────────────────────────────────────────────────────────
 * **R is the invariant, money is not.** Risking 1% on a 50k and 1% on a 100k
 * is the *same trade* — same conviction, same stop, same result in R — but
 * £500 against £1,000, and double the lot size. So everything denominated in
 * money scales by the ratio of the two accounts' risk allowances, and
 * everything denominated in R stays put.
 *
 * Copying the money across unchanged would be the obvious implementation and
 * would be wrong: it would report the 100k account as having risked half what
 * it did.
 */

import { isNum, round2 } from './calc'
import type { ResolvedJournal, TradeDraft } from './types'

export interface ReplicaTarget {
  journal: ResolvedJournal
  /** The account's risk base — starting or current balance, per its setting. */
  riskBase: number | null
}

export interface Replica {
  journalId: string
  journalName: string
  draft: TradeDraft
  /** What this account is actually risking, once scaled. */
  riskAmount: number | null
  /** Multiplier applied to every money figure. 1 means unchanged. */
  scale: number
  /** Set when we could not scale and copied the figures as-is. */
  unscaled: boolean
}

/**
 * The factor between two accounts for the same risk percentage.
 *
 * Deliberately based on the *risk base* rather than the raw balance, because
 * an account set to `starting` keeps a fixed allowance through a drawdown
 * while a `current` one compounds. Using the balance would silently disagree
 * with what the risk readout showed while the trade was being logged.
 */
export function scaleBetween(
  sourceBase: number | null | undefined,
  targetBase: number | null | undefined,
): number | null {
  if (!isNum(sourceBase) || !isNum(targetBase)) return null
  if (sourceBase <= 0 || targetBase <= 0) return null
  return targetBase / sourceBase
}

/** Scales a money figure, leaving absent values absent rather than zeroing. */
function scaled(value: number | undefined, factor: number): number | undefined {
  if (!isNum(value)) return undefined
  return round2(value * factor)
}

/**
 * Lot size scales like money, but brokers price in fixed increments — a
 * 0.3333 lot is not an order anyone can place. Two decimals is the smallest
 * unit every retail broker accepts.
 */
function scaledLots(value: number | undefined, factor: number): number | undefined {
  if (!isNum(value)) return undefined
  const raw = value * factor
  const rounded = Math.round(raw * 100) / 100
  // Never round a real position down to nothing.
  return rounded > 0 ? rounded : 0.01
}

export interface ReplicateInput {
  draft: TradeDraft
  /** The account the trade was actually filled out against. */
  sourceJournalId: string
  sourceRiskBase: number | null
  targets: ReplicaTarget[]
}

/**
 * One filled-in trade becomes one draft per selected account.
 *
 * The source account is included when it is among the targets, so the caller
 * has a single uniform list to save rather than a special case.
 */
export function replicateTrade({
  draft,
  sourceJournalId,
  sourceRiskBase,
  targets,
}: ReplicateInput): Replica[] {
  return targets.map(({ journal, riskBase }) => {
    if (journal.id === sourceJournalId) {
      return {
        journalId: journal.id,
        journalName: journal.name,
        draft,
        riskAmount: isNum(draft.riskAmount) ? draft.riskAmount : null,
        scale: 1,
        unscaled: false,
      }
    }

    const factor = scaleBetween(sourceRiskBase, riskBase)

    /*
      Without both balances there is no honest ratio. Copying the numbers
      unchanged is the least-wrong option — it is what the trader would have
      typed by hand — and `unscaled` lets the UI say so rather than implying
      an adjustment that never happened.
    */
    if (factor === null) {
      return {
        journalId: journal.id,
        journalName: journal.name,
        draft: { ...draft },
        riskAmount: isNum(draft.riskAmount) ? draft.riskAmount : null,
        scale: 1,
        unscaled: true,
      }
    }

    const next: TradeDraft = {
      ...draft,
      lotSize: scaledLots(draft.lotSize, factor),
      riskAmount: scaled(draft.riskAmount, factor),
      pnl: round2(draft.pnl * factor),
      // Untouched on purpose: the percentage risked is the thing being held
      // constant, and R is the same trade however much money was behind it.
      riskPct: draft.riskPct,
      rMultiple: draft.rMultiple,
    }

    return {
      journalId: journal.id,
      journalName: journal.name,
      draft: next,
      riskAmount: isNum(next.riskAmount) ? next.riskAmount : null,
      scale: round2(factor),
      unscaled: false,
    }
  })
}

/** Plain-language summary for the confirmation line under the picker. */
export function replicaSummary(replicas: Replica[], currency = 'USD'): string {
  if (replicas.length <= 1) return ''

  const money = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(n)

  const known = replicas.filter((r) => r.riskAmount !== null)
  if (known.length === 0) {
    return `This will be logged to ${replicas.length} accounts.`
  }

  const total = known.reduce((sum, r) => sum + (r.riskAmount ?? 0), 0)
  return `${replicas.length} accounts · ${money(total)} at risk in total`
}
