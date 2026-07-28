import { useEffect, useMemo, useState } from 'react'
import { Gauge, Lock, LogOut, Mail, Palette, ShieldCheck, Zap } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Field, Input, NumberInput } from '#/components/ui/field'
import { RadioCard, RadioGroup, SegmentedGroup, SegmentedItem, SegmentedShell, Switch } from '#/components/ui/toggles'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { Badge, Card, CardBody, CardHeader, CardTitle, Divider, PageTitle } from '#/components/ui/primitives'
import { toast } from '#/components/ui/toast'
import { useAuth } from '#/lib/auth'
import { daysUntilExpiry } from '#/lib/session'
import { flags } from '#/lib/env'
import { CURRENCIES } from '#/lib/currencies'
import { AccountsCard } from '#/components/settings/accounts-card'
import { AccountStandingCard } from '#/components/settings/account-standing-card'
import { StrategiesCard } from '#/components/settings/strategies-card'
import { SessionsCard } from '#/components/settings/sessions-card'
import { IdeaBox } from '#/components/feedback/idea-box'
import { useFeedback } from '#/lib/use-feedback'
import { useTrades } from '#/lib/use-trades'
import { useJournals } from '#/lib/use-journals'
import { isAllJournals } from '#/lib/journals'
import { accountStanding, riskAllowance } from '#/lib/balance'
import { sessionWindowsOf } from '#/lib/sessions'
import { timeFormatOf } from '#/lib/clock'
import { cn } from '#/components/ui/cn'
import { formatMoney } from '#/lib/calc'
import { usePeriodPlan } from '#/lib/use-period-plan'
import { ruleLockReason, rulesLocked } from '#/lib/strategies'
import { today } from '#/lib/dates'
import type { EntryDetailLevel } from '#/lib/types'

/**
 * Settings (§6). Everything chosen at onboarding is here, in the same words,
 * so "editable later" is discoverable rather than merely technically true.
 */
