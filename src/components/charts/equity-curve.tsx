import { useId, useMemo, useState } from 'react'
import { formatMoney } from '#/lib/calc'
import type { EquityPoint } from '#/lib/aggregate'
import { cn } from '#/components/ui/cn'

/**
 * Cumulative PnL curve.
 *
 * Hand-rolled SVG rather than a chart library, for three reasons: it inherits
 * the design tokens exactly, it adds no bundle weight to the densest screen in
 * the app, and it lets the fill and stroke change colour on the sign of the
 * final value without fighting a theming API.
 *
 * Single series, so no legend — the title names it (dataviz check 6).
 * Interactive by default: crosshair + tooltip on hover and on touch.
 */

interface Props {
  points: EquityPoint[]
  currency?: string
  height?: number
  className?: string
  /** Accessible name; also what the tooltip is describing. */
  label?: string
}

const PAD = { top: 10, right: 8, bottom: 10, left: 8 }

export function EquityCurve({
  points,
  currency = 'USD',
  height = 132,
  className,
  label = 'Cumulative profit and loss',
}: Props) {
  const gradId = useId()
  const [hover, setHover] = useState<number | null>(null)

  const geometry = useMemo(() => {
    if (points.length < 2) return null
    const w = 100 // viewBox units; the SVG scales to its container
    const h = height
    const innerW = w - PAD.left - PAD.right
    const innerH = h - PAD.top - PAD.bottom

    const values = points.map((p) => p.cumulative)
    let min = Math.min(0, ...values)
    let max = Math.max(0, ...values)
    if (min === max) {
      // A perfectly flat curve still needs a band to draw inside.
      min -= 1
      max += 1
    }
    const pad = (max - min) * 0.12
    min -= pad
    max += pad

    const x = (i: number) => PAD.left + (i / (points.length - 1)) * innerW
    const y = (v: number) => PAD.top + innerH - ((v - min) / (max - min)) * innerH

    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.cumulative)}`).join(' ')
    const area = `${line} L${x(points.length - 1)},${y(min)} L${x(0)},${y(min)} Z`
    const zeroY = y(0)
    const showZero = zeroY > PAD.top && zeroY < h - PAD.bottom

    return { w, h, x, y, line, area, zeroY, showZero, min, max }
  }, [points, height])

  const final = points.at(-1)?.cumulative ?? 0
  const positive = final >= 0
  const stroke = positive ? 'var(--color-win)' : 'var(--color-loss)'

  if (!geometry) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-xl border border-dashed border-line text-xs text-ink-faint',
          className,
        )}
        style={{ height }}
      >
        Not enough trades to draw a curve yet
      </div>
    )
  }

  const { w, h, x, y, line, area, zeroY, showZero } = geometry
  const active = hover === null ? null : points[hover]

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    if (rect.width === 0) return
    const ratio = (e.clientX - rect.left) / rect.width
    const i = Math.round(ratio * (points.length - 1))
    setHover(Math.max(0, Math.min(points.length - 1, i)))
  }

  return (
    <div className={cn('relative', className)}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="w-full touch-pan-y"
        style={{ height }}
        role="img"
        aria-label={`${label}. Ends at ${formatMoney(final, { currency })} over ${points.length - 1} trades.`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Recessive baseline — the zero line is reference, not data. */}
        {showZero && (
          <line
            x1={PAD.left}
            x2={w - PAD.right}
            y1={zeroY}
            y2={zeroY}
            stroke="var(--color-line-strong)"
            strokeWidth="0.5"
            strokeDasharray="1.5 2"
            vectorEffect="non-scaling-stroke"
          />
        )}

        <path d={area} fill={`url(#${gradId})`} />
        <path
          d={line}
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {active && (
          <>
            <line
              x1={x(active.index)}
              x2={x(active.index)}
              y1={PAD.top}
              y2={h - PAD.bottom}
              stroke="var(--color-line-strong)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            {/* 2px surface ring so the marker reads on top of the line. */}
            <circle
              cx={x(active.index)}
              cy={y(active.cumulative)}
              r="4"
              fill={stroke}
              stroke="var(--color-panel)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
      </svg>

      {active && (
        <div
          className={cn(
            'pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg',
            'border border-line-strong bg-overlay px-2 py-1.5',
            'shadow-[0_8px_24px_-8px_rgba(0,0,0,0.8)]',
          )}
          style={{
            // Clamp so the tooltip never pushes the layout sideways at 320px.
            left: `clamp(3rem, ${(active.index / (points.length - 1)) * 100}%, calc(100% - 3rem))`,
          }}
        >
          <p className="text-[11px] leading-none text-ink-faint">
            {active.index === 0 ? 'Start' : `Trade ${active.index}`}
          </p>
          <p className="mt-1 text-xs font-medium leading-none text-ink tnum">
            {formatMoney(active.cumulative, { currency })}
          </p>
          {active.trade && (
            <p className="mt-1 text-[11px] leading-none text-ink-muted">
              {active.trade.pair.toUpperCase()}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Tiny inline curve for list rows and the discipline trend. No axes, no
 * interaction — it is a texture, and the number beside it carries the meaning.
 */
export function Sparkline({
  values,
  className,
  height = 28,
  tone,
}: {
  values: number[]
  className?: string
  height?: number
  tone?: 'win' | 'loss' | 'accent'
}) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const d = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 100
      const y = height - ((v - min) / span) * (height - 4) - 2
      return `${i === 0 ? 'M' : 'L'}${x},${y}`
    })
    .join(' ')

  const stroke =
    tone === 'accent'
      ? 'var(--color-accent)'
      : (tone ?? (values.at(-1)! >= values[0] ? 'win' : 'loss')) === 'win'
        ? 'var(--color-win)'
        : 'var(--color-loss)'

  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      className={cn('w-full', className)}
      style={{ height }}
      aria-hidden
    >
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
