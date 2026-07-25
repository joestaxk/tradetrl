/**
 * Live risk / lot-size calculator.
 *
 *   Risk Amount = |Entry − Stop| × pip/point value per lot × Lot Size
 *   Lot Size    = Risk Amount ÷ (Stop distance × pip/point value per lot)
 *
 * The whole module is pure and synchronous. The one thing that isn't — the FX
 * rate needed when the quote currency differs from the account currency — is
 * passed in as a plain number, so the maths never waits on a network call and
 * a stale rate degrades the readout rather than blocking it.
 *
 * Every function returns `null` instead of a partial guess. A confidently
 * wrong risk figure is worse than a blank one.
 */

import { isNum, round2 } from './calc'
import { findInstrument, type Currency, type Instrument } from './instruments'

export type CalcMode = 'curated' | 'manual'

/**
 * Where the conversion rate came from.
 *  - 'none'     no conversion was needed
 *  - 'derived'  computed exactly from the pair's own price (no network)
 *  - 'fetched'  a live/cached FX rate was applied
 */
export type RateSource = 'none' | 'derived' | 'fetched'

export interface RiskInput {
  pair: string
  entryPrice?: number
  stopPrice?: number
  lotSize?: number
  /** Account currency, from settings. */
  accountCurrency?: string
  accountSize?: number
  /**
   * Quote → account rate, e.g. 0.92 for JPY→? No: for a EURGBP pair on a USD
   * account this is the GBP→USD rate. 1 when the currencies match.
   */
  fxRate?: number
  /** Manual mode only: value of a 1-pip move per lot, in account currency. */
  manualPipValue?: number
}

export interface RiskResult {
  /** Echoed back so the UI can tell 'not chosen yet' from 'uncurated'. */
  pair: string
  mode: CalcMode
  instrument: Instrument | null
  /**
   * Value of a one-pip/point move per 1.00 lot, in the ACCOUNT currency.
   * Deliberately UNROUNDED: XRPUSD's pip value is 0.0001, which round2 would
   * flatten to zero and silently zero the risk. Rounding happens at display.
   */
  pipValuePerLot: number | null
  /** Stop distance expressed in pips/points. */
  stopDistancePips: number | null
  /** Money at risk if the stop is hit, in the account currency. */
  riskAmount: number | null
  /** Risk as a share of account size. */
  riskPct: number | null
  /** True when a conversion was applied and the rate is doing real work. */
  needsConversion: boolean
  /** Set when we could not convert and the figure is therefore unavailable. */
  missingRate: boolean
  rateSource: RateSource
  /**
   * Snapshot for the trade document (§7): the exact per-lot value used, so a
   * later change to a contract-size default never silently rewrites history.
   */
  pipValueUsed: number | null
}

const EMPTY: RiskResult = {
  pair: '',
  mode: 'manual',
  instrument: null,
  pipValuePerLot: null,
  stopDistancePips: null,
  riskAmount: null,
  riskPct: null,
  needsConversion: false,
  missingRate: false,
  rateSource: 'none',
  pipValueUsed: null,
}

/**
 * Value of a one-pip move per standard lot, in the instrument's QUOTE
 * currency. For forex this is pipSize × contractSize (0.0001 × 100,000 = $10).
 * For metals and crypto the same formula holds with their own conventions.
 */
export function pipValueInQuoteCurrency(instrument: Instrument): number {
  return instrument.pipSize * instrument.contractSize
}

