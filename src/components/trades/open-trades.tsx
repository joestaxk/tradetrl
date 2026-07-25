import { ChevronRight, Hourglass } from 'lucide-react'
import { Badge } from '#/components/ui/primitives'
import { openOnly, sortChronological } from '#/lib/aggregate'
import { shortDayLabel } from '#/lib/dates'
import type { Trade } from '#/lib/types'
import { cn } from '#/components/ui/cn'

/**
 * The "still waiting" strip.
 *
 * A quiet count with a one-tap resolve, shown only when there is something to
 * show. Deliberately not a badge on the nav, not a notification, not a nag —
 * §0 says we observe. Forgetting to resolve a trade is the trader's business;
 * making it effortless to remember is ours.
 */
export function OpenTrades({
  trades,
  onResolve,
  className,
}: {
  trades: Trade[]
  onResolve: (trade: Trade) => void
  className?: string
}) {
  const open = sortChronological(openOnly(trades)).reverse()
  if (open.length === 0) return null

  return (
    <section
      className={cn('rounded-xl border border-line bg-panel', className)}
      aria-label="Trades still open"
    >
      <header className="flex items-center gap-2 px-3.5 pt-3">
        <Hourglass className="size-3.5 shrink-0 text-ink-faint" aria-hidden />
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">
          Still open
        </h2>
        <Badge tone="neutral" className="ml-auto tnum">
          {open.length}
        </Badge>
      </header>

      <ul className="flex flex-col p-1.5">
        {open.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onResolve(t)}
              className={cn(
                'group flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 text-left',
                'transition-colors duration-150 hover:bg-raised',
              )}
            >
              <span
                className="size-1.5 shrink-0 rounded-full bg-accent ring-2 ring-accent-wash"
                aria-hidden
              />

              {/*
                The pair is the one thing that must never truncate — "G." tells
                a trader nothing. It keeps its intrinsic width and the
                timestamp, which is the least important part, wraps beneath at
                narrow widths instead.
              */}
              <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
                <span className="flex items-center gap-2">
                  <span className="shrink-0 text-[13px] font-medium text-ink">
                    {t.pair.toUpperCase()}
                  </span>
                  <Badge tone="neutral" className="shrink-0 uppercase">
                    {t.direction}
                  </Badge>
                </span>
                <span className="truncate text-[11px] text-ink-faint tnum sm:ml-auto">
                  {shortDayLabel(t.date)}
                  {t.time ? ` · ${t.time}` : ''}
                </span>
              </span>

              <span className="hidden shrink-0 text-[12px] text-accent-bright opacity-0 transition-opacity duration-150 group-hover:opacity-100 sm:inline">
                Resolve
              </span>
              <ChevronRight
                className="size-3.5 shrink-0 text-ink-faint transition-transform duration-150 group-hover:translate-x-0.5"
                aria-hidden
              />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
