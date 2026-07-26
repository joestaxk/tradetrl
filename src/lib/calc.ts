/**
 * Inline PnL / R-multiple calculator (§4).
 *
 * Only ever *offers* a number — it never overwrites what the trader typed.
 * Every function returns `null` rather than a guess when inputs are missing,
 * because a wrong-but-confident number in a journal is worse than no number.
 */

import type { Direction, Outcome } from './types'

/** Contract size per 1.00 lot, by instrument class. */
const STANDARD_LOT = 100_000
const XAU_LOT = 100 // 100 oz per standard gold lot
const INDEX_LOT = 1

export type Instrument = 'fx' | 'fx-jpy' | 'metal' | 'index' | 'crypto'

export function classifyPair(pair: string): Instrument {
  // Digits are load-bearing here — US30 and US100 are index symbols.
  const p = pair.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (p.startsWith('XAU') || p.startsWith('XAG')) return 'metal'
  if (/^(US30|US100|NAS|SPX|GER|UK100|JP225|DE40|NDX|DJI)/.test(p)) return 'index'
  if (/^(BTC|ETH|SOL|XRP|DOGE)/.test(p)) return 'crypto'
  if (p.endsWith('JPY')) return 'fx-jpy'
  return 'fx'
}

/** Value of one whole point of price movement, per 1.00 lot. */
export function contractSize(pair: string): number {
  switch (classifyPair(pair)) {
    case 'metal':
      return XAU_LOT
    case 'index':
    case 'crypto':
      return INDEX_LOT
    default:
      return STANDARD_LOT
  }
}

/** Decimal places a pair's price is quoted to — drives display, not math. */
export function pairPrecision(pair: string): number {
  switch (classifyPair(pair)) {
    case 'fx-jpy':
      return 3
    case 'metal':
      return 2
    case 'index':
      return 2
    case 'crypto':
      return 2
    default:
      return 5
  }
}

export interface PnlInputs {
  pair: string
  direction: Direction
  entryPrice?: number
  exitPrice?: number
  lotSize?: number
}

/**
 * Gross PnL in account currency. Assumes the quote currency is the account
 * currency (true for the overwhelming majority of USD accounts trading
 * XXX/USD and metals) — a deliberate simplification over shipping an FX
 * conversion table the trader would have to maintain.
 */
export function computePnl({
  pair,
  direction,
  entryPrice,
  exitPrice,
  lotSize,
}: PnlInputs): number | null {
  if (!isNum(entryPrice) || !isNum(exitPrice) || !isNum(lotSize)) return null
  if (lotSize <= 0) return null
  const move = direction === 'buy' ? exitPrice - entryPrice : entryPrice - exitPrice
  return round2(move * contractSize(pair) * lotSize)
}

export interface RiskInputs {
  pair: string
  direction: Direction
  entryPrice?: number
  stopPrice?: number
  lotSize?: number
}

/** Money at risk if the stop is hit. */
export function computeRiskAmount({
  pair,
  direction,
  entryPrice,
  stopPrice,
  lotSize,
}: RiskInputs): number | null {
  if (!isNum(entryPrice) || !isNum(stopPrice) || !isNum(lotSize)) return null
  if (lotSize <= 0) return null
  // A stop on the wrong side of entry isn't risk — it's a typo. Say nothing.
  const distance =
    direction === 'buy' ? entryPrice - stopPrice : stopPrice - entryPrice
  if (distance <= 0) return null
  return round2(distance * contractSize(pair) * lotSize)
}

/**
 * R-multiple: realised PnL expressed in units of the risk taken.
 * Prefers an explicit riskAmount, falls back to deriving it from the stop.
 */
export function computeR(
  pnl: number | null | undefined,
  riskAmount: number | null | undefined,
): number | null {
  if (!isNum(pnl) || !isNum(riskAmount) || riskAmount <= 0) return null
  return round2(pnl / riskAmount)
}