export function SettingsPage() {
  const { user, profile, updatePrefs, signOutNow } = useAuth()
  const prefs = profile?.prefs
  // Rules belong to the account being journalled, not to the person — the same
  // 1% means different money on a 50k and a 100k account.
  const { active: account, patch: patchJournal } = useJournals()

  /*
    Rules freeze once the week's first trade is logged. Without that, a trader
    who exceeds their 1% limit can simply raise the limit and make the
    violation disappear — which is editing the evidence, not journalling.
  */
  const sessionWindows = useMemo(() => sessionWindowsOf(prefs), [prefs])

  const { plan } = usePeriodPlan(today())
  const locked = rulesLocked(plan, account.id)
  const lockNote = ruleLockReason(plan, account.id)
  const { trades } = useTrades()
  const feedback = useFeedback(trades)

  const [maxRisk, setMaxRisk] = useState('')
  const [pairs, setPairs] = useState('')
  const [maxTrades, setMaxTrades] = useState('')
  const [accountSize, setAccountSize] = useState('')
  const [noWeekends, setNoWeekends] = useState(false)
  const [allowedSessions, setAllowedSessions] = useState<string[]>([])
  const [windowStart, setWindowStart] = useState('')
  const [windowEnd, setWindowEnd] = useState('')
  const [savingRules, setSavingRules] = useState(false)

  /*
    What the percentage actually costs, live as it is typed. "1%" is abstract;
    "$500 per trade" is the number a trader can sanity-check against how they
    actually size.
  */
  const standing = useMemo(() => accountStanding(account, trades), [account, trades])
  const riskBasisLive = account.riskBasis
  const liveRisk = useMemo(() => {
    const pct = Number.parseFloat(maxRisk)
    if (!Number.isFinite(pct) || pct <= 0) return null
    return riskAllowance(standing, pct)
  }, [standing, maxRisk])


  useEffect(() => {
    setMaxRisk(account.riskRules.maxRiskPerTradePct?.toString() ?? '')
    setPairs((account.riskRules.allowedPairs ?? []).join(', '))
    setMaxTrades(account.riskRules.maxTradesPerDay?.toString() ?? '')
    setAccountSize(account.startingBalance?.toString() ?? '')
    setNoWeekends(account.riskRules.noWeekendTrading === true)
    setAllowedSessions(account.riskRules.allowedSessionIds ?? [])
    setWindowStart(account.riskRules.tradingWindow?.start ?? '')
    setWindowEnd(account.riskRules.tradingWindow?.end ?? '')
  }, [account])

  if (!profile || !prefs) return null

  const setLevel = async (level: EntryDetailLevel) => {
    try {
      await updatePrefs({ entryDetailLevel: level })
      toast.success(
        level === 'detailed' ? 'Detailed fields switched on' : 'Back to the quick form',
      )
    } catch {
      toast.error("Couldn't save that")
    }
  }

  const saveRules = async () => {
    if (!user) return
    setSavingRules(true)
    try {
      const risk = Number.parseFloat(maxRisk)
      const cap = Number.parseInt(maxTrades, 10)
      const size = Number.parseFloat(accountSize)
      const allowed = pairs
        .split(/[,\s]+/)
        .map((p) => p.trim().toUpperCase())
        .filter(Boolean)

      await patchJournal(account.id, {
        startingBalance: Number.isFinite(size) && size > 0 ? size : undefined,
        riskRules: {
          ...(Number.isFinite(risk) && risk > 0 ? { maxRiskPerTradePct: risk } : {}),
          ...(allowed.length > 0 ? { allowedPairs: allowed } : {}),
          ...(Number.isFinite(cap) && cap > 0 ? { maxTradesPerDay: cap } : {}),
          ...(noWeekends ? { noWeekendTrading: true } : {}),
          ...(allowedSessions.length > 0 ? { allowedSessionIds: allowedSessions } : {}),
          ...(windowStart && windowEnd
            ? { tradingWindow: { start: windowStart, end: windowEnd } }
            : {}),
        },
      })
      toast.success(`Rules updated for ${account.name}`, {
        description: 'They apply to trades you log from now on.',
      })
    } catch (e) {
      console.error('[settings] rules save failed:', e)
      toast.error("Couldn't save your rules")
    } finally {
      setSavingRules(false)
    }
  }

  const remaining = daysUntilExpiry(profile.lastActiveAt)

  return (
    <div className="flex max-w-2xl flex-col gap-4 sm:gap-5">
      <PageTitle eyebrow="Settings" title="Preferences" />

      <AccountStandingCard />

      <AccountsCard />

      <StrategiesCard />

      <SessionsCard />

      {/* ---- entry detail level ---- */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>How much you log</CardTitle>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
              The only setting that changes the entry form. Switch any time — nothing
              you've already logged is touched.
            </p>
          </div>
        </CardHeader>
        <CardBody>
          <RadioGroup
            value={prefs.entryDetailLevel}
            onValueChange={(v) => void setLevel(v as EntryDetailLevel)}
            className="flex flex-col gap-2.5"
            aria-label="Entry detail level"
          >
            <RadioCard
              value="minimal"
              title="Just wins and losses"
              description="Date, pair, result. Four taps."
              icon={<Zap className="size-4" aria-hidden />}
            />
            <RadioCard
              value="detailed"
              title="Lot size and risk too"
              description="Adds size, entry, exit, stop — and unlocks R-multiples and expectancy."
              icon={<Gauge className="size-4" aria-hidden />}
            />
          </RadioGroup>
        </CardBody>
      </Card>

      {/* ---- risk rules ---- */}
      {!isAllJournals(account.id) && (
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Rules for {account.name}</CardTitle>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
              We note when a trade falls outside these and show you the pattern in your
              review. We never block a save. Each account has its own set.
            </p>
            {lockNote && (
              <p className="mt-2 flex items-start gap-2 rounded-lg border border-caution/25 bg-caution-wash px-2.5 py-2 text-[12px] leading-relaxed text-caution">
                <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {lockNote}
              </p>
            )}
          </div>
          <ShieldCheck className="size-4 shrink-0 text-ink-faint" aria-hidden />
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Max risk per trade"
              optional
              hint={
                liveRisk === null
                  ? "Add a balance and we'll show what this is in money."
                  : `${formatMoney(liveRisk, { currency: account.currency, signed: false })} a trade — ${maxRisk}% of your ${
                      riskBasisLive === 'current' ? 'balance' : 'deposit'
                    }.`
              }
            >
              {(id) => (
                <NumberInput
                  id={id}
                  affix="%"
                  placeholder="1"
                  value={maxRisk}
                disabled={locked}
                  onChange={(e) => setMaxRisk(e.target.value)}
                />
              )}
            </Field>
            <Field
              label="Account balance"
              optional
              hint="What risk percentages are measured against."
            >
              {(id) => (
                <NumberInput
                  id={id}
                  placeholder="50000"
                  value={accountSize}
                disabled={locked}
                  onChange={(e) => setAccountSize(e.target.value)}
                />
              )}
            </Field>
          </div>

          <Field label="Pairs you trade" optional hint="Comma separated. Leave blank for no limit.">
            {(id) => (
              <Input
                id={id}
                placeholder="EURUSD, XAUUSD, US30"
                value={pairs}
                disabled={locked}
                onChange={(e) => setPairs(e.target.value)}
              />
            )}
          </Field>

          <Field label="Max trades per day" optional hint="A self-imposed cap, if you use one.">
            {(id) => (
              <NumberInput
                id={id}
                placeholder="3"
                value={maxTrades}
                disabled={locked}
                onChange={(e) => setMaxTrades(e.target.value)}
              />
            )}
          </Field>

          <Divider />

          {/*
            Which of your own sessions you actually trade. Saying "New York"
            and logging an Asian session is a real deviation, so it is noted
            in the review exactly like a pair outside your list.
          */}
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-medium text-ink-dim">Sessions you trade</span>
            <div className="flex flex-wrap gap-1.5">
              {sessionWindows.map((w) => {
                const on = allowedSessions.includes(w.id)
                return (
                  <button
                    key={w.id}
                    type="button"
                    disabled={locked}
                    onClick={() =>
                      setAllowedSessions((cur) =>
                        on ? cur.filter((x) => x !== w.id) : [...cur, w.id],
                      )
                    }
                    className={cn(
                      'inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 text-[13px] transition-colors',
                      on
                        ? 'border-accent bg-accent-wash text-ink'
                        : 'border-line bg-raised text-ink-dim hover:border-line-strong hover:text-ink',
                      locked && 'pointer-events-none opacity-50',
                    )}
                  >
                    {w.name}
                    <span className="text-[11px] text-ink-faint tnum">
                      {w.start}–{w.end}
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="text-xs leading-relaxed text-ink-muted">
              Leave all off for no limit. Trades outside these get noted in your review —
              never blocked. Edit the times themselves under “When you trade”.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="I trade from" optional>
              {(id) => (
                <Input
                  id={id}
                  type="time"
                  value={windowStart}
                  disabled={locked}
                  onChange={(e) => setWindowStart(e.target.value)}
                  className="px-2 text-[15px] sm:px-3 sm:text-sm"
                />
              )}
            </Field>
            <Field label="until" optional hint="Your own clock. Leave blank for no window.">
              {(id) => (
                <Input
                  id={id}
                  type="time"
                  value={windowEnd}
                  disabled={locked}
                  onChange={(e) => setWindowEnd(e.target.value)}
                  className="px-2 text-[15px] sm:px-3 sm:text-sm"
                />
              )}
            </Field>
          </div>

          <Divider />

          <label className="flex cursor-pointer items-start justify-between gap-4">
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-ink">
                I don't trade weekends
              </span>
              <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-muted">
                Saturday and Sunday trades get noted in your review. Leave this off if
                you trade crypto, which never closes.
              </span>
            </span>
            <Switch
              checked={noWeekends}
              onCheckedChange={setNoWeekends}
              aria-label="No weekend trading"
            />
          </label>

          <div>
            <Button
              variant="primary"
              size="sm"
              onClick={saveRules}
              disabled={savingRules || locked}
            >
              Save rules
            </Button>
          </div>
        </CardBody>
      </Card>
      )}

      {/* ---- cadence + currency ---- */}
      <Card>
        <CardHeader>
          <CardTitle>Journal</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-ink">Entry-model note</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-ink-muted">
                How often we ask you to describe your entry model.
              </p>
            </div>
            <SegmentedGroup
              type="single"
              value={prefs.planCadence}
              onValueChange={(v) => v && void updatePrefs({ planCadence: v as 'week' | 'month' })}
              aria-label="Note cadence"
              asChild
            >
              <SegmentedShell>
                <SegmentedItem value="week">Weekly</SegmentedItem>
                <SegmentedItem value="month">Monthly</SegmentedItem>
              </SegmentedShell>
            </SegmentedGroup>
          </div>

          <Divider />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-ink">Clock</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-ink-muted">
                How times are shown. Trades are stored the same either way, so
                switching never changes your data.
              </p>
            </div>
            <SegmentedGroup
              type="single"
              value={timeFormatOf(prefs)}
              onValueChange={(v) => v && void updatePrefs({ timeFormat: v as '12h' | '24h' })}
              aria-label="Time format"
              asChild
            >
              <SegmentedShell>
                <SegmentedItem value="24h">24h</SegmentedItem>
                <SegmentedItem value="12h">12h</SegmentedItem>
              </SegmentedShell>
            </SegmentedGroup>
          </div>

          <Divider />

          {/*
            Currency is a property of the account, not the person — a trader
            can run a USD prop account and a GBP personal one. Editing it here
            too would give two controls that disagree, so this one only sets
            the default a *new* account starts from.
          */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-ink">Default currency</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-ink-muted">
                Used by new accounts. {account.name} is in {account.currency} — change
                that under Accounts.
              </p>
            </div>
            <Select
              value={prefs.currency ?? 'USD'}
              onValueChange={(v) => void updatePrefs({ currency: v })}
            >
              <SelectTrigger className="w-32" aria-label="Default currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardBody>
      </Card>

      {/* ---- email ---- */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Evening check-in</CardTitle>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
              A short note on how the day went, on weekday evenings. Not a data dump.
            </p>
          </div>
          <Mail className="size-4 shrink-0 text-ink-faint" aria-hidden />
        </CardHeader>
        <CardBody>
          {flags.emailCheckIn ? (
            <label className="flex items-center justify-between gap-4">
              <span className="text-[13px] text-ink-dim">
                Email me at{' '}
                <span className="text-ink">{profile.email}</span>
              </span>
              <Switch
                checked={prefs.emailCheckInOptIn}
                onCheckedChange={(v) => void updatePrefs({ emailCheckInOptIn: v })}
                aria-label="Evening check-in email"
              />
            </label>
          ) : (
            <p className="text-[13px] leading-relaxed text-ink-muted">
              Not switched on for this deployment yet. When it is, it stays off until
              you turn it on here.
            </p>
          )}
        </CardBody>
      </Card>

      <IdeaBox onSend={(note) => feedback.send(undefined, note, 'idea')} />

      {/* ---- theme + session ---- */}
      <Card>
        <CardHeader>
          <CardTitle>Appearance &amp; session</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2.5 text-[13px] text-ink-dim">
              <Palette className="size-4 shrink-0 text-ink-faint" aria-hidden />
              Theme
            </span>
            <Badge tone="neutral" size="md">
              <Lock aria-hidden />
              Dark, deliberately
            </Badge>
          </div>
          <p className="-mt-1 text-[12px] leading-relaxed text-ink-muted">
            One considered palette, tuned so profit, loss and interactive elements never
            compete. A light mode would have to relitigate all three.
          </p>

          <Divider />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-ink">Signed in</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-ink-muted">
                You stay signed in until you sign out
                {remaining !== null && ` — or after 30 days idle, which is ${remaining} days away`}
                .
              </p>
            </div>
            <Button variant="danger" size="sm" onClick={() => void signOutNow()}>
              <LogOut aria-hidden />
              Sign out
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
