import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Calculator,
  Check,
  Hourglass,
  Link2,
  Loader2,
  Trash2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Button } from '#/components/ui/button'
import { Field, Input, NumberInput } from '#/components/ui/field'
import { SegmentedGroup, SegmentedItem, SegmentedShell } from '#/components/ui/toggles'
import { Badge, Divider } from '#/components/ui/primitives'
import { toast } from '#/components/ui/toast'
import { useAuth } from '#/lib/auth'
import { useJournals } from '#/lib/use-journals'
import { DEFAULT_JOURNAL_ID, isAllJournals } from '#/lib/journals'
import { useAppStore } from '#/store/app'
import { useTrades } from '#/lib/use-trades'
import { deleteTrade, saveTrade } from '#/lib/repo'
import { derive, formatMoney, formatR, isNum } from '#/lib/calc'
import { durationMinutes, formatDuration, isFuture, today } from '#/lib/dates'
import { computeRisk, riskBudgetFrom, suggestLotSize } from '#/lib/risk'
import { isCurated } from '#/lib/instruments'
import { useFxRate } from '#/lib/use-fx-rate'
import { PairCombobox } from '#/components/trades/pair-combobox'
import { RiskReadout } from '#/components/trades/risk-readout'
import { useStrategies } from '#/lib/use-strategies'
import { usePeriodPlan } from '#/lib/use-period-plan'
import { accountStanding, riskAllowance } from '#/lib/balance'
import { computeFromR } from '#/lib/rr'
import { RInput } from '#/components/trades/r-input'
import { ChartLinks } from '#/components/trades/chart-links'
import { chartsOf, normalizeChartUrl, timeframeVocabulary } from '#/lib/charts'
import { sessionWindowsOf } from '#/lib/sessions'
import { StrategyPicker } from '#/components/trades/strategy-picker'
import { TagInput, tagVocabulary } from '#/components/trades/tag-input'
import type { ChartRef, Direction, Outcome, Trade, TradeDraft } from '#/lib/types'
import { cn } from '#/components/ui/cn'

/** Parse a user-typed number, tolerating blanks, commas and stray spaces. */
function num(v: string): number | undefined {
  const s = v.replace(/,/g, '').trim()
  if (!s) return undefined
  const n = Number.parseFloat(s)
  return Number.isFinite(n) ? n : undefined
}

/**
 * 'open' sits alongside the three results rather than in a separate mode,
 * because setting a limit and walking away is the same one-tap action as
 * logging a win — it just answers "what happened?" with "nothing yet".
 */
type ResultChoice = 'open' | 'win' | 'loss' | 'flat'

interface FormState {
  date: string
  time: string
  pair: string
  direction: Direction
  result: ResultChoice
  amount: string
  lotSize: string
  entryPrice: string
  exitPrice: string
  stopPrice: string
  targetPrice: string
  riskAmount: string
  rValue: string
  strategyId?: string
  manualPipValue: string
  closeDate: string
  closeTime: string
  charts: ChartRef[]
  reasonTags: string[]
  reason: string
  tags: string[]
}

const BLANK: FormState = {
  date: today(),
  time: '',
  pair: '',
  direction: 'buy',
  result: 'win',
  amount: '',
  lotSize: '',
  entryPrice: '',
  exitPrice: '',
  stopPrice: '',
  targetPrice: '',
  riskAmount: '',
  rValue: '',
  strategyId: undefined,
  manualPipValue: '',
  closeDate: '',
  closeTime: '',
  charts: [],
  reasonTags: [],
  reason: '',
  tags: [],
}

