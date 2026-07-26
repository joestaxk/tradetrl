import { Fragment, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { formatMoney, formatMoneyMicro } from '#/lib/calc'
import { isFuture, monthLabel, monthWeeks, shiftPeriod, startOfMonth, today } from '#/lib/dates'
import type { DaySummary } from '#/lib/aggregate'
import { cn } from '#/components/ui/cn'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface Props {
  anchor: string
  byDay: Map<string, DaySummary>
  currency?: string
  onSelectDay: (day: string) => void
  onShiftMonth: (anchor: string) => void
}

/**
 * The month grid.
 *
 * Two rules make this readable rather than merely correct:
 *
 *  - **One month at a time.** Days belonging to the neighbouring months are
 *    rendered as gaps, not as dimmed numbers. Spilling the tail of March into
 *    April makes it genuinely hard to read one month's shape, because the eye
 *    keeps catching figures from a period you are not looking at.
 *  - **No future days.** You cannot have traded tomorrow, so tomorrow is not a
 *    button. Letting someone open a future day invites a mis-dated trade that
 *    then quietly distorts every statistic.
 */
export function MonthGrid({ anchor, byDay, currency = 'USD', onSelectDay, onShiftMonth }: Props) {
  const weeks = useMemo(() => monthWeeks(anchor), [anchor])
  const now = today()

  // Weekly totals down the side — the review is a weekly artifact, so the
  // calendar should already be thinking in weeks.
  const weekTotals = useMemo(
    () =>
      weeks.map((week) => {
        let pnl = 0
        let trades = 0
        for (const d of week) {
          if (!d) continue
          const s = byDay.get(d)
          if (!s) continue
          pnl += s.stats.pnl
          trades += s.stats.trades
        }
        return { pnl, trades }
      }),
    [weeks, byDay],
  )

  const showingCurrentMonth = startOfMonth(now) === startOfMonth(anchor)
  // There is nothing to see in a month that hasn't started.
  const canGoForward = startOfMonth(shiftPeriod(anchor, 'month', 1)) <= startOfMonth(now)

  return (
    <section className="rounded-2xl border border-line bg-panel" aria-label="Trading calendar">
      <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-3 sm:px-4">
        <h2 className="font-display text-lg text-ink sm:text-xl">{monthLabel(anchor)}</h2>
        <div className="flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => onShiftMonth(shiftPeriod(anchor, 'month', -1))}
            aria-label="Previous month"
          >
            <ChevronLeft aria-hidden />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onShiftMonth(now)}
            disabled={showingCurrentMonth}
          >
            Today
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => onShiftMonth(shiftPeriod(anchor, 'month', 1))}
            disabled={!canGoForward}
            aria-label="Next month"
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </header>

      {/*
        Seven columns plus an eighth for the week total, which collapses below
        sm. Every cell clears 44px so touch targets hold at 320px.
      */}
      <div className="p-1.5 sm:p-3">
        <div className="grid grid-cols-7 gap-1 sm:grid-cols-[repeat(7,minmax(0,1fr))_minmax(0,0.9fr)] sm:gap-1.5">
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="pb-1 text-center text-[10px] font-medium uppercase tracking-wider text-ink-faint sm:text-[11px]"
            >
              <span className="sm:hidden">{w.charAt(0)}</span>
              <span className="hidden sm:inline">{w}</span>
            </div>
          ))}
          <div className="hidden pb-1 text-center text-[11px] font-medium uppercase tracking-wider text-ink-faint sm:block">
            Week
          </div>

          {weeks.map((week, wi) => (
            <Fragment key={wi}>
              {week.map((day, di) =>
                day === null ? (
                  // A gap, not a foreign day. Holds the column alignment and
                  // nothing else.
                  <div key={`gap-${wi}-${di}`} aria-hidden />
                ) : (
                  <DayCell
                    key={day}
                    day={day}
                    summary={byDay.get(day)}
                    isToday={day === now}
                    isFutureDay={isFuture(day, now)}
                    currency={currency}
                    index={wi * 7 + di}
                    onSelect={onSelectDay}
                  />
                ),
              )}
              <WeekTotal total={weekTotals[wi]} currency={currency} />
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  )
}

function DayCell({
  day,
  summary,
  isToday,
  isFutureDay,
  currency,
  index,
  onSelect,
}: {
  day: string
  summary?: DaySummary
  isToday: boolean
  isFutureDay: boolean
  currency: string
  index: number
  onSelect: (day: string) => void
}) {
  const dayNum = Number(day.slice(-2))
  const outcome = summary?.outcome
  const hasTrades = (summary?.stats.trades ?? 0) > 0
  const hasAnything = hasTrades || (summary?.open ?? 0) > 0

  return (
    <button
      type="button"
      onClick={() => onSelect(day)}
      // A day that hasn't happened is inert rather than hidden: the shape of
      // the month stays intact, but there is nothing to press.
      disabled={isFutureDay}
      aria-disabled={isFutureDay || undefined}
      className={cn(
        'stagger group relative flex min-h-[3.25rem] flex-col justify-between overflow-hidden rounded-lg p-1 text-left sm:min-h-[4.75rem] sm:p-2',
        'border transition-[background-color,border-color,transform] duration-200 ease-[var(--ease-out-quint)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        isFutureDay && 'cursor-default opacity-25',
        !hasAnything &&
          !isFutureDay &&
          'border-transparent hover:border-line hover:bg-raised/60',
        !hasAnything && isFutureDay && 'border-transparent',
        outcome === 'win' && 'border-win-edge bg-win-wash hover:border-win/60',
        outcome === 'loss' && 'border-loss-edge bg-loss-wash hover:border-loss/60',
        outcome === 'flat' && 'border-line-strong bg-flat-wash hover:border-ink-faint',
        // A day whose only trades are still running gets the accent, not a
        // win/loss colour — it has no result to report yet.
        outcome === 'open' && 'border-accent-edge bg-accent-wash hover:border-accent/60',
      )}
      style={{ '--i': Math.min(index, 24) } as React.CSSProperties}
      aria-label={
        isFutureDay
          ? `${day}: not yet`
          : hasTrades
            ? `${day}: ${summary!.stats.trades} trades, ${formatMoney(summary!.stats.pnl, { currency })}`
            : `${day}: no trades`
      }
    >
      <span
        className={cn(
          // shrink-0 matters here: this sits in a column flex inside a cell
          // that gets very tight at 320px, and without it the circle flattens.
          'flex size-5 min-w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-medium tnum sm:text-xs',
          isToday ? 'bg-accent text-void' : 'text-ink-muted',
          hasTrades && !isToday && 'text-ink-dim',
        )}
      >
        {dayNum}
      </span>

      {outcome === 'open' ? (
        <span className="flex min-w-0 flex-col">
          <span className="text-[10px] font-medium leading-tight text-accent-bright sm:text-[13px]">
            open
          </span>
          <span className="hidden text-[10px] leading-tight text-ink-faint sm:block">
            {summary!.open} waiting
          </span>
        </span>
      ) : hasTrades ? (
        <span className="flex min-w-0 flex-col">
          <span
            className={cn(
              'font-medium leading-tight tnum',
              outcome === 'win' && 'text-win-bright',
              outcome === 'loss' && 'text-loss-bright',
              outcome === 'flat' && 'text-ink-dim',
            )}
          >
            {/* Two formats, not one truncated one — see formatMoneyMicro. */}
            <span className="text-[10px] sm:hidden">
              {formatMoneyMicro(summary!.stats.pnl)}
            </span>
            <span className="hidden truncate text-[13px] sm:inline">
              {formatMoney(summary!.stats.pnl, { currency, compact: true })}
            </span>
          </span>
          <span className="hidden text-[10px] leading-tight text-ink-faint sm:block">
            {summary!.stats.trades} {summary!.stats.trades === 1 ? 'trade' : 'trades'}
          </span>
        </span>
      ) : (
        // A whisper of a dot, so an untraded day reads as deliberate rather
        // than broken. Future days get nothing — there is no absence to mark.
        !isFutureDay && (
          <span className="mx-auto mb-0.5 size-1 rounded-full bg-line-strong transition-colors duration-200 group-hover:bg-ink-faint" />
        )
      )}

      {(summary?.violations ?? 0) > 0 && (
        <span
          className="absolute right-1 top-1 size-1.5 rounded-full bg-caution"
          aria-hidden
          title="A rule was noted this day"
        />
      )}
    </button>
  )
}

function WeekTotal({
  total,
  currency,
}: {
  total: { pnl: number; trades: number } | undefined
  currency: string
}) {
  if (!total || total.trades === 0) {
    return <div className="hidden rounded-lg border border-dashed border-line/60 sm:block" />
  }
  return (
    <div className="hidden flex-col justify-center rounded-lg border border-line bg-raised px-2 py-2 sm:flex">
      <span className="text-[10px] uppercase tracking-wider text-ink-faint">Week</span>
      <span
        className={cn(
          'text-[13px] font-medium leading-tight tnum',
          total.pnl > 0 && 'text-win-bright',
          total.pnl < 0 && 'text-loss-bright',
          total.pnl === 0 && 'text-ink-dim',
        )}
      >
        {formatMoney(total.pnl, { currency, compact: true })}
      </span>
      <span className="text-[10px] text-ink-faint tnum">{total.trades} trades</span>
    </div>
  )
}
