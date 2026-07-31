import { Check, Layers } from 'lucide-react'
import { Badge } from '#/components/ui/primitives'
import { compactAmount } from '#/lib/journals'
import type { ResolvedJournal } from '#/lib/types'
import { cn } from '#/components/ui/cn'

/**
 * "I took this on more than one account."
 *
 * Only rendered when there is genuinely a choice — a single-account trader
 * never sees it, because a control with one option is noise.
 *
 * The copy carries real weight here. Without it this looks like a way to
 * duplicate a row, and a trader would reasonably assume the same numbers get
 * copied across. What actually happens is that the *percentage* is held
 * constant and the money is recalculated per account, which is the only
 * version that keeps each account's statistics honest.
 */
export function AccountMultiSelect({
  accounts,
  sourceId,
  selected,
  onChange,
  summary,
  className,
}: {
  accounts: ResolvedJournal[]
  sourceId: string
  selected: string[]
  onChange: (ids: string[]) => void
  summary: string
  className?: string
}) {
  if (accounts.length <= 1) return null

  const toggle = (id: string) => {
    // The account being filled in is always part of it — unticking it would
    // mean logging a trade nowhere.
    if (id === sourceId) return
    onChange(
      selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id],
    )
  }

  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      <div className="flex items-center gap-2">
        <Layers className="size-3.5 shrink-0 text-ink-faint" aria-hidden />
        <span className="text-[13px] font-medium text-ink-dim">
          Took this on more than one account?
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        {accounts.map((a) => {
          const on = selected.includes(a.id)
          const isSource = a.id === sourceId
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => toggle(a.id)}
              aria-pressed={on}
              disabled={isSource}
              className={cn(
                'flex min-h-11 items-center gap-2.5 rounded-lg border px-3 text-left',
                'transition-colors duration-150',
                on
                  ? 'border-accent-edge bg-accent-wash'
                  : 'border-line bg-raised hover:border-line-strong',
                isSource && 'cursor-default',
              )}
            >
              <span
                style={{ width: 18, height: 18, minWidth: 18, flex: '0 0 auto' }}
                className={cn(
                  'inline-flex items-center justify-center rounded-[6px] border',
                  on ? 'border-accent bg-accent' : 'border-line-strong',
                )}
              >
                {on && <Check className="size-3 text-void" strokeWidth={3} aria-hidden />}
              </span>

              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13px] text-ink">{a.name}</span>
                {typeof a.startingBalance === 'number' && a.startingBalance > 0 && (
                  <span className="truncate text-[11px] text-ink-faint tnum">
                    {compactAmount(a.startingBalance, a.currency)}
                  </span>
                )}
              </span>

              {isSource && (
                <Badge tone="neutral" className="shrink-0">
                  this one
                </Badge>
              )}
            </button>
          )
        })}
      </div>

      {/*
        The explanation, not a footnote. A trader who thinks this copies the
        same dollar figures will misread every account's risk afterwards.
      */}
      <p className="text-xs leading-relaxed text-ink-muted">
        Your risk <span className="text-ink-dim">percentage</span> stays the same on each
        one — the money and lot size are worked out from each account's own balance. So 1%
        on a 50k and 1% on a 100k become different sizes, as they should.
      </p>

      {summary && (
        <p className="rounded-lg border border-line bg-raised px-3 py-2 text-[12px] text-ink-dim tnum">
          {summary}
        </p>
      )}
    </div>
  )
}
