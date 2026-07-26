import { ExternalLink, ImagePlus, X } from 'lucide-react'
import { Input } from '#/components/ui/field'
import { MAX_CHARTS, chartCaption, normalizeChartUrl } from '#/lib/charts'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import {
  COMMON_TIMEFRAMES,
  TIMEFRAME_GROUPS,
  TIMEFRAME_OPTIONS,
  timeframeShort,
  type Bias,
  type ChartRef,
  type Timeframe,
} from '#/lib/types'
import { cn } from '#/components/ui/cn'

const BIAS_CYCLE: (Bias | undefined)[] = [undefined, 'bullish', 'bearish', 'neutral']

const BIAS_STYLE: Record<Bias, string> = {
  bullish: 'border-win-edge bg-win-wash text-win-bright',
  bearish: 'border-loss-edge bg-loss-wash text-loss-bright',
  neutral: 'border-line-strong bg-overlay text-ink-dim',
}

const BIAS_LABEL: Record<Bias, string> = {
  bullish: 'Long',
  bearish: 'Short',
  neutral: 'Flat',
}

/**
 * The screenshots for a trade — as many as the analysis actually took.
 *
 * Each row is a link plus the timeframe it shows, so a D1 / H4 / M15 markup
 * survives intact instead of being squeezed into "before" and "after". Bias
 * per row is optional and one tap, which is what makes it possible to later
 * ask whether trading with your own higher-timeframe read actually pays.
 */
export function ChartLinks({
  value,
  onChange,
  known = [],
}: {
  value: ChartRef[]
  onChange: (next: ChartRef[]) => void
  /** Timeframes this trader has used before, offered ahead of our defaults. */
  known?: string[]
}) {
  const update = (i: number, patch: Partial<ChartRef>) =>
    onChange(value.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))

  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i))

  // Their own vocabulary first — if someone always marks up M3, that should be
  // the tap, not something we picked.
  const suggestions = [...new Set([...known, ...COMMON_TIMEFRAMES])].slice(0, 6)

  const add = () => {
    if (value.length >= MAX_CHARTS) return
    // Suggest the next timeframe they haven't used yet, coarse first — it's
    // usually the order people work in.
    const used = new Set(value.map((c) => c.timeframe))
    const suggestion = suggestions.find((t) => !used.has(t))
    onChange([...value, { url: '', timeframe: suggestion }])
  }

  return (
    <div className="flex flex-col gap-2.5">
      {value.map((chart, i) => {
        const valid = chart.url.trim() === '' || normalizeChartUrl(chart.url) !== null
        return (
          <div
            key={i}
            className="flex flex-col gap-2 rounded-xl border border-line bg-raised p-2.5"
          >
            <div className="flex items-center gap-2">
              <Input
                value={chart.url}
                onChange={(e) => update(i, { url: e.target.value })}
                placeholder="tradingview.com/x/…"
                type="url"
                inputMode="url"
                aria-label={`Chart ${i + 1} link`}
                className={cn('flex-1', !valid && 'border-loss')}
              />
              {chart.url.trim() !== '' && valid && (
                <a
                  href={normalizeChartUrl(chart.url) ?? '#'}
                  target="_blank"
                  rel="noreferrer noopener"
                  style={{ width: 36, height: 36, minWidth: 36, minHeight: 36, flex: '0 0 auto' }}
                  className="inline-flex items-center justify-center rounded-lg border border-line text-ink-faint transition-colors hover:border-accent-edge hover:text-accent-bright"
                  aria-label={`Open ${chartCaption(chart)}`}
                >
                  <ExternalLink className="size-4" aria-hidden />
                </a>
              )}
              <button
                type="button"
                onClick={() => remove(i)}
                style={{ width: 36, height: 36, minWidth: 36, minHeight: 36, flex: '0 0 auto' }}
                className="inline-flex items-center justify-center rounded-lg border border-line text-ink-faint transition-colors hover:border-loss-edge hover:text-loss"
                aria-label={`Remove chart ${i + 1}`}
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>

            {!valid && (
              <p className="text-xs text-loss">
                That doesn't look like a link we can open.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-1.5">
              {suggestions.map((tf) => (
                <TimeframeChip
                  key={tf}
                  tf={tf}
                  active={sameTf(chart.timeframe, tf)}
                  onClick={() =>
                    update(i, { timeframe: sameTf(chart.timeframe, tf) ? undefined : tf })
                  }
                />
              ))}

              {/*
                Everything else behind a select rather than free text: per
                timeframe stats fragment into nothing if "H4", "4h" and
                "4 hour" are three different keys.
              */}
              <Select
                value={chart.timeframe ?? ''}
                onValueChange={(v) => update(i, { timeframe: v || undefined })}
              >
                <SelectTrigger
                  className="h-8 w-[104px] px-2 text-[12px]"
                  aria-label={`Timeframe for chart ${i + 1}`}
                >
                  <SelectValue placeholder="Other" />
                </SelectTrigger>
                <SelectContent>
                  {TIMEFRAME_GROUPS.map((group) => (
                    <SelectGroup key={group}>
                      <SelectLabel>{group}</SelectLabel>
                      {TIMEFRAME_OPTIONS.filter((o) => o.group === group).map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>

              <button
                type="button"
                onClick={() => {
                  const idx = BIAS_CYCLE.indexOf(chart.bias)
                  update(i, { bias: BIAS_CYCLE[(idx + 1) % BIAS_CYCLE.length] })
                }}
                className={cn(
                  'ml-auto inline-flex h-8 items-center rounded-lg border px-2.5 text-[12px] font-medium transition-colors',
                  chart.bias
                    ? BIAS_STYLE[chart.bias]
                    : 'border-dashed border-line text-ink-faint hover:text-ink-dim',
                )}
              >
                {chart.bias ? BIAS_LABEL[chart.bias] : 'Bias?'}
              </button>
            </div>
          </div>
        )
      })}

      {value.length < MAX_CHARTS && (
        <button
          type="button"
          onClick={add}
          className={cn(
            'flex min-h-11 items-center justify-center gap-2 rounded-xl',
            'border border-dashed border-line text-[13px] text-ink-dim',
            'transition-colors duration-150 hover:border-accent-edge hover:text-ink',
          )}
        >
          <ImagePlus className="size-3.5" aria-hidden />
          {value.length === 0 ? 'Add a chart' : 'Add another chart'}
        </button>
      )}

      {value.length >= MAX_CHARTS && (
        <p className="text-xs text-ink-faint">That's {MAX_CHARTS} charts — the most we store per trade.</p>
      )}
    </div>
  )
}

function TimeframeChip({
  tf,
  active,
  onClick,
}: {
  tf: Timeframe
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center rounded-lg border px-2 text-[12px] font-medium tnum transition-colors',
        active
          ? 'border-accent bg-accent-wash text-ink'
          : 'border-line bg-panel text-ink-muted hover:border-line-strong hover:text-ink-dim',
      )}
    >
      {timeframeShort(tf)}
    </button>
  )
}

function sameTf(a: string | undefined, b: string): boolean {
  return a === b
}