export function riskPctOf(
  riskAmount: number | null | undefined,
  accountSize: number | null | undefined,
): number | null {
  if (!isNum(riskAmount) || !isNum(accountSize) || accountSize <= 0) return null
  return round2((riskAmount / accountSize) * 100)
}

/** Outcome is derived from PnL, never asked twice. Exact zero is flat. */
export function outcomeOf(pnl: number): Outcome {
  if (pnl > 0) return 'win'
  if (pnl < 0) return 'loss'
  return 'flat'
}

/**
 * One pass over every derivable figure, given whatever the trader has typed
 * so far. Used live in the entry form and again at save time.
 */
export interface DerivedFigures {
  pnl: number | null
  riskAmount: number | null
  riskPct: number | null
  rMultiple: number | null
  outcome: Outcome | null
}

export function derive(input: {
  pair: string
  direction: Direction
  entryPrice?: number
  exitPrice?: number
  stopPrice?: number
  lotSize?: number
  pnl?: number
  riskAmount?: number
  accountSize?: number
}): DerivedFigures {
  const computedPnl = computePnl(input)
  // What the trader typed always wins over what we inferred.
  const pnl = isNum(input.pnl) ? input.pnl : computedPnl

  const derivedRisk = computeRiskAmount(input)
  const riskAmount = isNum(input.riskAmount) ? input.riskAmount : derivedRisk

  return {
    pnl,
    riskAmount,
    riskPct: riskPctOf(riskAmount, input.accountSize),
    rMultiple: computeR(pnl, riskAmount),
    outcome: isNum(pnl) ? outcomeOf(pnl) : null,
  }
}

// ---------------------------------------------------------------------------

export function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Signed money, tabular-safe. `+1,240.50` / `−320.00` (true minus sign). */
export function formatMoney(
  n: number,
  opts: { currency?: string; signed?: boolean; compact?: boolean } = {},
): string {
  const { currency = 'USD', signed = true, compact = false } = opts
  const abs = Math.abs(n)
  const body = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    notation: compact && abs >= 10_000 ? 'compact' : 'standard',
    minimumFractionDigits: compact && abs >= 10_000 ? 0 : 2,
    maximumFractionDigits: compact && abs >= 10_000 ? 1 : 2,
  }).format(abs)
  if (!signed) return body
  if (n > 0) return `+${body}`
  if (n < 0) return `−${body}`
  return body
}

/**
 * The currency's symbol on its own — '$', '£', 'ZAR'.
 *
 * Intl gives no direct accessor, so it is recovered by formatting zero and
 * stripping the digits. Cached because a calendar renders 42 cells and this
 * would otherwise construct a formatter for every one of them.
 */
const symbolCache = new Map<string, string>()

export function currencySymbol(currency = 'USD'): string {
  const hit = symbolCache.get(currency)
  if (hit !== undefined) return hit
  let symbol = currency
  try {
    symbol = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
      .format(0)
      .replace(/[\d\s,.]/g, '')
  } catch {
    // An unknown code is better shown as itself than as nothing.
  }
  symbolCache.set(currency, symbol)
  return symbol
}

/**
 * The tightest readable money figure, for a calendar cell at 320px.
 * '+$1.2k' / '−$260' — signed, symboled, and never more than six characters.
 */
export function formatMoneyMicro(n: number, currency = 'USD'): string {
  const sign = n > 0 ? '+' : n < 0 ? '−' : ''
  const sym = currencySymbol(currency)
  const abs = Math.abs(n)
  if (abs >= 1000) {
    const k = abs / 1000
    return `${sign}${sym}${k >= 10 ? Math.round(k) : k.toFixed(1)}k`
  }
  return `${sign}${sym}${Math.round(abs)}`
}

export function formatR(n: number): string {
  const s = n > 0 ? '+' : n < 0 ? '−' : ''
  return `${s}${Math.abs(n).toFixed(2)}R`
}

export function formatPct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`
}
