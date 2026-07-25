import { useMemo } from 'react'
import { CalendarDays, Flame, List, Plus, TriangleAlert } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { SegmentedGroup, SegmentedItem, SegmentedShell } from '#/components/ui/toggles'
import { Money, Stat, StatRow } from '#/components/ui/numbers'
import { EmptyState, PageTitle, Skeleton } from '#/components/ui/primitives'
import { Tip } from '#/components/ui/overlays'
import { MonthGrid } from '#/components/calendar/month-grid'
import { OpenTrades } from '#/components/trades/open-trades'
import { FeedbackCard } from '#/components/feedback/feedback-card'
import { DayDetail } from '#/components/calendar/day-detail'
import { ListView } from '#/components/list/list-view'
import { useAppStore } from '#/store/app'
import { useJournals } from '#/lib/use-journals'
import { useTrades } from '#/lib/use-trades'
import { useFeedback } from '#/lib/use-feedback'
import { computeStats, tradesInRange } from '#/lib/aggregate'
import { journalingStreak } from '#/lib/patterns'
import { formatPct } from '#/lib/calc'
import { periodRange, today } from '#/lib/dates'

export function JournalPage() {
  const { trades, byDay, loading, error } = useTrades()

  const viewMode = useAppStore((s) => s.viewMode)
  const setViewMode = useAppStore((s) => s.setViewMode)
  const anchorDay = useAppStore((s) => s.anchorDay)
  const setAnchorDay = useAppStore((s) => s.setAnchorDay)
  const openDay = useAppStore((s) => s.openDay)
  const openEditTrade = useAppStore((s) => s.openEditTrade)
  const openNewTrade = useAppStore((s) => s.openNewTrade)

  const { active: account } = useJournals()
  const currency = account.currency

  const monthStats = useMemo(() => {
    const { start, end } = periodRange(anchorDay, 'month')
    return computeStats(tradesInRange(trades, start, end))
  }, [trades, anchorDay])

  const streak = useMemo(() => journalingStreak(trades, today()), [trades])
  const feedback = useFeedback(trades)

  if (loading) return <JournalSkeleton />

  // A failed read must never render as "you have no trades" — that reads as
  // data loss to someone who knows they logged something.
  if (error) {
    return (
      <div className="rounded-2xl border border-loss-edge bg-loss-wash">
        <EmptyState
          icon={<TriangleAlert aria-hidden />}
          title="We couldn't load your journal"
          body="Your trades are safe — this is a connection problem on our side. Try reloading in a moment."
          action={
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Reload
            </Button>
          }
        />
      </div>
    )
  }

  const noTradesEver = trades.length === 0

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <PageTitle eyebrow="Your journal" title={viewMode === 'calendar' ? 'Calendar' : 'Recent days'}>
        {/*
          §7: a single toggle switches views instantly — Zustand only, no route
          change, no reload, no refetch. Both read the same subscription.
        */}
        <SegmentedGroup
          type="single"
          value={viewMode}
          onValueChange={(v) => v && setViewMode(v as 'calendar' | 'list')}
          aria-label="View mode"
          asChild
        >
          <SegmentedShell>
            <SegmentedItem value="calendar" aria-label="Calendar view">
              <CalendarDays className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">Calendar</span>
            </SegmentedItem>
            <SegmentedItem value="list" aria-label="List view">
              <List className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">List</span>
            </SegmentedItem>
          </SegmentedShell>
        </SegmentedGroup>
      </PageTitle>

      {!noTradesEver && (
        <StatRow>
          <Stat
            label="This month"
            value={<Money value={monthStats.pnl} currency={currency} animate />}
            sub={`${monthStats.trades} trades`}
            index={0}
          />
          <Stat
            label="Win rate"
            value={monthStats.winRate === null ? '—' : formatPct(monthStats.winRate)}
            sub={`${monthStats.wins}W · ${monthStats.losses}L`}
            index={1}
          />
          <Stat
            label="Profit factor"
            value={monthStats.profitFactor === null ? '—' : monthStats.profitFactor.toFixed(2)}
            sub={monthStats.profitFactor === null ? 'no losses yet' : 'gross win ÷ loss'}
            index={2}
          />
          <Stat
            label="Streak"
            value={
              <span className="flex items-center gap-1.5">
                {streak.current}
                {streak.current >= 3 && (
                  <Flame className="size-4 text-caution" aria-hidden />
                )}
              </span>
            }
            sub={streak.longest > streak.current ? `best ${streak.longest}` : 'days logged'}
            index={3}
          />
        </StatRow>
      )}

      <OpenTrades trades={trades} onResolve={openEditTrade} />

      {noTradesEver ? (
        <div className="rounded-2xl border border-line bg-panel">
          <EmptyState
            icon={<Plus aria-hidden />}
            title="Your journal starts here"
            body="Log the trade you took today. Pair, win or loss, how much — that's all we need. Everything else is optional, forever."
            action={
              <Button variant="primary" size="lg" onClick={() => openNewTrade()}>
                <Plus aria-hidden />
                Log your first trade
              </Button>
            }
          />
        </div>
      ) : viewMode === 'calendar' ? (
        <MonthGrid
          anchor={anchorDay}
          byDay={byDay}
          currency={currency}
          onSelectDay={openDay}
          onShiftMonth={setAnchorDay}
        />
      ) : (
        <ListView
          byDay={byDay}
          currency={currency}
          onSelectDay={openDay}
          onNewTrade={() => openNewTrade()}
        />
      )}

      {feedback.ask && (
        <FeedbackCard
          onSubmit={(mood, note) => feedback.send(mood, note)}
          onDismiss={() => void feedback.dismiss()}
        />
      )}

      {viewMode === 'calendar' && !noTradesEver && (
        <p className="flex items-center gap-1.5 px-1 text-[12px] text-ink-faint">
          <Tip label="A dot means a rule was noted that day. Details live in your review.">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-caution" aria-hidden />
              marks a day with a noted rule
            </span>
          </Tip>
        </p>
      )}

      <DayDetail />
    </div>
  )
}

function JournalSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-11 w-32 rounded-[11px]" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[74px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-[26rem] rounded-2xl sm:h-[32rem]" />
    </div>
  )
}
