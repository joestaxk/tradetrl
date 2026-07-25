import { useEffect, useRef, useState } from 'react'
import { formatMoney, formatR } from '#/lib/calc'
import { cn } from './cn'

/**
 * Count-up animation for stat tiles (§8).
 *
 * Three things this gets right that a naive rAF loop does not:
 *  - it respects `prefers-reduced-motion` by snapping straight to the value;
 *  - it animates *from the previously displayed value*, so a re-render with a
 *    new number tweens rather than restarting from zero;
 *  - it cancels cleanly, so a fast month-to-month flick never leaves two
 *    loops fighting over the same tile.
 */
export function useCountUp(value: number, duration = 650): number {
  const [display, setDisplay] = useState(value)
  const fromRef = useRef(value)
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    const from = fromRef.current
    if (reduced || from === value) {
      fromRef.current = value
      setDisplay(value)
      return
    }

    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      // easeOutQuint — matches --ease-out-quint so motion feels of a piece.
      const eased = 1 - Math.pow(1 - t, 5)
      const current = from + (value - from) * eased
      setDisplay(current)
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = value
        setDisplay(value)
      }
    }
    frameRef.current = requestAnimationFrame(tick)

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      // Land on the target so an interrupted tween never leaves a stale figure.
      fromRef.current = value
    }
  }, [value, duration])

  return display
}

export type Tone = 'win' | 'loss' | 'flat' | 'neutral' | 'accent'

export function toneOf(n: number | null | undefined): Tone {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 'neutral'
  if (n > 0) return 'win'
  if (n < 0) return 'loss'
  return 'flat'
}

export const toneText: Record<Tone, string> = {
  win: 'text-win-bright',
  loss: 'text-loss-bright',
  flat: 'text-ink-dim',
  neutral: 'text-ink',
  accent: 'text-accent-bright',
}

/** A money figure: tabular, signed, tone-coloured, optionally counting up. */
export function Money({
  value,
  currency = 'USD',
  animate = false,
  signed = true,
  compact = false,
  colored = true,
  className,
}: {
  value: number
  currency?: string
  animate?: boolean
  signed?: boolean
  compact?: boolean
  colored?: boolean
  className?: string
}) {
  const shown = useCountUp(animate ? value : value, animate ? 650 : 0)
  const n = animate ? shown : value
  return (
    <span
      className={cn('tnum', colored && toneText[toneOf(value)], className)}
      // The animated text changes many times a second; announce the final
      // value once instead of narrating the tween.
      aria-label={formatMoney(value, { currency, signed })}
    >
      <span aria-hidden>{formatMoney(n, { currency, signed, compact })}</span>
    </span>
  )
}

export function RMultiple({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn('tnum', toneText[toneOf(value)], className)}>{formatR(value)}</span>
  )
}

/* ---------------------------------------------------------------- Stat tile */

export interface StatProps {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  tone?: Tone
  className?: string
  /** Stagger index for the reveal. */
  index?: number
}

export function Stat({ label, value, sub, tone = 'neutral', className, index = 0 }: StatProps) {
  return (
    <div
      className={cn(
        'stagger flex min-w-0 flex-col gap-1 rounded-xl border border-line bg-panel px-3.5 py-3',
        className,
      )}
      style={{ '--i': index } as React.CSSProperties}
    >
      <span className="truncate text-[11px] font-medium uppercase tracking-wider text-ink-faint">
        {label}
      </span>
      <span className={cn('truncate font-display text-xl leading-none sm:text-[22px]', toneText[tone])}>
        {value}
      </span>
      {sub && <span className="truncate text-[11px] text-ink-muted tnum">{sub}</span>}
    </div>
  )
}

/**
 * The one thing a stat row must not do is scroll the page sideways. Tiles wrap
 * onto a 2-up grid at 320px rather than shrinking below legibility (§12).
 */
export function StatRow({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3', className)}
      {...props}
    />
  )
}
