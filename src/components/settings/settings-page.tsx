import { useEffect, useState } from 'react'
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
import type { EntryDetailLevel } from '#/lib/types'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'AUD', 'CAD', 'JPY', 'CHF', 'ZAR', 'INR']

/**
 * Settings (§6). Everything chosen at onboarding is here, in the same words,
 * so "editable later" is discoverable rather than merely technically true.
 */
export function SettingsPage() {
  const { profile, updatePrefs, signOutNow } = useAuth()
  const prefs = profile?.prefs

  const [maxRisk, setMaxRisk] = useState('')
  const [pairs, setPairs] = useState('')
  const [maxTrades, setMaxTrades] = useState('')
  const [accountSize, setAccountSize] = useState('')
  const [savingRules, setSavingRules] = useState(false)

  useEffect(() => {
    if (!prefs) return
    setMaxRisk(prefs.riskRules.maxRiskPerTradePct?.toString() ?? '')
    setPairs((prefs.riskRules.allowedPairs ?? []).join(', '))
    setMaxTrades(prefs.riskRules.maxTradesPerDay?.toString() ?? '')
    setAccountSize(prefs.accountSize?.toString() ?? '')
  }, [prefs])

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
    setSavingRules(true)
    try {
      const risk = Number.parseFloat(maxRisk)
      const cap = Number.parseInt(maxTrades, 10)
      const size = Number.parseFloat(accountSize)
      const allowed = pairs
        .split(/[,\s]+/)
        .map((p) => p.trim().toUpperCase())
        .filter(Boolean)

      await updatePrefs({
        riskRules: {
          ...(Number.isFinite(risk) && risk > 0 ? { maxRiskPerTradePct: risk } : {}),
          ...(allowed.length > 0 ? { allowedPairs: allowed } : {}),
          ...(Number.isFinite(cap) && cap > 0 ? { maxTradesPerDay: cap } : {}),
        },
        ...(Number.isFinite(size) && size > 0 ? { accountSize: size } : {}),
      })
      toast.success('Rules updated', {
        description: 'They apply to trades you log from now on.',
      })
    } catch {
      toast.error("Couldn't save your rules")
    } finally {
      setSavingRules(false)
    }
  }

  const remaining = daysUntilExpiry(profile.lastActiveAt)

  return (
    <div className="flex max-w-2xl flex-col gap-4 sm:gap-5">
      <PageTitle eyebrow="Settings" title="Preferences" />

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
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Your rules</CardTitle>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
              We note when a trade falls outside these and show you the pattern in your
              review. We never block a save.
            </p>
          </div>
          <ShieldCheck className="size-4 shrink-0 text-ink-faint" aria-hidden />
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Max risk per trade" optional>
              {(id) => (
                <NumberInput
                  id={id}
                  affix="%"
                  placeholder="1"
                  value={maxRisk}
                  onChange={(e) => setMaxRisk(e.target.value)}
                />
              )}
            </Field>
            <Field
              label="Account size"
              optional
              hint="Lets us turn a risk amount into a percentage."
            >
              {(id) => (
                <NumberInput
                  id={id}
                  prefix="$"
                  placeholder="10000"
                  value={accountSize}
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
                onChange={(e) => setMaxTrades(e.target.value)}
              />
            )}
          </Field>

          <div>
            <Button variant="primary" size="sm" onClick={saveRules} disabled={savingRules}>
              Save rules
            </Button>
          </div>
        </CardBody>
      </Card>

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
              <p className="text-[13px] font-medium text-ink">Currency</p>
              <p className="mt-0.5 text-[12px] text-ink-muted">How P&amp;L is displayed.</p>
            </div>
            <Select
              value={prefs.currency ?? 'USD'}
              onValueChange={(v) => void updatePrefs({ currency: v })}
            >
              <SelectTrigger className="w-32" aria-label="Currency">
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
