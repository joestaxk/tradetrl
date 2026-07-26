import { useMemo } from 'react'
import {
  Activity,
  Clock,
  Download,
  Flame,
  Sparkles,
  Tags,
  TrendingUp,
} from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  PageTitle,
  Skeleton,
} from '#/components/ui/primitives'
import { Money, Stat, StatRow } from '#/components/ui/numbers'
import { Sparkline } from '#/components/charts/equity-curve'
import { SessionHeatmap } from '#/components/charts/heatmap'
import { RiskCard } from '#/components/insights/risk-card'
import { toast } from '#/components/ui/toast'
import { useJournals } from '#/lib/use-journals'
import { useTrades } from '#/lib/use-trades'
import { byPair, byTag, computeStats, maxDrawdown, medianHoldMinutes } from '#/lib/aggregate'
import { analyse, disciplineScore, journalingStreak, readiness, scoreTrend } from '#/lib/patterns'
import { useStrategies } from '#/lib/use-strategies'
import { useAuth } from '#/lib/auth'
import { sessionWindowsOf } from '#/lib/sessions'
import { accountStanding } from '#/lib/balance'
import { downloadCsv } from '#/lib/export'
import { formatMoney, formatPct, formatR } from '#/lib/calc'
import { addDays, formatDuration, startOfWeek, today } from '#/lib/dates'
import { cn } from '#/components/ui/cn'

/**
 * Insights (§10).
 *
 * Every panel here is derived from entries the trader already made — nothing
 * on this page asks for a single extra keystroke. That is the whole Pro
 * proposition: more insight, identical input.
 */
