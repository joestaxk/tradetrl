import { useState } from 'react'
import { ChevronDown, Hourglass } from 'lucide-react'
import { Badge } from '#/components/ui/primitives'
import { QuickResolve } from '#/components/trades/quick-resolve'
import { openOnly, sortChronological } from '#/lib/aggregate'
import { accountStanding, riskAllowance } from '#/lib/balance'
import { sessionWindowsOf } from '#/lib/sessions'
import { formatTime, timeFormatOf } from '#/lib/clock'
import { shortDayLabel } from '#/lib/dates'
import { saveTrade } from '#/lib/repo'
import { useAuth } from '#/lib/auth'
import { useJournals } from '#/lib/use-journals'
import { useStrategies } from '#/lib/use-strategies'
import type { Trade } from '#/lib/types'
import { cn } from '#/components/ui/cn'

/**
 * The "still waiting" strip.
 *
 * Tapping a row opens the resolve controls inline rather than navigating —
 * closing a trade should never cost a screen transition, because the moment it
 * happens you are usually holding a phone and half-distracted.
 *
 * Deliberately not a badge on the nav, not a notification, not a nag. §0 says
 * we observe. Forgetting to resolve a trade is the trader's business; making
 * it effortless to remember is ours.
 */
export function OpenTrades({
  trades,
  onOpenFull,
  className,
}: {
  trades: Trade[]
  onOpenFull: (trade: Trade) => void
  className?: string
}) {
  const { user, profile } = useAuth()
  const { active: account } = useJournals()
  const { nameOf } = useStrategies()
  const [expanded, setExpanded] = useState<string | null>(null)

  const open = sortChronological(openOnly(trades)).reverse()
  if (open.length === 0) return null

  const standing = accountStanding(account, trades)
  const sessionWindows = sessionWindowsOf(profile?.prefs)
  const clock = timeFormatOf(profile?.prefs)
  const perR = riskAllowance(standing, account.riskRules.maxRiskPerTradePct)

  return (
    <section
      className={cn('rounded-xl border border-line bg-panel', className)}
      aria-label="Trades still open"
    >
      <header className="flex items-center gap-2 px-3.5 pt-3">
        <Hourglass className="size-3.5 shrink-0 text-ink-faint" aria-hidden />
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">
          Still open
        </h2>
        <Badge tone="neutral" className="ml-auto tnum">
          {open.length}
        </Badge>
      </header>

      <ul className="flex flex-col p-1.5">
        {open.map((t) => {
          const isOpen = expanded === t.id
          const strategy = nameOf(t.strategyId)
          return (
            <li key={t.id} className="flex flex-col">
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : t.id)}
                aria-expanded={isOpen}
                className={cn(
                  'group flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 text-left',
                  'transition-colors duration-150 hover:bg-raised',
                )}
              >
                <span
                  className="size-1.5 shrink-0 rounded-full bg-accent ring-2 ring-accent-wash"
                  aria-hidden
                />

                <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
                  <span className="flex items-center gap-2">
                    <span className="shrink-0 text-[13px] font-medium text-ink">
                      {t.pair.toUpperCase()}
                    </span>
                    <Badge tone="neutral" className="shrink-0 uppercase">
                      {t.direction}
                    </Badge>
                    {strategy && (
                      <span className="truncate text-[11px] text-ink-faint">{strategy}</span>
                    )}
                  </span>
                  <span className="truncate text-[11px] text-ink-faint tnum sm:ml-auto">
                    {shortDayLabel(t.date)}
                    {t.time ? ` · ${formatTime(t.time, clock)}` : ''}
                  </span>
                </span>

                <ChevronDown
                  className={cn(
                    'size-3.5 shrink-0 text-ink-faint transition-transform duration-200',
                    isOpen && 'rotate-180',
                  )}
                  aria-hidden
                />
              </button>

              {isOpen && (
                <div className="px-2 pb-2 pt-1">
                  <QuickResolve
                    trade={t}
                    riskAmount={t.riskAmount ?? perR}
                    currency={account.currency}
                    onOpenFull={() => {
                      setExpanded(null)
                      onOpenFull(t)
                    }}
                    onResolve={async ({ outcome, rMultiple, pnl, closeDate, closeTime }) => {
                      if (!user) return
                      const sameDayTradeCount = trades.filter(
                        (x) => x.date === t.date && x.id !== t.id && x.status === 'closed',
                      ).length

                      await saveTrade(
                        user.uid,
                        account.id,
                        {
                          ...t,
                          status: 'closed',
                          outcome,
                          // Money if we could work it out from R; otherwise the
                          // R stands alone rather than us inventing a figure.
                          pnl: pnl ?? 0,
                          rMultiple: rMultiple ?? undefined,
                          closeDate,
                          closeTime,
                          closedAt: Date.now(),
                        },
                        {
                          rules: account.riskRules,
                          accountSize: standing.riskBase ?? undefined,
                          sameDayTradeCount,
                          sessionWindows,
                        },
                        t.id,
                      )
                      setExpanded(null)
                    }}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
