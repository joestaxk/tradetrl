import { useEffect, useMemo, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Loader2,
  NotebookPen,
  Sparkles,
  Target,
} from 'lucide-react'
import { Button } from '#/components/ui/button'
import { SegmentedGroup, SegmentedItem, SegmentedShell } from '#/components/ui/toggles'
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Divider,
  EmptyState,
  PageTitle,
  Skeleton,
} from '#/components/ui/primitives'
import { Money, Stat, StatRow } from '#/components/ui/numbers'
import { EquityCurve } from '#/components/charts/equity-curve'
import { toast } from '#/components/ui/toast'
import { useAppStore } from '#/store/app'
import { useJournals } from '#/lib/use-journals'
import { useTrades } from '#/lib/use-trades'
import { computeStats, equityCurve, maxDrawdown, tradesInRange } from '#/lib/aggregate'
import { disciplineScore } from '#/lib/patterns'
import { biasAlignment, planOutcome, strategyPerformance } from '#/lib/strategies'
import { useStrategies } from '#/lib/use-strategies'
import { usePeriodPlan } from '#/lib/use-period-plan'
import { StrategyPicker } from '#/components/trades/strategy-picker'
import { formatMoney, formatPct, formatR } from '#/lib/calc'
import { periodLabel, periodRange, shiftPeriod, today } from '#/lib/dates'
import { rulesAreSet } from '#/lib/violations'
import { cn } from '#/components/ui/cn'

/**
 * The review screen (§5, §6).
 *
 * This is the *only* place violations are surfaced in aggregate. Nothing here
 * blocks, warns mid-week or moralises: it states what the numbers say and
 * lets the trader draw the conclusion.
 */
