import { useState } from 'react'
import { ArrowRight, Gauge, Mail, ShieldCheck, Zap } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Field, Input, NumberInput } from '#/components/ui/field'
import { RadioCard, RadioGroup, Switch } from '#/components/ui/toggles'
import { Mark } from '#/components/app/mark'
import { toast } from '#/components/ui/toast'
import { useAuth } from '#/lib/auth'
import { completeOnboarding } from '#/lib/repo'
import { flags } from '#/lib/env'
import type { EntryDetailLevel } from '#/lib/types'
import { cn } from '#/components/ui/cn'

/**
 * §3: one screen, one choice that matters.
 *
 * The risk rule and the email opt-in are on the same screen but visually
 * subordinate and genuinely skippable — burying the detail-level choice inside
 * a multi-step wizard is exactly what the spec forbids, and adding two more
 * *required* steps would be the same mistake wearing a different hat.
 */
export function Onboarding() {
  const { user, profile, refreshProfile } = useAuth()
  const [level, setLevel] = useState<EntryDetailLevel>(
    profile?.prefs.entryDetailLevel ?? 'minimal',
  )
  const [showOptional, setShowOptional] = useState(false)
  const [maxRisk, setMaxRisk] = useState('')
  const [pairs, setPairs] = useState('')
  const [emailOptIn, setEmailOptIn] = useState(false)
  const [busy, setBusy] = useState(false)

  const finish = async () => {
    if (!user) return
    setBusy(true)
    try {
      const parsedRisk = Number.parseFloat(maxRisk)
      const allowed = pairs
        .split(/[,\s]+/)
        .map((p) => p.trim().toUpperCase())
        .filter(Boolean)

      await completeOnboarding(user.uid, {
        entryDetailLevel: level,
        emailCheckInOptIn: emailOptIn,
        riskRules: {
          ...(Number.isFinite(parsedRisk) && parsedRisk > 0
            ? { maxRiskPerTradePct: parsedRisk }
            : {}),
          ...(allowed.length > 0 ? { allowedPairs: allowed } : {}),
        },
      })
      await refreshProfile()
    } catch {
      toast.error("Couldn't save that", { description: 'Have another go in a moment.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mesh grain min-h-dvh px-5 py-10 sm:py-16">
      <div className="mx-auto w-full max-w-lg">
        <div className="stagger" style={{ '--i': 0 } as React.CSSProperties}>
          <Mark className="size-9" />
          <h1 className="mt-6 font-display text-[28px] leading-tight text-ink sm:text-4xl">
            How much do you want to log?
          </h1>
          <p className="mt-2.5 text-sm leading-relaxed text-ink-muted">
            This is the only setting that changes what the entry form asks you for.
            Pick the one you'll actually keep up with — you can change it any time in
            Settings.
          </p>
        </div>

        <RadioGroup
          value={level}
          onValueChange={(v) => setLevel(v as EntryDetailLevel)}
          className="mt-7 flex flex-col gap-3"
          aria-label="Entry detail level"
        >
          <div className="stagger" style={{ '--i': 1 } as React.CSSProperties}>
            <RadioCard
              value="minimal"
              title="Just wins and losses"
              description="Date, pair, and what it made or cost. Four taps and you're done. Most people should start here."
              icon={<Zap className="size-4" aria-hidden />}
            />
          </div>
          <div className="stagger" style={{ '--i': 2 } as React.CSSProperties}>
            <RadioCard
              value="detailed"
              title="Lot size and risk too"
              description="Adds size, entry, exit and stop — and unlocks R-multiples, expectancy and risk-rule tracking. Every extra field is still optional."
              icon={<Gauge className="size-4" aria-hidden />}
            />
          </div>
        </RadioGroup>

        {/* Optional extras — collapsed by default, one tap to open, always skippable. */}
        <div className="stagger mt-6" style={{ '--i': 3 } as React.CSSProperties}>
          {!showOptional ? (
            <button
              type="button"
              onClick={() => setShowOptional(true)}
              className={cn(
                'flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-dashed border-line px-4 py-3 text-left',
                'transition-colors duration-200 hover:border-line-strong hover:bg-panel',
              )}
            >
              <span className="text-[13px] text-ink-dim">
                Set a risk rule or the daily check-in email
              </span>
              <span className="shrink-0 text-[11px] uppercase tracking-wider text-ink-faint">
                optional
              </span>
            </button>
          ) : (
            <div className="flex flex-col gap-5 rounded-xl border border-line bg-panel p-4 sm:p-5">
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden />
                <p className="text-[13px] leading-relaxed text-ink-muted">
                  We'll note when a trade goes outside these, and show you the pattern in
                  your weekly review. We'll never stop you logging it.
                </p>
              </div>

              <Field
                label="Max risk per trade"
                optional
                hint="Leave blank if you don't work to a fixed number."
              >
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
                label="Pairs you trade"
                optional
                hint="Comma separated. Anything outside this list gets noted, not blocked."
              >
                {(id) => (
                  <Input
                    id={id}
                    placeholder="EURUSD, XAUUSD, US30"
                    value={pairs}
                    onChange={(e) => setPairs(e.target.value)}
                  />
                )}
              </Field>

              {flags.emailCheckIn && (
                <label className="flex cursor-pointer items-start justify-between gap-4">
                  <span className="flex gap-2.5">
                    <Mail className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden />
                    <span>
                      <span className="block text-[13px] font-medium text-ink">
                        Evening check-in email
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">
                        A short note on how the day went. Not a data dump, and off unless
                        you say otherwise.
                      </span>
                    </span>
                  </span>
                  <Switch
                    checked={emailOptIn}
                    onCheckedChange={setEmailOptIn}
                    aria-label="Evening check-in email"
                  />
                </label>
              )}
            </div>
          )}
        </div>

        <div className="stagger mt-7 flex flex-col gap-3" style={{ '--i': 4 } as React.CSSProperties}>
          <Button size="lg" variant="primary" onClick={finish} disabled={busy}>
            {busy ? 'Setting up…' : 'Open my journal'}
            {!busy && <ArrowRight aria-hidden />}
          </Button>
          <p className="text-center text-xs text-ink-faint">
            No card, no trial, nothing to cancel.
          </p>
        </div>
      </div>
    </main>
  )
}
