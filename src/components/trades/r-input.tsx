import { Info } from 'lucide-react'
import { NumberInput } from '#/components/ui/field'
import { formatMoney } from '#/lib/calc'
import { DEFAULT_LOSS_R, QUICK_R } from '#/lib/rr'
import type { Outcome } from '#/lib/types'
import { cn } from '#/components/ui/cn'

/**
 * How much, expressed in R.
 *
 * The old minimal form asked for a money amount, which is the least useful
 * number a trader can give: $240 means nothing without knowing what was risked
 * to make it. R costs the same single tap and is comparable across pairs,
 * account sizes and time — which is what makes expectancy computable at all.
 *
 * A loss defaults to −1R and needs no input whatsoever, because a stop that
 * gets hit loses exactly what was risked. It stays editable, since stops slip
 * and get moved, and a journal that can't record a −3R disaster is hiding the
 * single most useful entry in the book.
 */
export function RInput({
  outcome,
  value,
  onChange,
  riskAmount,
  currency,
  id,
}: {
  outcome: Outcome
  /** R magnitude as a string, unsigned. Empty means "not stated". */
  value: string
  onChange: (next: string) => void
  /** What one R is worth on this account, if known. */
  riskAmount: number | null
  currency: string
  id?: string
}) {
  if (outcome === 'flat') return null

  const isLoss = outcome === 'loss'
  const parsed = Number.parseFloat(value)
  const effective = Number.isFinite(parsed) && parsed > 0 ? parsed : isLoss ? DEFAULT_LOSS_R : null
  const assumed = isLoss && !(Number.isFinite(parsed) && parsed > 0)
  const money =
    effective !== null && riskAmount !== null
      ? (isLoss ? -1 : 1) * effective * riskAmount
      : null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {QUICK_R.map((r) => {
          const active = Number.isFinite(parsed) && parsed === r
          return (
            <button
              key={r}
              type="button"
              onClick={() => onChange(active ? '' : String(r))}
              className={cn(
                'h-9 min-w-11 rounded-lg border px-2.5 text-[13px] font-medium tnum',
                'transition-colors duration-150',
                active
                  ? isLoss
                    ? 'border-loss-edge bg-loss-wash text-loss-bright'
                    : 'border-win-edge bg-win-wash text-win-bright'
                  : 'border-line bg-raised text-ink-dim hover:border-line-strong hover:text-ink',
              )}
            >
              {isLoss ? '−' : '+'}
              {r}R
            </button>
          )
        })}
      </div>

      <NumberInput
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        affix="R"
        placeholder={isLoss ? String(DEFAULT_LOSS_R) : '2'}
      />

      {/*
        The money is shown, never asked for. It follows from R and the account,
        so typing it would be a second chance to contradict yourself.
      */}
      <p className="flex items-start gap-1.5 text-xs leading-relaxed text-ink-muted">
        <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
        {money !== null ? (
          <span>
            That's{' '}
            <span className={cn('tnum', isLoss ? 'text-loss-bright' : 'text-win-bright')}>
              {formatMoney(money, { currency })}
            </span>{' '}
            at {formatMoney(riskAmount!, { currency, signed: false })} per R.
            {assumed && ' A stop that gets hit loses exactly 1R — change it if yours slipped.'}
          </span>
        ) : riskAmount === null ? (
          <span>
            Set this account's balance and risk rule and we'll turn R into money for
            you.
          </span>
        ) : (
          <span>Pick how many R this made.</span>
        )}
      </p>
    </div>
  )
}