export function computeRisk(input: RiskInput): RiskResult {
  const instrument = findInstrument(input.pair)
  const mode: CalcMode = instrument ? 'curated' : 'manual'

  const accountCurrency = (input.accountCurrency ?? 'USD').toUpperCase()
  let pipValuePerLot: number | null = null
  let needsConversion = false
  let missingRate = false

  let rateSource: RateSource = 'none'

  if (instrument) {
    const quote = pipValueInQuoteCurrency(instrument)

    if (instrument.quoteCurrency === accountCurrency) {
      // The common case for a USD account trading XXXUSD — no rate needed.
      pipValuePerLot = quote
      rateSource = 'none'
    } else if (
      // When the account currency is the pair's BASE, the conversion rate is
      // simply 1 / price — USDJPY on a USD account, GBPUSD on a GBP account.
      // Deriving it here is exact, instant, needs no network call and cannot
      // go stale, so it is always preferred over a fetched rate.
      instrument.baseCurrency === accountCurrency &&
      isNum(input.entryPrice) &&
      input.entryPrice > 0
    ) {
      pipValuePerLot = quote / input.entryPrice
      needsConversion = true
      rateSource = 'derived'
    } else {
      needsConversion = true
      if (isNum(input.fxRate) && input.fxRate > 0) {
        pipValuePerLot = quote * input.fxRate
        rateSource = 'fetched'
      } else {
        missingRate = true
      }
    }
  } else if (isNum(input.manualPipValue) && input.manualPipValue > 0) {
    // Manual mode: the trader states the value per lot already in their own
    // account currency, so there is nothing left to convert.
    pipValuePerLot = input.manualPipValue
  }

  const stopDistancePips = stopDistance(input, instrument)

  let riskAmount: number | null = null
  if (
    pipValuePerLot !== null &&
    stopDistancePips !== null &&
    isNum(input.lotSize) &&
    input.lotSize > 0
  ) {
    riskAmount = round2(stopDistancePips * pipValuePerLot * input.lotSize)
  }

  return {
    ...EMPTY,
    pair: input.pair,
    mode,
    instrument,
    pipValuePerLot,
    stopDistancePips,
    riskAmount,
    riskPct:
      riskAmount !== null && isNum(input.accountSize) && input.accountSize > 0
        ? round2((riskAmount / input.accountSize) * 100)
        : null,
    needsConversion,
    missingRate,
    rateSource,
    // Full precision snapshot — this is stored on the trade for auditability,
    // so it must reproduce the risk figure exactly, not approximately.
    pipValueUsed: pipValuePerLot,
  }
}

/**
 * Stop distance in pips/points. Direction-agnostic on purpose — a trader
 * flipping between buy and sell should see the same risk for the same levels.
 */
export function stopDistance(
  input: Pick<RiskInput, 'entryPrice' | 'stopPrice'>,
  instrument: Instrument | null,
): number | null {
  if (!isNum(input.entryPrice) || !isNum(input.stopPrice)) return null
  const raw = Math.abs(input.entryPrice - input.stopPrice)
  if (raw <= 0) return null
  const pipSize = instrument?.pipSize ?? 1
  // Rounded to avoid 19.999999999 pips from float subtraction of prices.
  return Math.round((raw / pipSize) * 1e6) / 1e6
}

/**
 * The inverse: given the money a trader is willing to lose, what size should
 * they take? Rounded DOWN to the nearest 0.01 lot so the suggestion never
 * exceeds the risk they asked for.
 */
export function suggestLotSize(
  input: Omit<RiskInput, 'lotSize'> & { riskBudget?: number },
): number | null {
  const { riskBudget } = input
  if (!isNum(riskBudget) || riskBudget <= 0) return null

  const probe = computeRisk({ ...input, lotSize: 1 })
  if (probe.pipValuePerLot === null || probe.stopDistancePips === null) return null

  const perLot = probe.stopDistancePips * probe.pipValuePerLot
  if (perLot <= 0) return null

  const lots = Math.floor((riskBudget / perLot) * 100) / 100
  return lots > 0 ? lots : null
}

/** Risk budget implied by a max-risk-% rule. */
export function riskBudgetFrom(
  accountSize: number | undefined,
  maxRiskPct: number | undefined,
): number | null {
  if (!isNum(accountSize) || !isNum(maxRiskPct)) return null
  if (accountSize <= 0 || maxRiskPct <= 0) return null
  return round2((accountSize * maxRiskPct) / 100)
}

/**
 * §6 — observe, never gate. The readout changes tone once risk crosses the
 * trader's own stated limit; it never disables anything.
 */
export type RiskTone = 'neutral' | 'within' | 'over'

export function riskTone(
  riskPct: number | null,
  maxRiskPct: number | undefined,
): RiskTone {
  if (riskPct === null || !isNum(maxRiskPct) || maxRiskPct <= 0) return 'neutral'
  // Same float tolerance as the violation engine, so the readout and the
  // stored violation can never disagree about a borderline trade.
  return riskPct - maxRiskPct > 1e-9 ? 'over' : 'within'
}

/**
 * Which currency pair the rate lookup needs, or null when none is required.
 * Always expressed as { from: quote currency, to: account currency }.
 */
export function conversionNeeded(
  pair: string,
  accountCurrency = 'USD',
): { from: Currency; to: string } | null {
  const instrument = findInstrument(pair)
  if (!instrument) return null
  const to = accountCurrency.toUpperCase()
  if (instrument.quoteCurrency === to) return null
  return { from: instrument.quoteCurrency, to }
}

/** Pips are shown whole for FX, with decimals for point-quoted instruments. */
export function formatPips(pips: number | null, instrument: Instrument | null): string {
  if (pips === null) return '—'
  const unit = instrument?.class === 'forex' ? 'pips' : 'pts'
  const value = pips >= 100 ? Math.round(pips) : Math.round(pips * 10) / 10
  return `${value.toLocaleString('en-US')} ${unit}`
}
