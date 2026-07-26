import { useMemo } from 'react'
import { Info, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { Card, CardBody, CardHeader, CardTitle } from '#/components/ui/primitives'
import { Money, Stat, StatRow } from '#/components/ui/numbers'
import { Sparkline } from '#/components/charts/equity-curve'
import { accountStanding, balanceCurve, riskAllowance } from '#/lib/balance'
import { formatMoney, formatPct } from '#/lib/calc'
import { useJournals } from '#/lib/use-journals'
import { useTrades } from '#/lib/use-trades'
import { cn } from '#/components/ui/cn'

/**
 * What the account is actually worth right now.
 *
 * This is the panel that makes an account more than a label. The balance moves
 * with every closed trade, so a trader can see what their journalling has
 * added up to since the day they opened it — which is the number they
 * genuinely care about and the one the app was previously not tracking at all.
 */
export function AccountStandingCard() {
  const { active: account } = useJournals()
  const { trades } = useTrades()

  const standing = useMemo(() => accountStanding(account, trades), [account, trades])
  const curve = useMemo(() => balanceCurve(account, trades), [account, trades])
  const perR = riskAllowance(standing, account.riskRules.maxRiskPerTradePct)
  const currency = account.currency
  const openCount = useMemo(
    () => trades.filter((t) => t.status === 'open').length,
    [trades],
  )

  if (standing.startingBalance === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{account.name}</CardTitle>
          <Wallet className="size-4 shrink-0 text-ink-faint" aria-hidden />
        </CardHeader>
        <CardBody>
          <p className="text-[13px] leading-relaxed text-ink-muted">
            This account has no starting balance yet, so we can't show what it's worth
            or turn your risk rule into real money. Add one below and everything from
            your first trade onward is counted from it.
          </p>
        </CardBody>
      </Card>
    )
  }

  const up = standing.netPnl >= 0

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>{account.name}</CardTitle>
          <p className="mt-1 text-[13px] text-ink-muted">
            Opened with {formatMoney(standing.startingBalance, { currency, signed: false })}
            {account.startedOn ? ` on ${account.startedOn}` : ''}
          </p>
        </div>
        {up ? (
          <TrendingUp className="size-4 shrink-0 text-win" aria-hidden />
        ) : (
          <TrendingDown className="size-4 shrink-0 text-loss" aria-hidden />
        )}
      </CardHeader>

      <CardBody className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <span className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">
              Balance now
            </span>
            <span
              className={cn(
                'font-display text-3xl leading-none tnum sm:text-4xl',
                up ? 'text-ink' : 'text-loss-bright',
              )}
            >
              {formatMoney(standing.currentBalance!, { currency, signed: false })}
            </span>
          </span>

          {curve.length >= 3 && (
            <span className="flex min-w-0 flex-col gap-1">
              <Sparkline
                values={curve.map((p) => p.balance)}
                height={30}
                className="w-32 sm:w-44"
              />
              <span className="text-[11px] text-ink-faint">
                {standing.closedTrades} closed trades
              </span>
            </span>
          )}
        </div>

        {/*
          An unchanged balance should never be a mystery. Say plainly whether
          it hasn't moved because nothing is logged, or because everything
          logged is still open.
        */}
        {standing.closedTrades === 0 && (
          <p className="flex gap-2 rounded-lg border border-line bg-raised px-3 py-2.5 text-[12px] leading-relaxed text-ink-muted">
            <Info className="mt-0.5 size-3.5 shrink-0 text-ink-faint" aria-hidden />
            {openCount > 0
              ? `Nothing closed on this account yet — ${openCount} ${openCount === 1 ? 'trade is' : 'trades are'} still open, so the balance hasn't moved.`
              : `No closed trades on this account yet, so the balance is still your opening figure. Trades logged on a different account count towards that one.`}
          </p>
        )}

        <StatRow>
          <Stat
            label="Since you started"
            value={<Money value={standing.netPnl} currency={currency} animate compact />}
            sub={standing.returnPct === null ? undefined : formatPct(standing.returnPct)}
            index={0}
          />
          <Stat
            label="Max drawdown"
            value={formatMoney(standing.maxDrawdown, {
              currency,
              signed: false,
              compact: true,
            })}
            sub={
              standing.maxDrawdownPct === null
                ? 'peak to trough'
                : `${formatPct(standing.maxDrawdownPct)} from peak`
            }
            index={1}
          />
          <Stat
            label="Risk per trade"
            value={
              perR === null
                ? '—'
                : formatMoney(perR, { currency, signed: false, compact: true })
            }
            sub={
              account.riskRules.maxRiskPerTradePct
                ? `${account.riskRules.maxRiskPerTradePct}% of ${
                    account.riskBasis === 'current' ? 'balance' : 'deposit'
                  }`
                : 'no rule set'
            }
            index={2}
          />
          <Stat
            label="Peak"
            value={formatMoney(standing.peakBalance ?? 0, {
              currency,
              signed: false,
              compact: true,
            })}
            sub="highest it reached"
            index={3}
          />
        </StatRow>

        {/*
          Stated plainly, because a trader on a prop evaluation and one
          compounding a personal account mean different things by "1%", and
          getting that wrong silently misstates every risk figure on the page.
        */}
        <p className="text-xs leading-relaxed text-ink-muted">
          {account.riskBasis === 'current'
            ? 'Risk is measured against your current balance, so it grows and shrinks with the account.'
            : 'Risk is measured against your opening deposit, so the limit stays the same however the account moves.'}
        </p>
      </CardBody>
    </Card>
  )
}
