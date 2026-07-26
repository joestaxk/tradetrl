/**
 * Small statistical toolkit for the behaviour engine.
 *
 * The point of this file is restraint. It is easy to write software that tells
 * a trader "you lose on Tuesdays" after three Tuesdays, and that software is
 * worse than useless — it manufactures superstition out of noise, and the
 * trader then trades on it. Everything here exists so a claim has to earn its
 * place: a minimum sample, a real effect size, and a test statistic that would
 * embarrass a coin flip.
 *
 * These are deliberately standard, textbook implementations. Nothing is
 * approximated where an exact form exists.
 */

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Sample standard deviation (n−1). */
export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  const sumSq = xs.reduce((acc, x) => acc + (x - m) ** 2, 0)
  return Math.sqrt(sumSq / (xs.length - 1))
}

export function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const pos = (s.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return s[lo]
  return s[lo] + (s[hi] - s[lo]) * (pos - lo)
}

/**
 * Welch's t statistic — two means, unequal variances, unequal sizes. Which is
 * every comparison a trading journal makes, since you never take the same
 * number of trades in London as in New York.
 */
export function welchT(a: number[], b: number[]): number | null {
  if (a.length < 2 || b.length < 2) return null
  const va = stdev(a) ** 2 / a.length
  const vb = stdev(b) ** 2 / b.length
  const denom = Math.sqrt(va + vb)
  if (denom === 0) return null
  return (mean(a) - mean(b)) / denom
}

/** Two-proportion z test, for comparing win rates between two groups. */
export function twoProportionZ(
  successA: number,
  totalA: number,
  successB: number,
  totalB: number,
): number | null {
  if (totalA < 1 || totalB < 1) return null
  const pooled = (successA + successB) / (totalA + totalB)
  if (pooled <= 0 || pooled >= 1) return null
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / totalA + 1 / totalB))
  if (se === 0) return null
  return (successA / totalA - successB / totalB) / se
}

/**
 * Cohen's d — how far apart two means are in units of their own spread.
 *
 * This is the guard against the large-sample trap, where a trivial difference
 * becomes "significant" simply because there are a lot of trades. A result has
 * to be both unlikely *and* big enough to act on.
 */
export function cohensD(a: number[], b: number[]): number | null {
  if (a.length < 2 || b.length < 2) return null
  const sa = stdev(a)
  const sb = stdev(b)
  const pooled = Math.sqrt(
    ((a.length - 1) * sa ** 2 + (b.length - 1) * sb ** 2) / (a.length + b.length - 2),
  )
  if (pooled === 0) return null
  return (mean(a) - mean(b)) / pooled
}

/** |t| or |z| beyond this is roughly p < 0.05 two-tailed at usable sample sizes. */
export const SIGNIFICANT = 1.96
/** Cohen's convention: 0.2 small, 0.5 medium, 0.8 large. We want at least medium. */
export const MEANINGFUL_EFFECT = 0.5

/**
 * Would this comparison survive both gates?
 *
 * Requiring significance *and* effect size is the whole discipline of this
 * module. Either alone produces confident nonsense.
 */
export function isRealDifference(a: number[], b: number[], minEach = 5): boolean {
  if (a.length < minEach || b.length < minEach) return false

  const t = welchT(a, b)
  const d = cohensD(a, b)

  if (t === null || d === null) {
    /*
      Both groups are constant, so there is no variance for a t-test to work
      with. That is not an absence of evidence — a trader who holds every
      winner 20 minutes and every loser six hours has the cleanest possible
      signal, and returning false here would blind the engine to the most
      obvious cases.

      Still gated on the gap being materially large, so two constants a
      rounding error apart are not reported as a finding.
    */
    if (stdev(a) !== 0 || stdev(b) !== 0) return false
    const ma = mean(a)
    const mb = mean(b)
    const scale = Math.max(Math.abs(ma), Math.abs(mb), 1)
    return Math.abs(ma - mb) / scale >= 0.1
  }

  return Math.abs(t) >= SIGNIFICANT && Math.abs(d) >= MEANINGFUL_EFFECT
}

/**
 * Wilson score lower bound for a proportion.
 *
 * Used instead of a raw win rate when ranking, because 3 wins from 3 trades is
 * not a 100% strategy and should never outrank 60 wins from 100.
 */
export function wilsonLowerBound(successes: number, total: number, z = 1.96): number {
  if (total === 0) return 0
  const p = successes / total
  const denom = 1 + (z * z) / total
  const centre = p + (z * z) / (2 * total)
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total)
  return Math.max(0, (centre - margin) / denom)
}

/** Pearson correlation. null when either series is constant. */
export function correlation(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length)
  if (n < 3) return null
  const mx = mean(xs.slice(0, n))
  const my = mean(ys.slice(0, n))
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx
    const b = ys[i] - my
    num += a * b
    dx += a * a
    dy += b * b
  }
  if (dx === 0 || dy === 0) return null
  return num / Math.sqrt(dx * dy)
}

/** Least-squares slope of y over x — for drift over a sequence of trades. */
export function linearSlope(ys: number[]): number | null {
  const n = ys.length
  if (n < 3) return null
  const xs = Array.from({ length: n }, (_, i) => i)
  const mx = mean(xs)
  const my = mean(ys)
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my)
    den += (xs[i] - mx) ** 2
  }
  if (den === 0) return null
  return num / den
}

/** Longest run of values satisfying a predicate. */
export function longestRun<T>(xs: T[], pred: (x: T) => boolean): number {
  let best = 0
  let run = 0
  for (const x of xs) {
    run = pred(x) ? run + 1 : 0
    if (run > best) best = run
  }
  return best
}
