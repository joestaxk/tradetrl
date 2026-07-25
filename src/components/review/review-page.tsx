import { useEffect, useMemo, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Loader2,
  NotebookPen,
  PenLine,
  Sparkles,
} from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Textarea } from '#/components/ui/field'
import { SegmentedGroup, SegmentedItem, SegmentedShell } from '#/components/ui/toggles'
import { Card, CardBody, CardHeader, CardTitle, Divider, EmptyState, PageTitle, Skeleton } from '#/components/ui/primitives'
import { Money, Stat, StatRow } from '#/components/ui/numbers'
import { EquityCurve } from '#/components/charts/equity-curve'
import { toast } from '#/components/ui/toast'
import { useAppStore } from '#/store/app'
import { useAuth } from '#/lib/auth'
import { useJournals } from '#/lib/use-journals'
import { useTrades } from '#/lib/use-trades'
import { computeStats, equityCurve, maxDrawdown, tradesInRange } from '#/lib/aggregate'
import { disciplineScore, planVsActual } from '#/lib/patterns'
import { formatMoney, formatPct, formatR } from '#/lib/calc'
import { periodId, periodLabel, periodRange, shiftPeriod, today } from '#/lib/dates'
import { loadPlan, savePlan } from '#/lib/repo'
import { rulesAreSet } from '#/lib/violations'
import type { PeriodPlan } from '#/lib/types'
import { cn } from '#/components/ui/cn'

/**
 * The review screen (§5, §6).
 *
 * This is the *only* place violations are surfaced in aggregate. Nothing here
 * blocks, warns mid-week or moralises: it states what the numbers say and
 * lets the trader draw the conclusion.
 */
export function ReviewPage() {
  const { user } = useAuth()
  const { trades, loading } = useTrades()

  const kind = useAppStore((s) => s.reviewPeriod)
  const setKind = useAppStore((s) => s.setReviewPeriod)
  const anchor = useAppStore((s) => s.reviewAnchor)
  const setAnchor = useAppStore((s) => s.setReviewAnchor)

  const { active: account } = useJournals()
  const currency = account.currency
  const range = useMemo(() => periodRange(anchor, kind), [anchor, kind])
  const id = useMemo(() => periodId(anchor, kind), [anchor, kind])

  const periodTrades = useMemo(
    () => tradesInRange(trades, range.start, range.end),
    [trades, range],
  )
  const stats = useMemo(() => computeStats(periodTrades), [periodTrades])
  const discipline = useMemo(() => disciplineScore(periodTrades), [periodTrades])
  const curve = useMemo(() => equityCurve(periodTrades), [periodTrades])
  const drawdown = useMemo(() => maxDrawdown(periodTrades), [periodTrades])

  const [plan, setPlan] = useState<PeriodPlan | null>(null)
  const [note, setNote] = useState('')
  const [planLoading, setPlanLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    setPlanLoading(true)
    loadPlan(user.uid, id)
      .then((p) => {
        if (cancelled) return
        setPlan(p)
        setNote(p?.entryModelNote ?? '')
      })
      .catch(() => {
        if (!cancelled) setPlan(null)
      })
      .finally(() => {
        if (!cancelled) setPlanLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user, id])

  const diff = useMemo(() => planVsActual(plan, periodTrades), [plan, periodTrades])

  const violating = useMemo(
    () => periodTrades.filter((t) => (t.ruleViolations?.length ?? 0) > 0),
    [periodTrades],
  )

  const saveNote = async () => {
    if (!user) return
    setSaving(true)
    try {
      await savePlan(user.uid, anchor, kind, note.trim(), account.riskRules)
      const fresh = await loadPlan(user.uid, id)
      setPlan(fresh)
      toast.success('Saved')
    } catch {
      toast.error("Couldn't save your note")
    } finally {
      setSaving(false)
    }
  }

  const dirty = note.trim() !== (plan?.entryModelNote ?? '').trim()
  const isCurrent = periodRange(today(), kind).start === range.start

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

      {/* ---- §6: the entry-model note, in the trader's own words ---- */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Your entry model</CardTitle>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
              Describe how you take a trade, in a few plain steps. No categories, no
              dropdown — your words.
            </p>
          </div>
          <PenLine className="size-4 shrink-0 text-ink-faint" aria-hidden />
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          {planLoading ? (
            <Skeleton className="h-28 rounded-[10px]" />
          ) : (
            <>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                placeholder={
                  '1. Wait for London to sweep the Asia high or low\n2. Drop to 5m and wait for a reclaim\n3. Enter on the retest, stop past the sweep'
                }
                aria-label="Entry model note"
              />
              <div className="flex items-center gap-2">
                <Button variant="primary" size="sm" onClick={saveNote} disabled={!dirty || saving}>
                  {saving && <Loader2 className="animate-spin" aria-hidden />}
                  {plan ? 'Update note' : 'Save note'}
                </Button>
                {!dirty && plan && (
                  <span className="text-[12px] text-ink-faint">Saved</span>
                )}
              </div>
            </>
          )}

          {diff.length > 0 && (
            <>
              <Divider className="my-1" />
              <div className="flex flex-col gap-2">
                <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-faint">
                  <Sparkles className="size-3" aria-hidden />
                  Your words vs your trades
                </span>
                {diff.map((d, i) => (
                  <p
                    key={i}
                    className={cn(
                      'flex gap-2 text-[13px] leading-relaxed',
                      d.kind === 'drift' ? 'text-caution' : 'text-ink-dim',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-[7px] size-1.5 shrink-0 rounded-full',
                        d.kind === 'match' && 'bg-win',
                        d.kind === 'drift' && 'bg-caution',
                        d.kind === 'neutral' && 'bg-ink-faint',
                      )}
                      aria-hidden
                    />
                    {d.line}
                  </p>
                ))}
              </div>
            </>
          )}
        </CardBody>
      </Card>
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