export function ReviewPage() {
  const { trades, loading } = useTrades()

  const kind = useAppStore((s) => s.reviewPeriod)
  const setKind = useAppStore((s) => s.setReviewPeriod)
  const anchor = useAppStore((s) => s.reviewAnchor)
  const setAnchor = useAppStore((s) => s.setReviewAnchor)

  const { active: account } = useJournals()
  const currency = account.currency
  const range = useMemo(() => periodRange(anchor, kind), [anchor, kind])

  const periodTrades = useMemo(
    () => tradesInRange(trades, range.start, range.end),
    [trades, range],
  )
  const stats = useMemo(() => computeStats(periodTrades), [periodTrades])
  const discipline = useMemo(() => disciplineScore(periodTrades), [periodTrades])
  const curve = useMemo(() => equityCurve(periodTrades), [periodTrades])
  const drawdown = useMemo(() => maxDrawdown(periodTrades), [periodTrades])

  const { active: strategies } = useStrategies()
  const { plan, loading: planLoading, save: persistPlan } = usePeriodPlan(anchor, kind)

  const [picked, setPicked] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  // Seed the picker from whatever is already planned for this period.
  useEffect(() => {
    setPicked(plan?.strategyIds ?? [])
  }, [plan])

  const perStrategy = useMemo(
    () => strategyPerformance(periodTrades, strategies, plan),
    [periodTrades, strategies, plan],
  )
  const outcome = useMemo(
    () => planOutcome(periodTrades, plan, strategies),
    [periodTrades, plan, strategies],
  )
  const weeklyBias = useMemo(() => biasAlignment(periodTrades, 'weekly'), [periodTrades])
  const dailyBias = useMemo(() => biasAlignment(periodTrades, 'daily'), [periodTrades])

  const planDirty =
    picked.length !== (plan?.strategyIds.length ?? 0) ||
    picked.some((id) => !plan?.strategyIds.includes(id))

  const savePlanNow = async () => {
    setSaving(true)
    try {
      await persistPlan(picked, account.riskRules)
      toast.success('Plan saved')
    } catch {
      toast.error("Couldn't save the plan")
    } finally {
      setSaving(false)
    }
  }

  const violating = useMemo(
    () => periodTrades.filter((t) => (t.ruleViolations?.length ?? 0) > 0),
    [periodTrades],
  )

  const isCurrent = periodRange(today(), kind).start === range.start

  /*
    A review looks backwards. You cannot review — or describe the entry model
    you used for — a week that hasn't happened, and a note filed against a
    future period would sit there being diffed against zero trades forever.
    The current period is the furthest forward you can go.
  */
  const canGoForward = range.start < periodRange(today(), kind).start

  if (loading) return <ReviewSkeleton />

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <PageTitle eyebrow="Review" title={periodLabel(anchor, kind)}>
        <SegmentedGroup
          type="single"
          value={kind}
          onValueChange={(v) => v && setKind(v as 'week' | 'month')}
          aria-label="Review period"
          asChild
        >
          <SegmentedShell>
            <SegmentedItem value="week">Week</SegmentedItem>
            <SegmentedItem value="month">Month</SegmentedItem>
          </SegmentedShell>
        </SegmentedGroup>
      </PageTitle>

      <div className="flex items-center gap-1">
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => setAnchor(shiftPeriod(anchor, kind, -1))}
          aria-label={`Previous ${kind}`}
        >
          <ChevronLeft aria-hidden />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setAnchor(today())}
          className={cn(isCurrent && 'pointer-events-none opacity-40')}
        >
          This {kind}
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => setAnchor(shiftPeriod(anchor, kind, 1))}
          aria-label={`Next ${kind}`}
          disabled={!canGoForward}
        >
          <ChevronRight aria-hidden />
        </Button>
        <span className="ml-2 text-[12px] text-ink-faint tnum">
          {range.start} → {range.end}
        </span>
      </div>

      {stats.trades === 0 ? (
        <Card>
          <EmptyState
            icon={<NotebookPen aria-hidden />}
            title={isCurrent ? 'Nothing logged this period yet' : 'A quiet period'}
            body={
              isCurrent
                ? 'Your review fills in as you log. Come back at the end of the week — that is when it earns its keep.'
                : 'No trades were logged between these dates.'
            }
          />
        </Card>
      ) : (
        <>
          <StatRow>
            <Stat
              label="Net P&L"
              value={<Money value={stats.pnl} currency={currency} animate />}
              sub={`${stats.trades} trades`}
              index={0}
            />
            <Stat
              label="Win rate"
              value={stats.winRate === null ? '—' : formatPct(stats.winRate)}
              sub={`${stats.wins}W · ${stats.losses}L`}
              index={1}
            />
            <Stat
              label="Expectancy"
              value={stats.expectancyR === null ? '—' : formatR(stats.expectancyR)}
              sub={stats.expectancyR === null ? 'needs risk data' : 'avg R per trade'}
              tone={
                stats.expectancyR === null
                  ? 'neutral'
                  : stats.expectancyR >= 0
                    ? 'win'
                    : 'loss'
              }
              index={2}
            />
            <Stat
              label="Discipline"
              value={discipline.score === null ? '—' : `${discipline.score}`}
              sub={
                discipline.score === null
                  ? 'no rules set'
                  : `${discipline.tradesCounted - discipline.violatingTrades.length}/${discipline.tradesCounted} clean`
              }
              tone={
                discipline.score === null
                  ? 'neutral'
                  : discipline.score >= 90
                    ? 'win'
                    : discipline.score >= 70
                      ? 'neutral'
                      : 'loss'
              }
              index={3}
            />
          </StatRow>

          <Card>
            <CardHeader>
              <CardTitle>How the {kind} ran</CardTitle>
              <span className="shrink-0 text-[12px] text-ink-faint tnum">
                max drawdown {formatMoney(drawdown, { currency, signed: false })}
              </span>
            </CardHeader>
            <CardBody>
              <EquityCurve
                points={curve}
                currency={currency}
                height={150}
                label={`Cumulative P&L, ${periodLabel(anchor, kind)}`}
              />
            </CardBody>
          </Card>

          {/* ---- §5: the one place violations are aggregated ---- */}
          <Card>
            <CardHeader>
              <CardTitle>Your rules</CardTitle>
            </CardHeader>
            <CardBody>
              {!rulesAreSet(account.riskRules) ? (
                <p className="text-[13px] leading-relaxed text-ink-muted">
                  You haven't set any rules yet, so there's nothing to measure against.
                  Setting a max risk or a list of pairs in Settings turns this into the
                  most useful panel on the page.
                </p>
              ) : violating.length === 0 ? (
                <p className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-dim">
                  <CircleCheck className="mt-0.5 size-4 shrink-0 text-win" aria-hidden />
                  All {stats.trades} trades stayed inside the rules you set.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {/* Plain, non-shaming, exactly as specified. */}
                  <p className="text-[15px] leading-relaxed text-ink">
                    {violating.length} of {stats.trades} trades broke a rule you set this{' '}
                    {kind}.
                  </p>
                  <Divider />
                  <ul className="flex flex-col gap-2.5">
                    {violating.map((t) => (
                      <li key={t.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="text-[13px] font-medium text-ink-dim">
                          {t.date} · {t.pair.toUpperCase()}
                        </span>
                        <span className="text-[13px] text-caution">
                          {t.ruleViolations?.map((v) => v.message).join(' ')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardBody>
          </Card>
        </>
      )}

      {/* ---- what you said you'd trade, and what you actually did ---- */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>This {kind}'s plan</CardTitle>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
              Pick the strategies you mean to trade. Taking something else is never
              blocked — it gets noted here afterwards, whether it won or lost.
            </p>
          </div>
          <Target className="size-4 shrink-0 text-ink-faint" aria-hidden />
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          {planLoading ? (
            <Skeleton className="h-20 rounded-[10px]" />
          ) : strategies.length === 0 ? (
            <p className="text-[13px] leading-relaxed text-ink-muted">
              You haven't named any strategies yet. Add one or two in Settings and this
              becomes the panel that tells you which of them actually makes money.
            </p>
          ) : (
            <>
              <StrategyPicker
                strategies={strategies}
                value={undefined}
                onChange={() => {}}
                plannedIds={picked}
              />
              <div className="flex flex-wrap gap-1.5">
                {strategies.map((st) => {
                  const on = picked.includes(st.id)
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() =>
                        setPicked((p) =>
                          on ? p.filter((x) => x !== st.id) : [...p, st.id],
                        )
                      }
                      className={cn(
                        'inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] transition-colors',
                        on
                          ? 'border-accent bg-accent-wash text-ink'
                          : 'border-line bg-raised text-ink-dim hover:border-line-strong hover:text-ink',
                      )}
                    >
                      {on && <CircleCheck className="size-3.5 text-accent" aria-hidden />}
                      {st.name}
                    </button>
                  )
                })}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={savePlanNow}
                  disabled={!planDirty || saving}
                >
                  {saving && <Loader2 className="animate-spin" aria-hidden />}
                  {plan ? 'Update plan' : 'Set the plan'}
                </Button>
                {!planDirty && plan && <span className="text-[12px] text-ink-faint">Saved</span>}
              </div>
            </>
          )}

          {outcome.verdict && (
            <>
              <Divider className="my-1" />
              <p className="flex gap-2 text-[13px] leading-relaxed text-ink-dim">
                <Sparkles className="mt-0.5 size-3.5 shrink-0 text-ink-faint" aria-hidden />
                {outcome.verdict}
              </p>
            </>
          )}
        </CardBody>
      </Card>

      {/* ---- which setups actually paid ---- */}
      {perStrategy.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>By strategy</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="flex flex-col gap-1.5">
              {perStrategy.map((row, i) => (
                <li
                  key={row.strategyId}
                  className="stagger flex items-center gap-3 rounded-lg px-1 py-1.5"
                  style={{ '--i': i } as React.CSSProperties}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="truncate text-[13px] font-medium text-ink-dim">
                      {row.name}
                    </span>
                    {row.offPlanCount > 0 && (
                      <Badge tone="neutral" className="shrink-0">
                        {row.offPlanCount} off plan
                      </Badge>
                    )}
                  </span>
                  <span className="shrink-0 text-[12px] text-ink-faint tnum">
                    {row.stats.trades}
                  </span>
                  <span className="w-14 shrink-0 text-right text-[12px] text-ink-muted tnum">
                    {row.stats.winRate === null ? '—' : formatPct(row.stats.winRate, 0)}
                  </span>
                  <span className="w-24 shrink-0 text-right text-[13px] font-medium">
                    <Money value={row.stats.pnl} currency={currency} compact />
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {/* ---- did trading with your own read pay? ---- */}
      {(weeklyBias.line || dailyBias.line) && (
        <Card>
          <CardHeader>
            <CardTitle>Your bias vs your results</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-2">
            {[weeklyBias, dailyBias].map((b, i) =>
              b.line ? (
                <p key={i} className="text-[13px] leading-relaxed text-ink-dim">
                  {b.line}
                </p>
              ) : null,
            )}
          </CardBody>
        </Card>
      )}
    </div>
  )
}

function ReviewSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-9 w-52" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[74px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-52 rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  )
}
