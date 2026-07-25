import { useMemo } from 'react'
import { ChevronRight } from 'lucide-react'
import { Money } from '#/components/ui/numbers'
import { Badge, EmptyState } from '#/components/ui/primitives'
import { Button } from '#/components/ui/button'
import { NotebookPen, Plus } from 'lucide-react'
import {
  addDays,
  longDayLabel,
  startOfWeek,
  today,
  weekdayLabel,
} from '#/lib/dates'
import { sortChronological } from '#/lib/aggregate'
import type { DaySummary } from '#/lib/aggregate'
import { cn } from '#/components/ui/cn'

/**
 * The text view (§7).
 *
 * Same data, same day-detail modal on tap — this is a rendering choice, not a
 * separate feature. Grouped under relative headings ("This week", "Last week")
 * because that is how a trader actually thinks about recent history.
 */

interface Props {
  byDay: Map<string, DaySummary>
  currency?: string
  onSelectDay: (day: string) => void
  onNewTrade: () => void
}

interface Group {
  label: string
  days: DaySummary[]
}

export function ListView({ byDay, currency = 'USD', onSelectDay, onNewTrade }: Props) {
  const groups = useMemo(() => groupDays(byDay), [byDay])

  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-panel">
        <EmptyState
          icon={<NotebookPen aria-hidden />}
          title="Nothing logged yet"
          body="Your first trade takes about ten seconds. Pair, win or loss, amount — that's the whole thing."
          action={
            <Button variant="primary" onClick={onNewTrade}>
              <Plus aria-hidden />
              Log your first trade
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group, gi) => (
        <section key={group.label}>
          <h2 className="mb-2 px-1 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint">
            {group.label}
          </h2>
          <div className="flex flex-col gap-1.5">
            {group.days.map((day, di) => (
              <DayRow
                key={day.date}
                day={day}
                currency={currency}
                index={gi * 4 + di}
                onSelect={onSelectDay}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function DayRow({
  day,
  currency,
  index,
  onSelect,
}: {
  day: DaySummary
  currency: string
  index: number
  onSelect: (day: string) => void
}) {
  const { stats } = day
  const trades = sortChronological(day.trades)

  return (
    <button
      type="button"
      onClick={() => onSelect(day.date)}
      className={cn(
        'stagger group w-full overflow-hidden rounded-xl border bg-panel text-left',
        'transition-[border-color,background-color] duration-200 ease-[var(--ease-out-quint)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        day.outcome === 'win' && 'border-win-edge hover:border-win/60',
        day.outcome === 'loss' && 'border-loss-edge hover:border-loss/60',
        day.outcome === 'flat' && 'border-line hover:border-line-strong',
      )}
      style={{ '--i': Math.min(index, 16) } as React.CSSProperties}
    >
      <div className="flex min-h-11 items-center gap-3 px-3.5 py-3">
        {/* Colour bar carries the day's result; the signed number repeats it,
            so outcome is never encoded by colour alone. */}
        <span
          className={cn(
            'h-8 w-1 shrink-0 rounded-full',
            day.outcome === 'win' && 'bg-win',
            day.outcome === 'loss' && 'bg-loss',
            day.outcome === 'flat' && 'bg-flat',
          )}
          aria-hidden
        />

        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium text-ink">
            <span className="sm:hidden">{weekdayLabel(day.date)}</span>
            <span className="hidden sm:inline">{longDayLabel(day.date)}</span>
          </span>
          <span className="truncate text-[12px] text-ink-muted">
            {stats.trades} {stats.trades === 1 ? 'trade' : 'trades'}
            {stats.wins > 0 && `, ${stats.wins} ${stats.wins === 1 ? 'win' : 'wins'}`}
            {stats.losses > 0 && `, ${stats.losses} ${stats.losses === 1 ? 'loss' : 'losses'}`}
          </span>
        </span>

        <span className="ml-auto flex shrink-0 items-center gap-2">
          {day.violations > 0 && (
            <Badge tone="caution" className="hidden sm:inline-flex">
              {day.violations} noted
            </Badge>
          )}
          <span className="text-sm font-medium">
            <Money value={stats.pnl} currency={currency} />
          </span>
          <ChevronRight
            className="size-4 shrink-0 text-ink-faint transition-transform duration-200 group-hover:translate-x-0.5"
            aria-hidden
          />
        </span>
      </div>

      {/* The per-trade lines from the spec's example, restyled. */}
      <div className="flex flex-col border-t border-line/70">
        {trades.slice(0, 4).map((t) => (
          <span
            key={t.id}
            className="flex items-center gap-2 px-3.5 py-1.5 text-[13px] last:pb-2.5"
          >
            <span
              className={cn(
                'size-1.5 shrink-0 rounded-full',
                t.outcome === 'win' && 'bg-win',
                t.outcome === 'loss' && 'bg-loss',
                t.outcome === 'flat' && 'bg-flat',
              )}
              aria-hidden
            />
            <span className="truncate font-medium text-ink-dim">{t.pair.toUpperCase()}</span>
            <span
              className={cn(
                'shrink-0 text-[12px]',
                t.outcome === 'win' && 'text-win',
                t.outcome === 'loss' && 'text-loss',
                t.outcome === 'flat' && 'text-ink-muted',
              )}
            >
              {t.outcome === 'flat' ? 'break even' : t.outcome}
            </span>
            {t.reason && (
              <span className="ml-auto hidden max-w-[45%] truncate text-[12px] text-ink-faint sm:block">
                {t.reason}
              </span>
            )}
          </span>
        ))}
        {trades.length > 4 && (
          <span className="px-3.5 pb-2.5 pt-0.5 text-[12px] text-ink-faint">
            +{trades.length - 4} more
          </span>
        )}
      </div>
    </button>
  )
}

/**
 * Groups days into "This week" / "Last week" / month names, newest first.
 * Exported for test — the relative labelling is the part that quietly breaks
 * around month and year boundaries.
 */
export function groupDays(byDay: Map<string, DaySummary>, now: string = today()): Group[] {
  const active = [...byDay.values()]
    .filter((d) => d.stats.trades > 0)
    .sort((a, b) => (a.date < b.date ? 1 : -1))

  if (active.length === 0) return []

  const thisWeekStart = startOfWeek(now)
  const lastWeekStart = addDays(thisWeekStart, -7)

  const groups: Group[] = []
  const push = (label: string, day: DaySummary) => {
    const last = groups.at(-1)
    if (last && last.label === label) last.days.push(day)
    else groups.push({ label, days: [day] })
  }

  for (const day of active) {
    if (day.date >= thisWeekStart) push('This week', day)
    else if (day.date >= lastWeekStart) push('Last week', day)
    else push(monthYearLabel(day.date, now), day)
  }
  return groups
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function monthYearLabel(day: string, now: string): string {
  const [y, m] = day.split('-').map(Number)
  const label = MONTHS[m - 1]
  // Only show the year once it stops being obvious.
  return y === Number(now.slice(0, 4)) ? label : `${label} ${y}`
}
