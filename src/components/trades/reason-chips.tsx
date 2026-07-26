import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  REASON_GROUPS,
  REASON_GROUP_LABEL,
  reasonsFor,
  type ReasonGroup,
} from '#/lib/reasons'
import type { Outcome } from '#/lib/types'
import { cn } from '#/components/ui/cn'

/**
 * What happened, in taps.
 *
 * Shows only the groups that fit the outcome, and only the first two expanded
 * — a wall of thirty chips is its own kind of friction. Two taps gets the
 * common case ("bias was wrong", "chased it") and everything else is one
 * disclosure away.
 */
export function ReasonChips({
  outcome,
  value,
  onChange,
}: {
  outcome: Outcome
  value: string[]
  onChange: (next: string[]) => void
}) {
  const options = useMemo(() => reasonsFor(outcome), [outcome])
  const [showAll, setShowAll] = useState(false)

  const grouped = useMemo(() => {
    const map = new Map<ReasonGroup, typeof options>()
    for (const g of REASON_GROUPS) {
      const rows = options.filter((o) => o.group === g)
      if (rows.length > 0) map.set(g, rows)
    }
    return map
  }, [options])

  // A loss opens on the read and the entry — the two links that break most —
  // and a win opens on what actually went right.
  const primary: ReasonGroup[] =
    outcome === 'win' ? ['good', 'target'] : ['context', 'entry']

  const visible = showAll ? [...grouped.keys()] : [...grouped.keys()].filter((g) => primary.includes(g))

  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])

  const hiddenCount = options.length - visible.reduce((n, g) => n + (grouped.get(g)?.length ?? 0), 0)

  return (
    <div className="flex flex-col gap-3">
      {visible.map((group) => (
        <div key={group} className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">
            {REASON_GROUP_LABEL[group]}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {grouped.get(group)!.map((opt) => {
              const on = value.includes(opt.id)
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => toggle(opt.id)}
                  aria-pressed={on}
                  className={cn(
                    'inline-flex min-h-9 items-center rounded-lg border px-2.5 text-[13px]',
                    'transition-colors duration-150',
                    on
                      ? group === 'good'
                        ? 'border-win-edge bg-win-wash text-win-bright'
                        : 'border-accent bg-accent-wash text-ink'
                      : 'border-line bg-raised text-ink-dim hover:border-line-strong hover:text-ink',
                  )}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {!showAll && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="flex min-h-9 items-center gap-1.5 self-start text-[13px] text-accent-bright transition-colors hover:text-accent"
        >
          <ChevronDown className="size-3.5" aria-hidden />
          {hiddenCount} more
        </button>
      )}
    </div>
  )
}