/** Local 'HH:mm' now — prefilled when resolving, so duration is one tap. */
function nowTime(d: Date = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * The entry form (§4).
 *
 * Design decision worth stating: outcome is a *tap*, and PnL is entered as a
 * plain positive amount. Asking someone to type a minus sign at the end of a
 * losing day is a small cruelty and a common source of sign errors. The store
 * still holds a signed number — we apply the sign from the tap.
 */
export function TradeEntrySheet() {
  const { user, profile } = useAuth()
  const { trades } = useTrades()
  const entryTarget = useAppStore((s) => s.entryTarget)
  const entryDate = useAppStore((s) => s.entryDate)
  const closeEntry = useAppStore((s) => s.closeEntry)
  const openReflection = useAppStore((s) => s.openReflection)

  const open = entryTarget !== null
  const editing = entryTarget !== null && entryTarget !== 'new' ? entryTarget : null
  const detailed = profile?.prefs.entryDetailLevel === 'detailed'
  const { active: account, journals } = useJournals()

  /*
    A trade must belong to a real account — risk means nothing otherwise. When
    the all-accounts lens is showing, fall back to the first real account so
    logging never silently writes to an id nothing owns.
  */
  const targetAccountId = isAllJournals(account.id)
    ? (journals[0]?.id ?? DEFAULT_JOURNAL_ID)
    : account.id
  const currency = account.currency
  const { active: strategies } = useStrategies()

  // One R is the account's own risk allowance, so R converts to real money
  // against the right balance and the right basis.
  const standing = useMemo(() => accountStanding(account, trades), [account, trades])
  const perR = useMemo(
    () => riskAllowance(standing, account.riskRules.maxRiskPerTradePct),
    [standing, account.riskRules.maxRiskPerTradePct],
  )
  const tagOptions = useMemo(() => tagVocabulary(trades), [trades])
  const knownTimeframes = useMemo(() => timeframeVocabulary(trades), [trades])
  const sessionWindows = useMemo(() => sessionWindowsOf(profile?.prefs), [profile?.prefs])


  const [form, setForm] = useState<FormState>(BLANK)
  const [busy, setBusy] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  // True once the trader picks the custom escape hatch, or when editing a
  // trade whose pair isn't in the curated list.
  const [customPair, setCustomPair] = useState(false)
  const pairRef = useRef<HTMLInputElement>(null)

  // Seed the form whenever the sheet opens, for a new trade or an edit.
  useEffect(() => {
    if (!open) return
    if (editing) {
      const wasOpen = editing.status === 'open'
      setForm({
        date: editing.date,
        time: editing.time ?? '',
        pair: editing.pair,
        direction: editing.direction,
        result: wasOpen ? 'open' : editing.outcome,
        amount: editing.pnl === 0 ? '' : String(Math.abs(editing.pnl)),
        lotSize: editing.lotSize?.toString() ?? '',
        entryPrice: editing.entryPrice?.toString() ?? '',
        exitPrice: editing.exitPrice?.toString() ?? '',
        stopPrice: editing.stopPrice?.toString() ?? '',
        targetPrice: editing.targetPrice?.toString() ?? '',
        riskAmount: editing.riskAmount?.toString() ?? '',
        manualPipValue: editing.pipValueUsed?.toString() ?? '',
        closeDate: editing.closeDate ?? '',
        closeTime: editing.closeTime ?? '',
        charts: chartsOf(editing),
        reasonTags: editing.reasonTags ?? [],
        reason: editing.reason ?? '',
        rValue:
          typeof editing.rMultiple === 'number' ? String(Math.abs(editing.rMultiple)) : '',
        strategyId: editing.strategyId,
        tags: editing.tags ?? [],
      })
      // Reopening a still-open trade is almost always to resolve it, so the
      // detail block starts expanded — the close time lives in there.
      setShowDetail(detailed || wasOpen)
      setCustomPair(!isCurated(editing.pair))
    } else {
      setForm({ ...BLANK, date: entryDate ?? today() })
      setShowDetail(detailed)
      setCustomPair(false)
    }
  }, [open, editing, entryDate, detailed])

  // Which strategies were declared for the period this trade falls in. Used
  // only to mark deviation — never to restrict what can be selected.
  const { plan } = usePeriodPlan(form.date)
  const plannedStrategyIds = plan?.strategyIds ?? []

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  /** Pairs this trader actually uses, most recent first — one tap to fill. */
  const recentPairs = useMemo(() => {
    const seen: string[] = []
    for (const t of trades) {
      const p = t.pair.toUpperCase()
      if (p && !seen.includes(p)) seen.push(p)
      if (seen.length >= 6) break
    }
    return seen
  }, [trades])

  const isOpen = form.result === 'open'

  /**
   * You cannot have traded tomorrow. Native `max` covers the picker, but a
   * typed date bypasses it, so the value is validated here too and the save
   * is blocked — a mis-dated trade silently distorts every statistic that
   * follows it.
   */
  const dateError = isFuture(form.date) ? "That date hasn't happened yet." : null

  /**
   * The close clock is worth asking for only when the trader is already
   * recording times — otherwise it is two more empty boxes on the fast path.
   */
  const showCloseClock =
    editing?.status === 'open' || form.time !== '' || form.closeTime !== ''

  /** Was this an open trade that the trader is now resolving? */
  const resolving = editing?.status === 'open' && !isOpen

  /**
   * R is the source of truth on the quick form; money on the detailed one.
   *
   * A trader logging minimally states "+2R" and the money follows from their
   * own risk allowance. A trader logging in detail has a real broker figure,
   * and that must always win over anything we derive.
   */
  const fromR = useMemo(
    () =>
      computeFromR({
        outcome: form.result === 'open' ? 'flat' : form.result,
        r: num(form.rValue),
        riskAmount: perR ?? undefined,
      }),
    [form.result, form.rValue, perR],
  )

  const signedAmount = useMemo(() => {
    if (isOpen) return 0
    const typed = num(form.amount)
    if (typed !== undefined) {
      const abs = Math.abs(typed)
      if (form.result === 'loss') return -abs
      if (form.result === 'flat') return 0
      return abs
    }
    // Nothing typed: fall back to what R implies, if it implies anything.
    return fromR.pnl ?? undefined
  }, [form.amount, form.result, isOpen, fromR.pnl])

  // Prefill the close clock the moment a result is picked, so recording the
  // duration costs nothing — but only once, so an edit never overwrites it.
  useEffect(() => {
    if (!resolving) return
    setForm((f) =>
      f.closeTime
        ? f
        : { ...f, closeDate: f.closeDate || today(), closeTime: nowTime() },
    )
  }, [resolving])

  const heldFor = useMemo(
    () =>
      durationMinutes({
        date: form.date,
        time: form.time || undefined,
        closeDate: form.closeDate || undefined,
        closeTime: form.closeTime || undefined,
      }),
    [form.date, form.time, form.closeDate, form.closeTime],
  )

  /* ---------------------------------------------------------------------
     Live risk calculator. Recomputes on every keystroke — it is pure and
     synchronous, so there is nothing to debounce. The only async part is the
     FX rate, and that only fires for a genuine cross.
     ------------------------------------------------------------------- */
  const accountCurrency = account.currency
  const fx = useFxRate(form.pair, accountCurrency)

  const risk = useMemo(
    () =>
      computeRisk({
        pair: form.pair,
        entryPrice: num(form.entryPrice),
        stopPrice: num(form.stopPrice),
        lotSize: num(form.lotSize),
        accountCurrency,
        accountSize: standing.riskBase ?? undefined,
        fxRate: fx.rate ?? undefined,
        manualPipValue: num(form.manualPipValue),
      }),
    [
      form.pair,
      form.entryPrice,
      form.stopPrice,
      form.lotSize,
      form.manualPipValue,
      accountCurrency,
      standing.riskBase ?? undefined,
      fx.rate,
    ],
  )

  const maxRiskPct = account.riskRules.maxRiskPerTradePct

  /** Lots that would land exactly on the trader's own risk limit. */
  const suggestedLots = useMemo(() => {
    const budget = riskBudgetFrom(standing.riskBase ?? undefined, maxRiskPct)
    if (budget === null) return null
    const lots = suggestLotSize({
      pair: form.pair,
      entryPrice: num(form.entryPrice),
      stopPrice: num(form.stopPrice),
      accountCurrency,
      accountSize: standing.riskBase ?? undefined,
      fxRate: fx.rate ?? undefined,
      manualPipValue: num(form.manualPipValue),
      riskBudget: budget,
    })
    // Don't offer a size they already have.
    return lots !== null && lots !== num(form.lotSize) ? lots : null
  }, [
    form.pair,
    form.entryPrice,
    form.stopPrice,
    form.lotSize,
    form.manualPipValue,
    accountCurrency,
    standing.riskBase ?? undefined,
    maxRiskPct,
    fx.rate,
  ])

  // Live calculator — only ever an offer, never an overwrite (§4).
  const computed = useMemo(
    () =>
      derive({
        pair: form.pair,
        direction: form.direction,
        entryPrice: num(form.entryPrice),
        exitPrice: num(form.exitPrice),
        stopPrice: num(form.stopPrice),
        lotSize: num(form.lotSize),
        riskAmount: num(form.riskAmount),
        accountSize: standing.riskBase ?? undefined,
      }),
    [form, standing.riskBase ?? undefined],
  )

  const canApply =
    isNum(computed.pnl) && (signedAmount === undefined || computed.pnl !== signedAmount)

  const applyComputed = () => {
    if (!isNum(computed.pnl)) return
    set('amount', String(Math.abs(computed.pnl)))
    set('result', computed.pnl > 0 ? 'win' : computed.pnl < 0 ? 'loss' : 'flat')
  }

  // An open trade needs only a pair and a date — that is the entire point of
  // being able to log it before you know how it went.
  const valid = !dateError &&
    form.pair.trim().length > 0 &&
    form.date.length === 10 &&
    (isOpen || signedAmount !== undefined)

  const save = async () => {
    if (!user || !valid || signedAmount === undefined) return
    setBusy(true)
    try {
      const sameDayTradeCount = trades.filter(
        (t) => t.date === form.date && t.id !== editing?.id,
      ).length

      // Empty rows are just an abandoned "add another"; a broken URL is kept
      // out rather than stored as something that won't open.
      const cleanedCharts = form.charts
        .map((c) => ({ ...c, url: normalizeChartUrl(c.url) ?? '' }))
        .filter((c) => c.url !== '')

      const draft: TradeDraft = {
        date: form.date,
        time: form.time || undefined,
        pair: form.pair.trim().toUpperCase(),
        direction: form.direction,
        status: isOpen ? 'open' : 'closed',
        outcome: isOpen ? 'flat' : (form.result as Outcome),
        pnl: signedAmount,
        lotSize: num(form.lotSize),
        entryPrice: num(form.entryPrice),
        exitPrice: num(form.exitPrice),
        stopPrice: num(form.stopPrice),
        targetPrice: num(form.targetPrice),
        // Risk snapshot (§7): what the calculator actually used, so a later
        // change to a contract-size default never rewrites this trade.
        riskAmount: num(form.riskAmount) ?? risk.riskAmount ?? undefined,
        riskPct: risk.riskPct ?? undefined,
        pipValueUsed: risk.pipValueUsed ?? undefined,
        calcMode: risk.mode,
        rMultiple: undefined,
        // Close clock is meaningless on a trade that hasn't closed.
        closeDate: isOpen ? undefined : form.closeDate || undefined,
        closeTime: isOpen ? undefined : form.closeTime || undefined,
        charts: cleanedCharts.length > 0 ? cleanedCharts : undefined,
        reasonTags: form.reasonTags.length > 0 ? form.reasonTags : undefined,
        strategyId: form.strategyId,
        reason: form.reason.trim() || undefined,
        tags: form.tags,
      }

      const savedId = await saveTrade(
        user.uid,
        targetAccountId,
        draft,
        {
          rules: account.riskRules,
          plannedStrategyIds,
          strategyNameOf: (id) => strategies.find((x) => x.id === id)?.name,
          sessionWindows,
          accountSize: standing.riskBase ?? undefined,
          sameDayTradeCount,
        },
        editing?.id,
      )

      // Confirmation is neutral, whatever the outcome. We don't congratulate
      // wins or commiserate losses — the journal has no opinion (§0).
      toast.success(
        resolving ? 'Resolved' : editing ? 'Trade updated' : isOpen ? 'Logged as open' : 'Logged',
      )
      closeEntry()

      /*
        The reflection step, asked only once the trade is safely stored and
        only for a finished one — there is nothing to reflect on while it is
        still running. Editing skips it too, since the note is already there.
      */
      if (!editing && !isOpen && signedAmount !== undefined) {
        openReflection({
          ...(draft as unknown as Trade),
          id: savedId,
          journalId: targetAccountId,
          createdAt: Date.now(),
        })
      }
    } catch (e) {
      console.error('[trade] save failed:', e)
      const code = (e as { code?: string })?.code
      toast.error("Couldn't save that trade", {
        description:
          code === 'permission-denied'
            ? 'Your account does not have write access yet.'
            : 'Nothing was lost — your details are still here. Try again.',
        duration: 6000,
      })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!user || !editing) return
    setBusy(true)
    try {
      await deleteTrade(user.uid, editing.id)
      toast.success('Trade removed')
      closeEntry()
    } catch {
      toast.error("Couldn't remove that trade")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeEntry()}>
      <DialogContent
        size="md"
        onOpenAutoFocus={(e) => {
          // Focus the pair field, not the close button — this form exists to
          // be filled in fast.
          e.preventDefault()
          pairRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {resolving ? 'How did it end?' : editing ? 'Edit trade' : 'Log a trade'}
          </DialogTitle>
          <p className="text-[13px] text-ink-muted">
            Only the pair and the result are required. Everything else can stay blank.
          </p>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-5">
          {/* ---- result, including "not yet" ---- */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink-dim">Result</span>
            <SegmentedGroup
              type="single"
              value={form.result}
              onValueChange={(v) => v && set('result', v as ResultChoice)}
              aria-label="Result"
              asChild
            >
              <SegmentedShell className="w-full">
                <SegmentedItem value="open">
                  <Hourglass aria-hidden className="size-3.5" />
                  <span className="hidden sm:inline">Still open</span>
                  <span className="sm:hidden">Open</span>
                </SegmentedItem>
                <SegmentedItem value="win" tone="win">
                  <TrendingUp aria-hidden className="size-3.5" />
                  Win
                </SegmentedItem>
                <SegmentedItem value="loss" tone="loss">
                  <TrendingDown aria-hidden className="size-3.5" />
                  Loss
                </SegmentedItem>
                <SegmentedItem value="flat">BE</SegmentedItem>
              </SegmentedShell>
            </SegmentedGroup>
            {isOpen && (
              <p className="text-xs leading-relaxed text-ink-muted">
                Log it now and come back when it closes. Open trades stay out of your
                stats until they have a result.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Pair">
              {(id) =>
                customPair ? (
                  <Input
                    id={id}
                    ref={pairRef}
                    placeholder="US30"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    value={form.pair}
                    onChange={(e) => set('pair', e.target.value)}
                  />
                ) : (
                  <PairCombobox
                    id={id}
                    value={form.pair}
                    recent={recentPairs}
                    onChange={(symbol) => {
                      set('pair', symbol)
                      setCustomPair(false)
                    }}
                    onCustom={() => {
                      setCustomPair(true)
                      set('pair', '')
                      requestAnimationFrame(() => pairRef.current?.focus())
                    }}
                  />
                )
              }
            </Field>
            {isOpen ? (
              <Field
              label="Target"
              optional
              tip="The price you're hoping to close at for a profit."
            >
                {(id) => (
                  <NumberInput
                    id={id}
                    placeholder="1.0900"
                    value={form.targetPrice}
                    onChange={(e) => set('targetPrice', e.target.value)}
                  />
                )}
              </Field>
            ) : (
              detailed ? (
                <Field label={form.result === 'loss' ? 'Amount lost' : 'Amount made'}>
                  {(id) => (
                    <NumberInput
                      id={id}
                      prefix={form.result === 'loss' ? '−' : '+'}
                      placeholder="0.00"
                      value={form.amount}
                      onChange={(e) => set('amount', e.target.value)}
                      disabled={form.result === 'flat'}
                    />
                  )}
                </Field>
              ) : (
                <Field
                  label="How much"
                  tip="In R — how many times your risk you made. A stop that gets hit is exactly 1R, so a loss needs nothing typed."
                >
                  {(id) => (
                    <RInput
                      id={id}
                      outcome={form.result === 'open' ? 'flat' : form.result}
                      value={form.rValue}
                      onChange={(v) => set('rValue', v)}
                      riskAmount={perR}
                      currency={currency}
                    />
                  )}
                </Field>
              )
            )}
          </div>

          {customPair && (
            <button
              type="button"
              onClick={() => {
                setCustomPair(false)
                set('manualPipValue', '')
              }}
              className="-mt-2 self-start text-[12px] text-accent-bright underline-offset-2 hover:underline"
            >
              ← Back to the pair list
            </button>
          )}

          {!customPair && recentPairs.length > 0 && (
            <div className="-mt-2 flex flex-wrap gap-1.5">
              {recentPairs.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => set('pair', p)}
                  className={cn(
                    'h-8 rounded-lg border border-line bg-raised px-2.5 text-[12px] text-ink-dim',
                    'transition-colors duration-150 hover:border-accent-edge hover:text-ink',
                    form.pair.toUpperCase() === p && 'border-accent-edge bg-accent-wash text-ink',
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label={isOpen ? 'Opened' : 'Date'}>
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  value={form.date}
                  onChange={(e) => set('date', e.target.value)}
                  className="px-2 text-[15px] sm:px-3 sm:text-sm [&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:invert"
                />
              )}
            </Field>
            <Field
              label="Time"
              optional
              tip="Roughly when you opened it. Lets us show which session you trade best."
            >
              {(id) => (
                <Input
                  id={id}
                  type="time"
                  value={form.time}
                  onChange={(e) => set('time', e.target.value)}
                  className="px-2 text-[15px] sm:px-3 sm:text-sm [&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:invert"
                />
              )}
            </Field>
          </div>

          {/* ---- close clock: only once it is actually meaningful ---- */}
          {!isOpen && showCloseClock && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Closed" optional>
                  {(id) => (
                    <Input
                      id={id}
                      type="date"
                      value={form.closeDate}
                      onChange={(e) => set('closeDate', e.target.value)}
                      className="px-2 text-[15px] sm:px-3 sm:text-sm [&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:invert"
                    />
                  )}
                </Field>
                <Field label="Close time" optional>
                  {(id) => (
                    <Input
                      id={id}
                      type="time"
                      value={form.closeTime}
                      onChange={(e) => set('closeTime', e.target.value)}
                      className="px-2 text-[15px] sm:px-3 sm:text-sm [&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:invert"
                    />
                  )}
                </Field>
              </div>
              {heldFor !== null && (
                <p className="flex items-center gap-1.5 text-xs text-ink-muted">
                  <Hourglass className="size-3.5 shrink-0" aria-hidden />
                  Held for{' '}
                  <span className="font-medium text-ink-dim">{formatDuration(heldFor)}</span>
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink-dim">Direction</span>
            <SegmentedGroup
              type="single"
              value={form.direction}
              onValueChange={(v) => v && set('direction', v as Direction)}
              aria-label="Direction"
              asChild
            >
              <SegmentedShell className="w-full">
                <SegmentedItem value="buy">Buy</SegmentedItem>
                <SegmentedItem value="sell">Sell</SegmentedItem>
              </SegmentedShell>
            </SegmentedGroup>
          </div>

          <Field
            label="Strategy"
            optional
            tip="Which of your setups this was. Naming it is what lets the review tell you which setups actually make money."
          >
            {() => (
              <StrategyPicker
                strategies={strategies}
                value={form.strategyId}
                onChange={(id) => set('strategyId', id)}
                plannedIds={plannedStrategyIds}
              />
            )}
          </Field>

          {/* ---- detailed fields ---- */}
          {detailed && (
            <>
              <Divider />
              {!showDetail ? (
                <button
                  type="button"
                  onClick={() => setShowDetail(true)}
                  className="flex min-h-11 items-center justify-between rounded-xl border border-dashed border-line px-3.5 text-left text-[13px] text-ink-dim transition-colors hover:border-line-strong hover:bg-raised"
                >
                  Add size and prices
                  <span className="text-[11px] uppercase tracking-wider text-ink-faint">
                    optional
                  </span>
                </button>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Field
                      label="Lot size"
                      optional
                      tip="How big the trade is. Bigger size means every point of movement is worth more money."
                    >
                      {(id) => (
                        <NumberInput
                          id={id}
                          placeholder="0.10"
                          value={form.lotSize}
                          onChange={(e) => set('lotSize', e.target.value)}
                        />
                      )}
                    </Field>
                    <Field
              label="Risk"
              optional
              tip="The most you're willing to lose on this trade. Leave it blank and we work it out from your stop."
            >
                      {(id) => (
                        <NumberInput
                          id={id}
                          prefix="$"
                          placeholder="100"
                          value={form.riskAmount}
                          onChange={(e) => set('riskAmount', e.target.value)}
                        />
                      )}
                    </Field>
                  </div>

                  {/* Manual mode: one honest ask, instead of faking support. */}
                  {customPair && (
                    <Field
                      label="Value per point, per lot"
                      hint={`What a one-point move is worth per lot, in ${accountCurrency}.`}
                    >
                      {(id) => (
                        <NumberInput
                          id={id}
                          prefix="$"
                          placeholder="10"
                          value={form.manualPipValue}
                          onChange={(e) => set('manualPipValue', e.target.value)}
                        />
                      )}
                    </Field>
                  )}

                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    <Field
                      label="Entry"
                      optional
                      tip="The price you got in at."
                    >
                      {(id) => (
                        <NumberInput
                          id={id}
                          placeholder="1.0850"
                          value={form.entryPrice}
                          onChange={(e) => set('entryPrice', e.target.value)}
                        />
                      )}
                    </Field>
                    <Field
                      label="Exit"
                      optional
                      tip="The price you actually closed at."
                    >
                      {(id) => (
                        <NumberInput
                          id={id}
                          placeholder="1.0870"
                          value={form.exitPrice}
                          onChange={(e) => set('exitPrice', e.target.value)}
                        />
                      )}
                    </Field>
                    <Field
                      label="Stop"
                      optional
                      tip="The price where you'd give up and close for a loss. This is what tells us your risk."
                    >
                      {(id) => (
                        <NumberInput
                          id={id}
                          placeholder="1.0840"
                          value={form.stopPrice}
                          onChange={(e) => set('stopPrice', e.target.value)}
                        />
                      )}
                    </Field>
                  </div>

                  {/*
                    The risk readout — the loudest thing in the form (§0). It
                    sits directly under the levels that drive it so cause and
                    effect are adjacent.
                  */}
                  <RiskReadout
                    result={risk}
                    currency={accountCurrency}
                    maxRiskPct={maxRiskPct}
                    suggestedLots={suggestedLots}
                    suggestedRisk={riskBudgetFrom(standing.riskBase ?? undefined, maxRiskPct)}
                    onUseSuggested={(lots) => set('lotSize', String(lots))}
                    rateFetchedAt={fx.fetchedAt}
                    rateStale={fx.stale}
                  />

                  {/* ---- P&L / R calculator: a quieter, secondary readout ---- */}
                  {(isNum(computed.pnl) || isNum(computed.rMultiple)) && !isOpen && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-raised px-3.5 py-3">
                      <Calculator className="size-4 shrink-0 text-ink-muted" aria-hidden />
                      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                        {isNum(computed.pnl) && (
                          <span className="text-[13px] text-ink-dim">
                            PnL{' '}
                            <span className="font-medium text-ink tnum">
                              {formatMoney(computed.pnl, { currency })}
                            </span>
                          </span>
                        )}
                        {isNum(computed.rMultiple) && (
                          <span className="text-[13px] text-ink-dim">
                            R{' '}
                            <span className="font-medium text-ink tnum">
                              {formatR(computed.rMultiple)}
                            </span>
                          </span>
                        )}
                      </div>
                      {canApply && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="ml-auto h-8 text-accent-bright hover:text-accent-bright"
                          onClick={applyComputed}
                        >
                          <Check aria-hidden />
                          Use this
                        </Button>
                      )}
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field
                      label="Charts"
                      optional
                      tip="Every screenshot from your analysis — the daily for context, the H4 for the level, the entry timeframe. Tag each with its timeframe and, if you like, the bias you read on it."
                      className="sm:col-span-2"
                    >
                      {() => (
                        <ChartLinks
                          value={form.charts}
                          onChange={(c) => set('charts', c)}
                          known={knownTimeframes}
                        />
                      )}
                    </Field>
                  </div>
                </div>
              )}
            </>
          )}

          <Divider />

          {/*
            Same field, same weight, whether it won or lost (§4). No separate
            "what went wrong" UI — that framing turns a journal into a
            confessional.
          */}
          <Field
            label="Tags"
            optional
            tip="Short labels like 'breakout' or 'london'. We show which of your tagged setups actually wins."
          >
            {(id) => (
              <TagInput
                id={id}
                value={form.tags}
                onChange={(tags) => set('tags', tags)}
                suggestions={tagOptions}
              />
            )}
          </Field>

          {editing && (editing.beforeChartUrl || editing.afterChartUrl) && (
            <div className="flex flex-wrap gap-2">
              {editing.beforeChartUrl && (
                <Badge tone="neutral" size="md">
                  <Link2 aria-hidden /> Before chart saved
                </Badge>
              )}
              {editing.afterChartUrl && (
                <Badge tone="neutral" size="md">
                  <Link2 aria-hidden /> After chart saved
                </Badge>
              )}
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          {editing && (
            <Button
              variant="danger"
              onClick={remove}
              disabled={busy}
              className="sm:mr-auto"
            >
              <Trash2 aria-hidden />
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={closeEntry} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={!valid || busy}>
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            {resolving ? 'Resolve trade' : editing ? 'Save changes' : isOpen ? 'Log as open' : 'Log it'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
