import { useMemo } from 'react'
import { ArrowUpRight, Columns2, MessageSquarePlus, Plus, Quote } from 'lucide-react'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Button } from '#/components/ui/button'
import { Badge, EmptyState } from '#/components/ui/primitives'
import { Money, Stat, StatRow } from '#/components/ui/numbers'
import { EquityCurve } from '#/components/charts/equity-curve'
import { computeStats, equityCurve, sortChronological } from '#/lib/aggregate'
import { formatPct, formatR } from '#/lib/calc'
import { durationMinutes, formatDuration, longDayLabel } from '#/lib/dates'
import { useAppStore } from '#/store/app'
import { useJournals } from '#/lib/use-journals'
import { useTrades } from '#/lib/use-trades'
import { useAuth } from '#/lib/auth'
import { formatTime, timeFormatOf } from '#/lib/clock'
import { chartCaption, chartsOf, sortCharts } from '#/lib/charts'
import { isCostly, reasonLabel } from '#/lib/reasons'
import type { Trade } from '#/lib/types'
import { cn } from '#/components/ui/cn'

/**
 * The day view (§7). Reached from a calendar cell *or* a list row — one modal,
 * one implementation, because the two views are renderings of the same data.
 */
export function DayDetail() {
  const selectedDay = useAppStore((s) => s.selectedDay)
  const closeDay = useAppStore((s) => s.closeDay)
  const openNewTrade = useAppStore((s) => s.openNewTrade)
  const openEditTrade = useAppStore((s) => s.openEditTrade)
  const openReflection = useAppStore((s) => s.openReflection)
  const { trades } = useTrades()
  const { active: account } = useJournals()
  const { profile } = useAuth()
  const currency = account.currency
  const clock = timeFormatOf(profile?.prefs)

  const dayTrades = useMemo(
    () => (selectedDay ? sortChronological(trades.filter((t) => t.date === selectedDay)) : []),
    [trades, selectedDay],
  )
  const stats = useMemo(() => computeStats(dayTrades), [dayTrades])
  const openCount = useMemo(() => dayTrades.filter((t) => t.status === 'open').length, [dayTrades])
  const curve = useMemo(() => equityCurve(dayTrades), [dayTrades])

  // The trade with the most marked-up charts is the one worth opening side by
  // side — a top-down read is only useful seen together.
  const chartRich = dayTrades
    .map((t) => ({ t, charts: chartsOf(t) }))
    .filter((x) => x.charts.length >= 2)
    .sort((a, b) => b.charts.length - a.charts.length)[0]

  return (
    <Dialog open={selectedDay !== null} onOpenChange={(o) => !o && closeDay()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{selectedDay ? longDayLabel(selectedDay) : ''}</DialogTitle>
          <p className="text-[13px] text-ink-muted">
            {stats.trades === 0
              ? openCount > 0
                ? `${openCount} still open`
                : 'Nothing logged for this day'
              : `${stats.trades} ${stats.trades === 1 ? 'trade' : 'trades'} · ${stats.wins}W ${stats.losses}L${openCount > 0 ? ` · ${openCount} open` : ''}`}
          </p>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-5">
          {stats.trades === 0 && openCount === 0 ? (
            <EmptyState
              icon={<Plus aria-hidden />}
              title="A quiet day"
              body="Nothing here yet. If you traded, it takes about ten seconds to add."
              action={
                <Button
                  variant="primary"
                  onClick={() => {
                    if (selectedDay) openNewTrade(selectedDay)
                  }}
                >
                  <Plus aria-hidden />
                  Log a trade
                </Button>
              }
            />
          ) : (
            <>
              {stats.trades > 0 && (
              <StatRow>
                <Stat
                  label="Net P&L"
                  value={<Money value={stats.pnl} currency={currency} animate />}
                  index={0}
                />
                <Stat
                  label="Win rate"
                  value={stats.winRate === null ? '—' : formatPct(stats.winRate)}
                  sub={`${stats.wins} of ${stats.trades}`}
                  index={1}
                />
                <Stat
                  label="Profit factor"
                  value={stats.profitFactor === null ? '—' : stats.profitFactor.toFixed(2)}
                  sub={stats.profitFactor === null ? 'no losses' : undefined}
                  index={2}
                />
                <Stat
                  label="Total R"
                  value={stats.totalR === null ? '—' : formatR(stats.totalR)}
                  tone={
                    stats.totalR === null ? 'neutral' : stats.totalR >= 0 ? 'win' : 'loss'
                  }
                  index={3}
                />
              </StatRow>
              )}

              {dayTrades.length > 1 && (
                <section>
                  <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-ink-faint">
                    Through the day
                  </h3>
                  <EquityCurve
                    points={curve}
                    currency={currency}
                    height={120}
                    label={`Cumulative P&L on ${selectedDay}`}
                  />
                </section>
              )}

              <section>
                <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-ink-faint">
                  Trades
                </h3>
                <TradeTable
                  trades={dayTrades}
                  currency={currency}
                  clock={clock}
                  onEdit={(t) => {
                    closeDay()
                    openEditTrade(t)
                  }}
                  onAddNote={(t) => {
                    // Straight to the reflection sheet — the same one shown
                    // after logging, so a note lives in exactly one place
                    // whether it is written now or a week later.
                    closeDay()
                    openReflection(t)
                  }}
                />
              </section>
            </>
          )}
        </DialogBody>

        {(stats.trades > 0 || openCount > 0) && (
          <DialogFooter>
            {chartRich && (
              <Button
                variant="outline"
                className="sm:mr-auto"
                onClick={() => {
                  // §10: the whole markup in one click instead of four tabs.
                  for (const c of sortCharts(chartRich.charts)) {
                    window.open(c.url, '_blank', 'noopener')
                  }
                }}
              >
                <Columns2 aria-hidden />
                Open all {chartRich.charts.length} charts
              </Button>
            )}
            <Button
              variant="primary"
              onClick={() => {
                if (selectedDay) openNewTrade(selectedDay)
              }}
            >
              <Plus aria-hidden />
              Add another
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * Trades table. On mobile it becomes a stack of cards rather than a table that
 * scrolls sideways — §12 forbids horizontal scroll, and a 7-column table at
 * 320px has nowhere else to go.
 */
function TradeTable({
  trades,
  currency,
  clock,
  onEdit,
  onAddNote,
}: {
  trades: Trade[]
  currency: string
  clock: '12h' | '24h'
  onEdit: (t: Trade) => void
  onAddNote: (t: Trade) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {/* Column headers, desktop only. */}
      <div className="hidden grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-ink-faint sm:grid">
        <span className="w-11">Time</span>
        <span>Symbol</span>
        <span className="w-16 text-right">Size</span>
        <span className="w-16 text-right">Held</span>
        <span className="w-24 text-right">P&amp;L</span>
      </div>

      {trades.map((t, i) => (
        <div
          key={t.id}
          className="stagger overflow-hidden rounded-xl border border-line bg-raised"
          style={{ '--i': i } as React.CSSProperties}
        >
          <button
            type="button"
            onClick={() => onEdit(t)}
            className={cn(
              'flex w-full min-h-11 items-center gap-3 px-3 py-2.5 text-left',
              'transition-colors duration-150 hover:bg-overlay',
              'sm:grid sm:grid-cols-[auto_1fr_auto_auto_auto]',
            )}
          >
            <span className="hidden w-11 shrink-0 text-[12px] text-ink-muted tnum sm:block">
              {t.time ? formatTime(t.time, clock) : '—'}
            </span>

            <span className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  'size-1.5 shrink-0 rounded-full',
                  t.status === 'open'
                    ? 'bg-accent ring-2 ring-accent-wash'
                    : t.outcome === 'win'
                      ? 'bg-win'
                      : t.outcome === 'loss'
                        ? 'bg-loss'
                        : 'bg-flat',
                )}
                aria-hidden
              />
              <span className="truncate text-[13px] font-medium text-ink">
                {t.pair.toUpperCase()}
              </span>
              <Badge tone="neutral" className="shrink-0 uppercase">
                {t.direction}
              </Badge>
              {t.time && (
                <span className="shrink-0 text-[11px] text-ink-faint tnum sm:hidden">
                  {formatTime(t.time, clock)}
                </span>
              )}
            </span>

            <span className="hidden w-16 shrink-0 text-right text-[12px] text-ink-dim tnum sm:block">
              {t.lotSize ?? '—'}
            </span>
            <span className="hidden w-16 shrink-0 text-right text-[12px] text-ink-dim tnum sm:block">
              {formatDuration(durationMinutes(t))}
            </span>
            <span className="ml-auto w-24 shrink-0 text-right text-[13px] font-medium sm:ml-0">
              {t.status === 'open' ? (
                <span className="text-[12px] text-ink-muted">open</span>
              ) : (
                <Money value={t.pnl} currency={currency} />
              )}
            </span>
          </button>

          {/*
            Always rendered, even when empty. Skipping the reflection after a
            trade must not make it unreachable — this row is where someone
            comes back hours later having decided what they actually think.
          */}
          <div className="flex flex-col gap-2 border-t border-line px-3 py-2.5">
              {t.reason ? (
                <button
                  type="button"
                  onClick={() => onAddNote(t)}
                  className="flex gap-2 text-left text-[13px] leading-relaxed text-ink-dim transition-colors hover:text-ink"
                >
                  <Quote className="mt-0.5 size-3 shrink-0 text-ink-faint" aria-hidden />
                  {t.reason}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onAddNote(t)}
                  className="flex min-h-9 items-center gap-2 self-start rounded-lg border border-dashed border-line px-2.5 text-[12px] text-ink-muted transition-colors hover:border-accent-edge hover:text-accent-bright"
                >
                  <MessageSquarePlus className="size-3.5 shrink-0" aria-hidden />
                  {(t.reasonTags?.length ?? 0) > 0 ? 'Add a note' : 'Why did you take this?'}
                </button>
              )}

              {(t.reasonTags?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {t.reasonTags!.map((r) => (
                    <Badge key={r} tone={isCostly(r) ? 'caution' : 'win'}>
                      {reasonLabel(r)}
                    </Badge>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-1.5">
                {t.tags?.map((tag) => (
                  <Badge key={tag} tone="neutral">
                    {tag}
                  </Badge>
                ))}
                {sortCharts(chartsOf(t)).map((c, ci) => (
                  <ChartLink key={ci} href={c.url} label={chartCaption(c)} bias={c.bias} />
                ))}
              </div>

              {/*
                Violations appear here as a quiet note — the loud version is
                the weekly review, and even there it doesn't shout (§5).
              */}
              {t.ruleViolations?.map((v) => (
                <p key={v.code} className="text-[12px] leading-relaxed text-caution">
                  {v.message}
                </p>
              ))}
            </div>
        </div>
      ))}
    </div>
  )
}

function ChartLink({
  href,
  label,
  bias,
}: {
  href: string
  label: string
  bias?: 'bullish' | 'bearish' | 'neutral'
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-full border border-line-strong bg-panel px-2.5',
        'text-[11px] font-medium text-ink-dim transition-colors duration-150',
        'hover:border-accent-edge hover:text-accent-bright',
      )}
    >
      {label}
      {bias && (
        <span
          className={cn(
            'size-1.5 rounded-full',
            bias === 'bullish' && 'bg-win',
            bias === 'bearish' && 'bg-loss',
            bias === 'neutral' && 'bg-flat',
          )}
          aria-hidden
        />
      )}
      <ArrowUpRight className="size-3" aria-hidden />
    </a>
  )
}