export function InsightsPage() {
  const { trades, loading } = useTrades()
  const { active: account } = useJournals()
  const currency = account.currency

  const stats = useMemo(() => computeStats(trades), [trades])
  const discipline = useMemo(() => disciplineScore(trades), [trades])
  const streak = useMemo(() => journalingStreak(trades, today()), [trades])
  const { active: strategies } = useStrategies()
  const { profile } = useAuth()
  const sessionWindows = useMemo(() => sessionWindowsOf(profile?.prefs), [profile?.prefs])
  const standing = useMemo(() => accountStanding(account, trades), [account, trades])
  const insights = useMemo(
    () =>
      analyse(trades, {
        strategies,
        sessionWindows,
        declaredRiskPct: account.riskRules.maxRiskPerTradePct,
        riskBase: standing.riskBase,
      }),
    [trades, strategies, sessionWindows, account.riskRules.maxRiskPerTradePct, standing.riskBase],
  )
  const engineReadiness = useMemo(() => readiness(trades), [trades])
  const pairs = useMemo(() => byPair(trades).slice(0, 6), [trades])
  const tags = useMemo(() => byTag(trades).slice(0, 8), [trades])
  const drawdown = useMemo(() => maxDrawdown(trades), [trades])
  const hold = useMemo(() => medianHoldMinutes(trades), [trades])

  // Last 8 weeks of discipline, for the trend sparkline.
  const trend = useMemo(() => {
    const thisWeek = startOfWeek(today())
    const weeks = Array.from({ length: 8 }, (_, i) => addDays(thisWeek, (i - 7) * 7))
    return scoreTrend(trades, weeks)
  }, [trades])

  const trendValues = trend.map((t) => t.score).filter((s): s is number => s !== null)

  if (loading) return <InsightsSkeleton />

  if (trades.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <PageTitle eyebrow="Insights" title="Patterns" />
        <Card>
          <EmptyState
            icon={<Sparkles aria-hidden />}
            title="Nothing to read yet"
            body="Insights are computed from what you've already logged — no extra forms, no self-reporting. Log a handful of trades and this page starts filling itself in."
          />
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <PageTitle eyebrow="Insights" title="Patterns">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            downloadCsv(trades, 'journal')
            toast.success('Exported', { description: `${trades.length} trades as CSV.` })
          }}
        >
          <Download aria-hidden />
          Export CSV
        </Button>
      </PageTitle>

      <StatRow className="sm:grid-cols-3 lg:grid-cols-5">
        <Stat
          label="All time"
          value={<Money value={stats.pnl} currency={currency} animate compact />}
          sub={`${stats.trades} trades`}
          index={0}
        />
        <Stat
          label="Expectancy"
          value={stats.expectancyR === null ? '—' : formatR(stats.expectancyR)}
          sub={stats.expectancyR === null ? 'needs risk data' : 'avg R per trade'}
          tone={stats.expectancyR === null ? 'neutral' : stats.expectancyR >= 0 ? 'win' : 'loss'}
          index={1}
        />
        <Stat
          label="Max drawdown"
          value={formatMoney(drawdown, { currency, signed: false, compact: true })}
          sub="peak to trough"
          index={2}
        />
        <Stat
          label="Typical hold"
          value={hold === null ? '—' : formatDuration(hold)}
          sub={hold === null ? 'needs entry + close times' : 'median'}
          index={3}
        />
        <Stat
          label="Streak"
          value={
            <span className="flex items-center gap-1.5">
              {streak.current}
              {streak.current >= 3 && <Flame className="size-4 text-caution" aria-hidden />}
            </span>
          }
          sub={`best ${streak.longest} days`}
          index={4}
        />
      </StatRow>

      <RiskCard trades={trades} />

      {/* ---- discipline trend ---- */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Discipline score</CardTitle>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
              Rule adherence, not win rate. A losing week with no broken rules still
              scores 100 — that's the point.
            </p>
          </div>
          <Activity className="size-4 shrink-0 text-ink-faint" aria-hidden />
        </CardHeader>
        <CardBody>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <span className="flex items-baseline gap-1.5">
              <span
                className={cn(
                  'font-display text-4xl leading-none tnum',
                  discipline.score === null
                    ? 'text-ink-faint'
                    : discipline.score >= 90
                      ? 'text-win-bright'
                      : discipline.score >= 70
                        ? 'text-ink'
                        : 'text-loss-bright',
                )}
              >
                {discipline.score ?? '—'}
              </span>
              <span className="text-[13px] text-ink-faint">/ 100</span>
            </span>

            {/*
              The trend is a texture beside the figure, not a chart in its own
              right — so it gets a fixed, modest width instead of stretching
              across the card and reading as a stray rule.
            */}
            {trendValues.length >= 2 ? (
              <span className="flex min-w-0 flex-col gap-1">
                <Sparkline
                  values={trendValues}
                  tone="accent"
                  height={30}
                  className="w-32 sm:w-44"
                />
                <span className="text-[11px] text-ink-faint">last 8 weeks</span>
              </span>
            ) : (
              <span className="text-[12px] text-ink-muted">
                A few more weeks of logging and a trend appears here.
              </span>
            )}
          </div>
        </CardBody>
      </Card>

      {/* ---- behavioural flags ---- */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>What the log noticed</CardTitle>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
              Read from your own history and measured against your own averages.
              Nothing appears here until there's enough data to mean something.
            </p>
          </div>
        </CardHeader>
        <CardBody>
          {insights.length === 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-[13px] leading-relaxed text-ink-dim">
                {engineReadiness.missing.length > 0
                  ? 'Not enough to say anything yet.'
                  : 'Nothing stood out. No oversized trades after losses, no days well above your usual pace.'}
              </p>
              {/*
                An empty Insights page must never read as "nothing is wrong" —
                it usually means "not yet". Saying which is honest and stops
                silence being mistaken for a clean bill of health.
              */}
              {engineReadiness.missing.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {engineReadiness.missing.map((m) => (
                    <li key={m} className="flex gap-2 text-[13px] text-ink-muted">
                      <span className="mt-[7px] size-1 shrink-0 rounded-full bg-ink-faint" aria-hidden />
                      {m}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {insights.slice(0, 10).map((f, i) => (
                <li
                  key={`${f.kind}-${i}`}
                  className={cn(
                    'stagger flex flex-col gap-1.5 rounded-xl border px-3.5 py-3',
                    f.weight === 'critical'
                      ? 'border-caution/25 bg-caution-wash'
                      : 'border-line bg-raised',
                  )}
                  style={{ '--i': i } as React.CSSProperties}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-medium text-ink">{f.title}</span>
                    <Badge tone={f.weight === 'critical' ? 'caution' : 'neutral'} className="tnum">
                      {f.sample} trades
                    </Badge>
                  </span>
                  <span className="text-[13px] leading-relaxed text-ink-dim">{f.detail}</span>
                  {/*
                    The arithmetic, shown rather than asserted. A claim you
                    can check is a claim worth acting on.
                  */}
                  <span className="text-[11px] leading-relaxed text-ink-faint">{f.evidence}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* ---- session heatmap ---- */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>By session</CardTitle>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
              Derived from the clock time on each trade. No extra input.
            </p>
          </div>
          <Clock className="size-4 shrink-0 text-ink-faint" aria-hidden />
        </CardHeader>
        <CardBody>
          <SessionHeatmap trades={trades} currency={currency} />
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        {/* ---- by pair ---- */}
        <Card>
          <CardHeader>
            <CardTitle>By pair</CardTitle>
            <TrendingUp className="size-4 shrink-0 text-ink-faint" aria-hidden />
          </CardHeader>
          <CardBody>
            <BreakdownList rows={pairs} currency={currency} />
          </CardBody>
        </Card>

        {/* ---- by tag ---- */}
        <Card>
          <CardHeader>
            <CardTitle>By setup tag</CardTitle>
            <Tags className="size-4 shrink-0 text-ink-faint" aria-hidden />
          </CardHeader>
          <CardBody>
            {tags.length === 0 ? (
              <p className="text-[13px] leading-relaxed text-ink-muted">
                Tag a trade or two when you log them and per-setup win rates appear here.
                One tap, no form.
              </p>
            ) : (
              <BreakdownList rows={tags} currency={currency} />
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}

function BreakdownList({
  rows,
  currency,
}: {
  rows: { key: string; stats: ReturnType<typeof computeStats> }[]
  currency: string
}) {
  return (
    <ul className="flex min-w-0 flex-col gap-1.5">
      {rows.map((r, i) => (
        <li
          key={r.key}
          className="stagger flex min-w-0 items-center gap-3 rounded-lg px-1 py-1.5"
          style={{ '--i': i } as React.CSSProperties}
        >
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink-dim">
            {r.key}
          </span>
          <span className="shrink-0 text-[12px] text-ink-faint tnum">
            {r.stats.trades}
          </span>
          <span className="w-14 shrink-0 text-right text-[12px] text-ink-muted tnum">
            {r.stats.winRate === null ? '—' : formatPct(r.stats.winRate, 0)}
          </span>
          <span className="w-[5.5rem] shrink-0 text-right text-[13px] font-medium">
            <Money value={r.stats.pnl} currency={currency} compact />
          </span>
        </li>
      ))}
    </ul>
  )
}

function InsightsSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-9 w-40" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[74px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-36 rounded-2xl" />
      <Skeleton className="h-52 rounded-2xl" />
    </div>
  )
}
