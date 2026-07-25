import { AlertTriangle, Info, Wand2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Tip } from '#/components/ui/overlays'
import { useCountUp } from '#/components/ui/numbers'
import { formatMoney } from '#/lib/calc'
import { formatPips, riskTone, type RiskResult } from '#/lib/risk'
import { formatRateAge } from '#/lib/use-fx-rate'
import { cn } from '#/components/ui/cn'

/**
 * The live risk readout (§0, §8).
 *
 * This is the loudest thing in the entry form on purpose — it is the single
 * number that decides whether a trade is survivable. It recomputes on every
 * keystroke and counts up rather than snapping, so it reads as alive.
 *
 * §6: crossing the trader's own limit changes tone and nothing else. Nothing
 * here disables, blocks or warns twice. They can still save at any risk.
 */

interface Props {
  result: RiskResult
  currency?: string
  maxRiskPct?: number
  /** Lot size the risk budget implies, offered as a one-tap fill. */
  suggestedLots?: number | null
  onUseSuggested?: (lots: number) => void
  rateFetchedAt?: number | null
  rateStale?: boolean
  className?: string
}

export function RiskReadout({
  result,
  currency = 'USD',
  maxRiskPct,
  suggestedLots,
  onUseSuggested,
  rateFetchedAt,
  rateStale,
  className,
}: Props) {
  const tone = riskTone(result.riskPct, maxRiskPct)
  const has = result.riskAmount !== null
  // Count from the previous value so an edit tweens instead of restarting.
  const shown = useCountUp(result.riskAmount ?? 0, 420)

  return (
    <section
      aria-label="Risk on this trade"
      className={cn(
        'rounded-xl border px-3.5 py-3 transition-colors duration-300 ease-[var(--ease-out-quint)]',
        tone === 'over'
          ? 'border-caution/40 bg-caution-wash'
          : has
            ? 'border-accent-edge bg-accent-wash'
            : 'border-dashed border-line bg-transparent',
        className,
      )}
    >
      {has ? (
        <>
          <p className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">
            You're risking
          </p>

          {/*
            The figure wraps onto its own line rather than shrinking, so at
            320px it never truncates — §8 is explicit about this one.
          */}
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span
              className={cn(
                'font-display text-[30px] leading-none tnum sm:text-4xl',
                tone === 'over' ? 'text-caution' : 'text-ink',
              )}
              aria-label={formatMoney(result.riskAmount!, { currency, signed: false })}
            >
              <span aria-hidden>
                {formatMoney(shown, { currency, signed: false })}
              </span>
            </span>
            {result.riskPct !== null && (
              <span
                className={cn(
                  'text-[15px] font-medium tnum',
                  tone === 'over' ? 'text-caution' : 'text-ink-dim',
                )}
              >
                {result.riskPct.toFixed(2)}% of your account
              </span>
            )}
          </p>

          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-muted">
            <span className="tnum">
              {formatPips(result.stopDistancePips, result.instrument)} stop
            </span>
            {result.pipValuePerLot !== null && (
              <span className="tnum">
                {formatMoney(result.pipValuePerLot, { currency, signed: false })} per{' '}
                {result.instrument?.class === 'forex' ? 'pip' : 'point'} per lot
              </span>
            )}
            {result.mode === 'manual' && (
              <span className="text-ink-faint">your value</span>
            )}
            {result.rateSource === 'derived' && (
              <Tip label="Converted from this pair's own price, so it is exact and needs no rate lookup.">
                <span className="cursor-help text-ink-faint underline decoration-dotted underline-offset-2">
                  converted from price
                </span>
              </Tip>
            )}
            {result.rateSource === 'fetched' && rateFetchedAt && (
              <span className={cn('text-ink-faint', rateStale && 'text-caution')}>
                {formatRateAge(rateFetchedAt)}
              </span>
            )}
          </p>

          {tone === 'over' && maxRiskPct !== undefined && (
            <p className="mt-2 flex items-start gap-2 text-[12px] leading-relaxed text-caution">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {/* Stated once, plainly. Nothing is blocked. */}
              Above the {maxRiskPct}% you set for yourself.
              {suggestedLots !== null && suggestedLots !== undefined && (
                <> {suggestedLots} lots would keep you inside it.</>
              )}
            </p>
          )}

          {suggestedLots !== null && suggestedLots !== undefined && onUseSuggested && (
            <Button
              size="sm"
              variant="ghost"
              className="mt-2 h-8 px-2 text-[12px] text-accent-bright hover:text-accent-bright"
              onClick={() => onUseSuggested(suggestedLots)}
            >
              <Wand2 aria-hidden />
              Size it to {suggestedLots} lots
            </Button>
          )}
        </>
      ) : (
        <Empty result={result} />
      )}

      {result.instrument?.contractSizeVaries && has && (
        <p className="mt-2 flex items-start gap-2 border-t border-line/60 pt-2 text-[11px] leading-relaxed text-ink-faint">
          <Info className="mt-px size-3 shrink-0" aria-hidden />
          Assumes a standard contract size — confirm against your broker.
        </p>
      )}
    </section>
  )
}

/**
 * The blank state names the *one* thing still missing rather than listing
 * requirements, so the form reads as nearly-finished instead of demanding.
 */
function Empty({ result }: { result: RiskResult }) {
  // No pair yet is not "an uncurated instrument" — saying we lack contract
  // specs before they have chosen anything reads as a broken calculator.
  if (result.pair.trim() === '') {
    return (
      <p className="text-[13px] leading-relaxed text-ink-muted">
        Pick a pair, then add an entry and a stop to see what this trade risks.
      </p>
    )
  }
  if (result.missingRate) {
    return (
      <p className="text-[13px] leading-relaxed text-ink-muted">
        Waiting on an exchange rate to convert this pair into your account
        currency. Your trade still saves without it.
      </p>
    )
  }
  if (result.mode === 'manual' && result.pipValuePerLot === null) {
    return (
      <p className="text-[13px] leading-relaxed text-ink-muted">
        We don't have contract specs for this one. Tell us what a one-point move
        is worth per lot and the risk appears here.
      </p>
    )
  }
  return (
    <p className="text-[13px] leading-relaxed text-ink-muted">
      {result.stopDistancePips === null
        ? 'Add an entry and a stop to see what this trade risks.'
        : 'Add a lot size to see what this trade risks.'}
    </p>
  )
}
