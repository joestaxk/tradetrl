import { useMemo } from 'react'
import { Gauge, Info } from 'lucide-react'
import { Card, CardBody, CardHeader, CardTitle } from '#/components/ui/primitives'
import { Money } from '#/components/ui/numbers'
import { formatMoney, formatPct } from '#/lib/calc'
import { accountStanding } from '#/lib/balance'
import { convictionCheck, riskConsistency } from '#/lib/risk-consistency'
import { useJournals } from '#/lib/use-journals'
import type { Trade } from '#/lib/types'
import { cn } from '#/components/ui/cn'

/**
 * What the money cost to make.
 *
 * P&L on its own is a vanity figure: +$4,200 means one thing from forty trades
 * risking $100 and something else entirely from three risking $2,000. This
 * panel puts the two side by side, and then asks the question the Settings
 * page can't — not "what limit did you set", but "did you actually use it".
 */
export function RiskCard({ trades }: { trades: Trade[] }) {
  const { active: account } = useJournals()
  const currency = account.currency

  const standing = useMemo(() => accountStanding(account, trades), [account, trades])
  const risk = useMemo(
    () =>
      riskConsistency({
        trades,
        declaredPct: account.riskRules.maxRiskPerTradePct,
        riskBase: standing.riskBase,
      }),
    [trades, account.riskRules.maxRiskPerTradePct, standing.riskBase],
  )
  const conviction = useMemo(
    () => convictionCheck(trades, standing.riskBase),
    [trades, standing.riskBase],
  )

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>What it cost to make</CardTitle>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
            Profit is only half the story. This is the risk that produced it, and whether
            the size you set for yourself is the size you actually use.
          </p>
        </div>
        <Gauge className="size-4 shrink-0 text-ink-faint" aria-hidden />
      </CardHeader>

      <CardBody className="flex flex-col gap-4">
        {risk.tradesWithRisk === 0 ? (
          <p className="flex gap-2 text-[13px] leading-relaxed text-ink-muted">
            <Info className="mt-0.5 size-3.5 shrink-0 text-ink-faint" aria-hidden />
            {risk.verdict}
          </p>
        ) : (
          <>
            {/* The headline pair, deliberately adjacent. */}
            <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
              <Figure
                label="Made"
                value={<Money value={risk.netPnl} currency={currency} compact />}
              />
              <Figure
                label="Risked to make it"
                value={
                  <span className="text-ink tnum">
                    {formatMoney(risk.totalRisked, {
                      currency,
                      signed: false,
                      compact: true,
                    })}
                  </span>
                }
              />
              <Figure
                label="Back per $1 risked"
                value={
                  <span
                    className={cn(
                      'tnum',
                      risk.returnOnRisk === null
                        ? 'text-ink-faint'
                        : risk.returnOnRisk > 0
                          ? 'text-win-bright'
                          : risk.returnOnRisk < 0
                            ? 'text-loss-bright'
                            : 'text-ink-dim',
                    )}
                  >
                    {risk.returnOnRisk === null
                      ? '—'
                      : `${risk.returnOnRisk > 0 ? '+' : risk.returnOnRisk < 0 ? '−' : ''}$${Math.abs(risk.returnOnRisk).toFixed(2)}`}
                  </span>
                }
              />
            </div>

            {/* Declared versus used. */}
            <div className="flex flex-col gap-2 rounded-xl border border-line bg-raised p-3.5">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <SmallStat
                  label="You set"
                  value={risk.declaredPct === null ? 'no rule' : formatPct(risk.declaredPct)}
                />
                <SmallStat
                  label="You actually risk"
                  value={risk.medianRiskPct === null ? '—' : formatPct(risk.medianRiskPct)}
                  tone={
                    risk.driftPct === null
                      ? 'neutral'
                      : Math.abs(risk.driftPct) < (risk.declaredPct ?? 1) * 0.15
                        ? 'win'
                        : 'caution'
                  }
                />
                <SmallStat
                  label="Range"
                  value={
                    risk.smallestRiskPct === null
                      ? '—'
                      : `${formatPct(risk.smallestRiskPct)} – ${formatPct(risk.largestRiskPct ?? 0)}`
                  }
                />
                <SmallStat
                  label="Consistency"
                  value={
                    risk.consistencyScore === null ? '—' : `${risk.consistencyScore}/100`
                  }
                  tone={
                    risk.consistencyScore === null
                      ? 'neutral'
                      : risk.consistencyScore >= 75
                        ? 'win'
                        : risk.consistencyScore >= 45
                          ? 'caution'
                          : 'loss'
                  }
                />
              </div>

              {/* A bar showing how tightly sizing clusters around their norm. */}
              {risk.withinBandPct !== null && (
                <div className="flex flex-col gap-1.5">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-overlay">
                    <div
                      className={cn(
                        'h-full rounded-full transition-[width] duration-500 ease-[var(--ease-out-quint)]',
                        (risk.consistencyScore ?? 0) >= 75
                          ? 'bg-win'
                          : (risk.consistencyScore ?? 0) >= 45
                            ? 'bg-caution'
                            : 'bg-loss',
                      )}
                      style={{ width: `${Math.max(2, risk.withinBandPct)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-ink-faint">
                    {Math.round(risk.withinBandPct)}% of trades sized near your own norm ·
                    measured on {risk.tradesWithRisk} of {risk.tradesTotal} trades
                  </p>
                </div>
              )}

              {risk.verdict && (
                <p className="text-[13px] leading-relaxed text-ink-dim">{risk.verdict}</p>
              )}
            </div>

            {/*
              The question almost nobody asks about themselves: are the trades
              you back hardest actually the ones that work?
            */}
            {conviction.line && (
              <div className="flex flex-col gap-1 rounded-xl border border-line bg-raised p-3.5">
                <span className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">
                  When you size up
                </span>
                <p className="text-[13px] leading-relaxed text-ink-dim">{conviction.line}</p>
                <p className="text-[11px] text-ink-faint tnum">
                  {conviction.bigTrades} bigger trades {formatMoney(conviction.bigPnl, { currency })} ·{' '}
                  {conviction.normalTrades} at normal size{' '}
                  {formatMoney(conviction.normalPnl, { currency })}
                </p>
              </div>
            )}
          </>
        )}
      </CardBody>
    </Card>
  )
}

function Figure({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <span className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">
        {label}
      </span>
      <span className="font-display text-2xl leading-none sm:text-3xl">{value}</span>
    </span>
  )
}

function SmallStat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'neutral' | 'win' | 'caution' | 'loss'
}) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-[11px] text-ink-faint">{label}</span>
      <span
        className={cn(
          'text-[15px] font-medium tnum',
          tone === 'win' && 'text-win-bright',
          tone === 'caution' && 'text-caution',
          tone === 'loss' && 'text-loss-bright',
          tone === 'neutral' && 'text-ink',
        )}
      >
        {value}
      </span>
    </span>
  )
}
