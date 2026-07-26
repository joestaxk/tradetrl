import { useState } from 'react'
import { Clock, Loader2, Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { NumberInput } from '#/components/ui/field'
import { toast } from '#/components/ui/toast'
import { formatMoney } from '#/lib/calc'
import { computeFromR, DEFAULT_LOSS_R, QUICK_R } from '#/lib/rr'
import { today } from '#/lib/dates'
import type { Outcome, Trade } from '#/lib/types'
import { cn } from '#/components/ui/cn'

/**
 * Resolve an open trade without opening the full form.
 *
 * The moment that matters is right after a position closes, usually on a phone,
 * usually while something else is happening. Two taps — Win, 2R — and it's
 * done. The close time defaults to now because that is what it almost always
 * is; the one case where it isn't gets a single link to correct it rather than
 * a field everyone has to walk past.
 */
export function QuickResolve({
  trade,
  riskAmount,
  currency,
  onResolve,
  onOpenFull,
}: {
  trade: Trade
  /** What one R is worth on this account. */
  riskAmount: number | null
  currency: string
  onResolve: (input: {
    outcome: Outcome
    rMultiple: number | null
    pnl: number | null
    closeDate: string
    closeTime: string
  }) => Promise<void>
  onOpenFull: () => void
}) {
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [r, setR] = useState('')
  const [busy, setBusy] = useState(false)
  const [closeAt, setCloseAt] = useState(() => nowParts())
  const [editingTime, setEditingTime] = useState(false)

  const parsed = Number.parseFloat(r)
  const hasR = Number.isFinite(parsed) && parsed > 0

  // A loss is complete the moment it's tapped: −1R by default, no input.
  const ready = outcome === 'loss' || outcome === 'flat' || (outcome === 'win' && hasR)

  const commit = async () => {
    if (!outcome || !ready) return
    setBusy(true)
    try {
      const result = computeFromR({
        outcome,
        r: hasR ? parsed : undefined,
        riskAmount: riskAmount ?? undefined,
      })
      await onResolve({
        outcome,
        rMultiple: result.rMultiple,
        pnl: result.pnl,
        closeDate: closeAt.date,
        closeTime: closeAt.time,
      })
      toast.success(`${trade.pair.toUpperCase()} closed`)
    } catch (e) {
      console.error('[trade] quick resolve failed:', e)
      toast.error("Couldn't close that trade", { description: 'Nothing was lost — try again.' })
    } finally {
      setBusy(false)
    }
  }

  const preview =
    outcome && riskAmount !== null
      ? computeFromR({
          outcome,
          r: hasR ? parsed : undefined,
          riskAmount,
        }).pnl
      : null

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-raised p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-ink">
          How did {trade.pair.toUpperCase()} go?
        </span>
        <button
          type="button"
          onClick={onOpenFull}
          className="text-[12px] text-ink-faint underline-offset-2 transition-colors hover:text-ink-dim hover:underline"
        >
          More detail
        </button>
      </div>

      <div className="flex gap-1.5">
        {(
          [
            { v: 'win', label: 'Win', Icon: TrendingUp, tone: 'win' },
            { v: 'loss', label: 'Loss', Icon: TrendingDown, tone: 'loss' },
            { v: 'flat', label: 'BE', Icon: Minus, tone: 'flat' },
          ] as const
        ).map(({ v, label, Icon, tone }) => {
          const active = outcome === v
          return (
            <button
              key={v}
              type="button"
              onClick={() => {
                setOutcome(active ? null : v)
                if (v !== 'win') setR('')
              }}
              className={cn(
                'inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border text-[13px] font-medium',
                'transition-colors duration-150',
                active && tone === 'win' && 'border-win bg-win-wash text-win-bright',
                active && tone === 'loss' && 'border-loss bg-loss-wash text-loss-bright',
                active && tone === 'flat' && 'border-line-strong bg-overlay text-ink',
                !active && 'border-line bg-panel text-ink-dim hover:border-line-strong hover:text-ink',
              )}
            >
              <Icon className="size-3.5" aria-hidden />
              {label}
            </button>
          )
        })}
      </div>

      {/* R only matters for a win; a loss already knows it lost 1R. */}
      {outcome === 'win' && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {QUICK_R.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setR(parsed === q ? '' : String(q))}
                className={cn(
                  'h-9 min-w-11 rounded-lg border px-2.5 text-[13px] font-medium tnum transition-colors',
                  parsed === q
                    ? 'border-win-edge bg-win-wash text-win-bright'
                    : 'border-line bg-panel text-ink-dim hover:border-line-strong hover:text-ink',
                )}
              >
                +{q}R
              </button>
            ))}
          </div>
          <NumberInput
            value={r}
            onChange={(e) => setR(e.target.value)}
            affix="R"
            placeholder="How many R?"
          />
        </div>
      )}

      {outcome === 'loss' && (
        <p className="text-xs leading-relaxed text-ink-muted">
          Counting this as −{DEFAULT_LOSS_R}R.{' '}
          <button
            type="button"
            onClick={onOpenFull}
            className="text-accent-bright underline-offset-2 hover:underline"
          >
            Lost more than you risked?
          </button>
        </p>
      )}

      {/* Close time: right by default, correctable in one tap. */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
        <Clock className="size-3.5 shrink-0 text-ink-faint" aria-hidden />
        {editingTime ? (
          <>
            <input
              type="date"
              value={closeAt.date}
              max={today()}
              onChange={(e) => setCloseAt((c) => ({ ...c, date: e.target.value }))}
              className="h-9 rounded-lg border border-line bg-panel px-2 text-[13px] text-ink"
            />
            <input
              type="time"
              value={closeAt.time}
              onChange={(e) => setCloseAt((c) => ({ ...c, time: e.target.value }))}
              className="h-9 rounded-lg border border-line bg-panel px-2 text-[13px] text-ink"
            />
          </>
        ) : (
          <>
            <span>Closed just now</span>
            <button
              type="button"
              onClick={() => setEditingTime(true)}
              className="text-accent-bright underline-offset-2 hover:underline"
            >
              Not now?
            </button>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={commit}
          disabled={!ready || busy}
          className="flex-1"
        >
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          {outcome ? 'Close it' : 'Pick a result'}
        </Button>
        {preview !== null && (
          <span
            className={cn(
              'shrink-0 text-[13px] font-medium tnum',
              preview > 0 ? 'text-win-bright' : preview < 0 ? 'text-loss-bright' : 'text-ink-dim',
            )}
          >
            {formatMoney(preview, { currency })}
          </span>
        )}
      </div>
    </div>
  )
}

function nowParts(d: Date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}
