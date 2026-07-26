/**
 * Chart attachments on a trade.
 *
 * A trade used to hold exactly two screenshot URLs, "before" and "after".
 * That was wrong about how people actually analyse: a top-down read produces
 * a daily for context, an H4 for the level and an M15 for the entry, and
 * cramming that into two slots meant most of the work was thrown away.
 *
 * Charts are now a list, each tagged with the timeframe it shows and
 * optionally the bias the trader read on it.
 */

import {
  TIMEFRAME_OPTIONS,
  timeframeShort,
  type ChartRef,
  type Trade,
} from './types'

/** Cap so one trade can't accumulate an unbounded document. */
export const MAX_CHARTS = 8

/**
 * Every chart on a trade, including ones stored in the old two-field shape.
 *
 * Reading the legacy fields here rather than migrating the database means no
 * backfill can half-fail and lose someone's screenshots.
 */
export function chartsOf(trade: Pick<Trade, 'charts' | 'beforeChartUrl' | 'afterChartUrl'>): ChartRef[] {
  if (trade.charts && trade.charts.length > 0) return trade.charts

  const legacy: ChartRef[] = []
  if (trade.beforeChartUrl) legacy.push({ url: trade.beforeChartUrl, label: 'before' })
  if (trade.afterChartUrl) legacy.push({ url: trade.afterChartUrl, label: 'after' })
  return legacy
}

export function hasCharts(trade: Parameters<typeof chartsOf>[0]): boolean {
  return chartsOf(trade).length > 0
}

/**
 * Coarse first, so a list reads top-down the way the analysis was done.
 *
 * Timeframes are free text, so this ranks the ones we recognise and leaves
 * anything custom in the order the trader added it — guessing where 'Renko'
 * belongs on a time ladder would be worse than not trying.
 */
// TIMEFRAME_OPTIONS is already declared coarse to fine, so its own index is
// the ladder. Anything unrecognised sorts after, in insertion order.
function rank(tf: string | undefined): number {
  if (!tf) return TIMEFRAME_OPTIONS.length + 1
  const i = TIMEFRAME_OPTIONS.findIndex((o) => o.value === tf)
  return i === -1 ? TIMEFRAME_OPTIONS.length : i
}

export function sortCharts(charts: ChartRef[]): ChartRef[] {
  return [...charts]
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(a.c.timeframe) - rank(b.c.timeframe) || a.i - b.i)
    .map((x) => x.c)
}

/** 'D1' / 'H4 · before' / 'before' — whatever the chart actually knows. */
export function chartCaption(chart: ChartRef): string {
  const bits: string[] = []
  if (chart.timeframe) bits.push(timeframeShort(chart.timeframe))
  if (chart.label) bits.push(chart.label)
  return bits.join(' · ') || 'Chart'
}

/**
 * Accepts a bare domain, since people paste TradingView links in every
 * possible form. Returns null when there's nothing usable rather than
 * silently storing a string that won't open.
 */
export function normalizeChartUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(withScheme)
    if (!url.hostname.includes('.')) return null
    return url.toString()
  } catch {
    return null
  }
}

/** Bias per timeframe, read off the charts the trader attached. */
export function biasFromCharts(charts: ChartRef[]): Record<string, ChartRef['bias']> {
  const out: Record<string, ChartRef['bias']> = {}
  for (const c of charts) {
    if (c.timeframe && c.bias) out[c.timeframe] = c.bias
  }
  return out
}

/** Every timeframe this trader has actually used, for offering back to them. */
export function timeframeVocabulary(
  trades: Pick<Trade, 'charts' | 'beforeChartUrl' | 'afterChartUrl'>[],
): string[] {
  const counts = new Map<string, number>()
  for (const t of trades) {
    for (const c of chartsOf(t)) {
      if (!c.timeframe) continue
      const key = c.timeframe
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
}
