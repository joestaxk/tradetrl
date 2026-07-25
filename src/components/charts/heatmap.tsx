import { useMemo } from 'react'
import { formatMoney } from '#/lib/calc'
import { HEAT_SESSIONS, sessionHeatmap, type HeatCell } from '#/lib/aggregate'
import { SESSION_LABEL } from '#/lib/dates'
import type { Trade } from '#/lib/types'
import { Tip } from '#/components/ui/overlays'
import { cn } from '#/components/ui/cn'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

/**
 * Session × weekday performance (§10).
 *
 * This is a *diverging* encoding, not sequential: the measure is signed P&L,
 * so it uses the win/loss poles with a neutral surface at the midpoint —
 * never a rainbow, never a hue at zero. Intensity comes from opacity within
 * each pole, which keeps the two hues themselves fixed and CVD-validated.
 *
 * Colour alone never carries the value: every cell shows its figure, and the
 * tooltip states it in full.
 */
export function SessionHeatmap({
  trades,
  currency = 'USD',
  className,
}: {
  trades: Trade[]
  currency?: string
  className?: string
}) {
  const cells = useMemo(() => sessionHeatmap(trades), [trades])
  const peak = useMemo(
    () => Math.max(1, ...cells.map((c) => Math.abs(c.stats.pnl))),
    [cells],
  )

  const at = (session: string, weekday: number): HeatCell | undefined =>
    cells.find((c) => c.session === session && c.weekday === weekday)

  const hasAny = cells.some((c) => c.stats.trades > 0)

  if (!hasAny) {
    return (
      <p className={cn('text-[13px] leading-relaxed text-ink-muted', className)}>
        Add a time when you log a trade and this fills in — no extra typing beyond the
        clock time itself.
      </p>
    )
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Column headers */}
      <div className="grid grid-cols-[4.5rem_repeat(5,minmax(0,1fr))] gap-1">
        <span />
        {WEEKDAYS.map((d) => (
          <span
            key={d}
            className="text-center text-[10px] font-medium uppercase tracking-wider text-ink-faint"
          >
            {d}
          </span>
        ))}
      </div>

      {HEAT_SESSIONS.map((session) => (
        <div key={session} className="grid grid-cols-[4.5rem_repeat(5,minmax(0,1fr))] gap-1">
          <span className="flex items-center text-[11px] text-ink-muted">
            {SESSION_LABEL[session]}
          </span>
          {WEEKDAYS.map((label, i) => {
            const cell = at(session, i + 1)
            const stats = cell?.stats
            const pnl = stats?.pnl ?? 0
            const empty = (stats?.trades ?? 0) === 0
            // Floor the intensity so a small-but-real result is still visible.
            const intensity = empty ? 0 : 0.18 + (Math.abs(pnl) / peak) * 0.62

            return (
              <Tip
                key={label}
                label={
                  empty
                    ? `${SESSION_LABEL[session]}, ${label}: nothing logged`
                    : `${SESSION_LABEL[session]}, ${label}: ${formatMoney(pnl, { currency })} over ${stats!.trades} ${stats!.trades === 1 ? 'trade' : 'trades'}`
                }
              >
                <div
                  className={cn(
                    'flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg border p-1',
                    'transition-transform duration-200 ease-[var(--ease-out-quint)] hover:scale-[1.03]',
                    empty ? 'border-dashed border-line' : 'border-transparent',
                  )}
                  style={
                    empty
                      ? undefined
                      : {
                          backgroundColor:
                            pnl >= 0
                              ? `color-mix(in oklab, var(--color-win) ${Math.round(intensity * 100)}%, transparent)`
                              : `color-mix(in oklab, var(--color-loss) ${Math.round(intensity * 100)}%, transparent)`,
                        }
                  }
                >
                  {empty ? (
                    <span className="text-[11px] text-ink-faint">—</span>
                  ) : (
                    <>
                      <span className="text-[11px] font-medium leading-none text-ink tnum">
                        {formatMoney(pnl, { currency, compact: true })}
                      </span>
                      <span className="text-[10px] leading-none text-ink-dim tnum">
                        {stats!.trades}
                      </span>
                    </>
                  )}
                </div>
              </Tip>
            )
          })}
        </div>
      ))}

      {/* Legend: two poles and a neutral, stated in words as well as colour. */}
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-ink-faint">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] bg-win" aria-hidden />
          profitable
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] bg-loss" aria-hidden />
          unprofitable
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] border border-dashed border-line" aria-hidden />
          nothing logged
        </span>
        <span className="ml-auto">stronger colour = larger result</span>
      </div>
    </div>
  )
}
