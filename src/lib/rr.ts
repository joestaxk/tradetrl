/**
 * R-based logging for the "just wins and losses" trader.
 *
 * The old minimal mode asked for a money amount, which is the least useful
 * number a trader can give us: $240 tells you nothing without knowing what was
 * risked to get it. Asking for R instead costs exactly the same one tap and
 * yields a figure that is comparable across trades, across pairs and across
 * account sizes — which is what makes expectancy computable at all.
 *
 *   win  →  +R × risk allowance
 *   loss →  −1R, because a stop that gets hit loses exactly what you risked
 *
 * That default is the whole trick: a losing trade needs no input beyond the
 * tap. It is overridable, because stops slip and people move them, and a
 * journal that cannot record a −2.4R disaster is a journal that hides the
 * thing most worth seeing.
 */

import { isNum, round2 } from './calc'
import type { Outcome } from './types'

export interface RrInput {
  outcome: Outcome
  /** R-multiple as a positive magnitude; the sign comes from `outcome`. */
  r?: number
  /** Money one R represents — the account's risk allowance for a trade. */
  riskAmount?: number
}

export interface RrResult {
  /** Signed R. Wins positive, losses negative, break-even zero. */
  rMultiple: number | null
  /** Signed money, once we know what one R is worth. */
  pnl: number | null
  /** True when we filled in the R rather than the trader stating it. */
  assumedR: boolean
}

/** A loss with no R given is a stop that got hit: exactly −1R. */
export const DEFAULT_LOSS_R = 1

export function computeFromR({ outcome, r, riskAmount }: RrInput): RrResult {
  if (outcome === 'flat') {
    return { rMultiple: 0, pnl: 0, assumedR: false }
  }

  const stated = isNum(r) && r > 0 ? r : null
  const assumedR = outcome === 'loss' && stated === null
  const magnitude = stated ?? (outcome === 'loss' ? DEFAULT_LOSS_R : null)

  if (magnitude === null) {
    // A win with no R is genuinely unknown — there is no sensible default for
    // "how good was it", and inventing 1R would fabricate an edge.
    return { rMultiple: null, pnl: null, assumedR: false }
  }

  const rMultiple = round2(outcome === 'loss' ? -magnitude : magnitude)
  const pnl =
    isNum(riskAmount) && riskAmount > 0 ? round2(rMultiple * riskAmount) : null

  return { rMultiple, pnl, assumedR }
}

/**
 * The inverse, for a trader who knows the money but not the R — and for
 * migrating trades logged before this existed.
 */
export function rFromMoney(pnl: number, riskAmount?: number): number | null {
  if (!isNum(riskAmount) || riskAmount <= 0) return null
  return round2(pnl / riskAmount)
}

/** '+2.5R' / '−1R' / 'break even' — short enough for a dense row. */
export function formatRShort(r: number | null | undefined): string {
  if (!isNum(r)) return '—'
  if (r === 0) return 'break even'
  const sign = r > 0 ? '+' : '−'
  const abs = Math.abs(r)
  // 2R reads better than 2.00R at a glance; keep decimals only when they exist.
  const body = Number.isInteger(abs) ? String(abs) : abs.toFixed(2).replace(/0$/, '')
  return `${sign}${body}R`
}

/** Common R values, offered as taps so the usual case needs no keyboard. */
export const QUICK_R = [1, 1.5, 2, 3, 4, 5]
