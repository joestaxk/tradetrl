import { Check, Plus } from 'lucide-react'
import type { Strategy } from '#/lib/types'
import { cn } from '#/components/ui/cn'

/**
 * Which setup was this?
 *
 * Deliberately a row of taps rather than a dropdown. The whole point of naming
 * strategies is that attributing a trade should cost nothing — a select that
 * has to be opened, scrolled and closed is exactly the friction that stops
 * people doing it by week three.
 */
export function StrategyPicker({
  strategies,
  value,
  onChange,
  plannedIds,
  onCreate,
}: {
  strategies: Strategy[]
  value: string | undefined
  onChange: (id: string | undefined) => void
  /** Strategies named in this period's plan, marked so deviation is visible. */
  plannedIds?: string[]
  onCreate?: () => void
}) {
  if (strategies.length === 0) {
    return (
      <button
        type="button"
        onClick={onCreate}
        className={cn(
          'flex min-h-11 w-full items-center justify-center gap-2 rounded-xl',
          'border border-dashed border-line px-3 text-[13px] text-ink-dim',
          'transition-colors duration-150 hover:border-accent-edge hover:text-ink',
        )}
      >
        <Plus className="size-3.5" aria-hidden />
        Name your first strategy
      </button>
    )
  }

  const planned = new Set(plannedIds ?? [])
  const offPlan = value !== undefined && planned.size > 0 && !planned.has(value)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {strategies.map((s) => {
          const active = value === s.id
          const inPlan = planned.has(s.id)
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onChange(active ? undefined : s.id)}
              className={cn(
                'inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[13px]',
                'transition-colors duration-150',
                active
                  ? 'border-accent bg-accent-wash text-ink'
                  : 'border-line bg-raised text-ink-dim hover:border-line-strong hover:text-ink',
              )}
            >
              {active && <Check className="size-3.5 text-accent" aria-hidden />}
              {s.name}
              {/*
                A quiet dot, not a warning. Trading something you didn't plan is
                allowed — it is simply recorded.
              */}
              {planned.size > 0 && !inPlan && (
                <span className="size-1 rounded-full bg-ink-faint" aria-hidden />
              )}
            </button>
          )
        })}
        {onCreate && (
          <button
            type="button"
            onClick={onCreate}
            className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-dashed border-line px-2.5 text-[13px] text-ink-faint transition-colors hover:border-line-strong hover:text-ink-dim"
          >
            <Plus className="size-3.5" aria-hidden />
            New
          </button>
        )}
      </div>

      {offPlan && (
        <p className="text-xs leading-relaxed text-ink-muted">
          Not one of this period's planned strategies. It saves either way — your
          review will note it, win or lose.
        </p>
      )}
    </div>
  )
}
