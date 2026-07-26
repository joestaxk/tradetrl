import { describe, expect, it } from 'vitest'
import {
  cohensD,
  correlation,
  isRealDifference,
  linearSlope,
  longestRun,
  mean,
  median,
  quantile,
  stdev,
  twoProportionZ,
  welchT,
  wilsonLowerBound,
} from './stats'

describe('basics', () => {
  it('handles empty input without producing NaN', () => {
    expect(mean([])).toBe(0)
    expect(median([])).toBe(0)
    expect(stdev([])).toBe(0)
    expect(quantile([], 0.5)).toBe(0)
  })

  it('computes mean and median', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5)
    expect(median([1, 2, 3, 4])).toBe(2.5)
    expect(median([3, 1, 2])).toBe(2)
  })

  it('uses the sample standard deviation, not the population one', () => {
    // n-1 denominator: sd of [2,4,4,4,5,5,7,9] is 2.138, not 2 (population).
    expect(stdev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 2)
  })

  it('interpolates quantiles', () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3)
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5)
  })
})

describe('welchT', () => {
  it('is near zero for identical distributions', () => {
    const a = [1, 2, 3, 4, 5]
    const t = welchT(a, [...a])
    expect(t).not.toBeNull()
    expect(Math.abs(t!)).toBeLessThan(0.001)
  })

  it('grows with separation', () => {
    const near = welchT([1, 2, 3, 4, 5], [2, 3, 4, 5, 6])!
    const far = welchT([1, 2, 3, 4, 5], [20, 21, 22, 23, 24])!
    expect(Math.abs(far)).toBeGreaterThan(Math.abs(near))
  })

  it('refuses to judge a sample of one', () => {
    expect(welchT([1], [2, 3, 4])).toBeNull()
  })

  it('returns null rather than dividing by zero variance', () => {
    expect(welchT([2, 2, 2], [2, 2, 2])).toBeNull()
  })
})

describe('cohensD', () => {
  it('measures separation in units of spread', () => {
    // Means differ by 10, pooled sd ~1.58 → very large effect.
    const d = cohensD([10, 11, 12, 13, 14], [0, 1, 2, 3, 4])
    expect(d).not.toBeNull()
    expect(d!).toBeGreaterThan(3)
  })

  it('is zero for identical groups', () => {
    expect(cohensD([1, 2, 3], [1, 2, 3])).toBeCloseTo(0, 6)
  })
})

describe('isRealDifference — the guard the whole engine leans on', () => {
  it('rejects small samples however dramatic they look', () => {
    // A perfect split, but three trades a pattern does not make.
    expect(isRealDifference([10, 10, 10], [0, 0, 0])).toBe(false)
  })

  it('rejects a tiny difference even with lots of data', () => {
    const a = Array.from({ length: 200 }, (_, i) => (i % 10) + 0.02)
    const b = Array.from({ length: 200 }, (_, i) => i % 10)
    // Significant by t alone at n=200, but the effect is trivial.
    expect(isRealDifference(a, b)).toBe(false)
  })

  it('accepts a large, well-sampled difference', () => {
    const a = [3, 3.2, 2.8, 3.1, 2.9, 3.3, 3.0, 2.7]
    const b = [0.1, -0.2, 0, 0.3, -0.1, 0.2, 0.05, -0.3]
    expect(isRealDifference(a, b)).toBe(true)
  })

  it('honours a raised minimum sample', () => {
    const a = [3, 3.2, 2.8, 3.1, 2.9]
    const b = [0.1, -0.2, 0, 0.3, -0.1]
    expect(isRealDifference(a, b, 5)).toBe(true)
    expect(isRealDifference(a, b, 10)).toBe(false)
  })
})

describe('twoProportionZ', () => {
  it('is zero when both proportions match', () => {
    expect(twoProportionZ(5, 10, 50, 100)).toBeCloseTo(0, 6)
  })

  it('is signed by which side is higher', () => {
    expect(twoProportionZ(9, 10, 1, 10)!).toBeGreaterThan(0)
    expect(twoProportionZ(1, 10, 9, 10)!).toBeLessThan(0)
  })

  it('returns null when nothing can be compared', () => {
    expect(twoProportionZ(0, 0, 1, 5)).toBeNull()
    // Everyone won: no variance to test against.
    expect(twoProportionZ(10, 10, 10, 10)).toBeNull()
  })
})

describe('wilsonLowerBound', () => {
  it('punishes a tiny perfect record', () => {
    // 3/3 must not outrank 60/100 — the reason this exists at all.
    expect(wilsonLowerBound(3, 3)).toBeLessThan(wilsonLowerBound(60, 100))
  })

  it('approaches the raw rate as the sample grows', () => {
    expect(wilsonLowerBound(600, 1000)).toBeGreaterThan(0.56)
    expect(wilsonLowerBound(600, 1000)).toBeLessThan(0.6)
  })

  it('is zero for no data', () => {
    expect(wilsonLowerBound(0, 0)).toBe(0)
  })
})

describe('correlation and slope', () => {
  it('finds a perfect positive relationship', () => {
    expect(correlation([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 6)
  })

  it('finds a perfect inverse relationship', () => {
    expect(correlation([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 6)
  })

  it('returns null when a series never varies', () => {
    expect(correlation([1, 1, 1, 1], [1, 2, 3, 4])).toBeNull()
  })

  it('measures upward and downward drift', () => {
    expect(linearSlope([1, 2, 3, 4, 5])).toBeCloseTo(1, 6)
    expect(linearSlope([5, 4, 3, 2, 1])).toBeCloseTo(-1, 6)
    expect(linearSlope([3, 3, 3])).toBeCloseTo(0, 6)
  })

  it('needs three points before claiming a trend', () => {
    expect(linearSlope([1, 5])).toBeNull()
  })
})

describe('longestRun', () => {
  it('finds the longest matching streak', () => {
    expect(longestRun([1, -1, -1, -1, 1, -1], (x) => x < 0)).toBe(3)
    expect(longestRun([1, 2, 3], (x) => x < 0)).toBe(0)
    expect(longestRun([], (x: number) => x < 0)).toBe(0)
  })
})

describe('isRealDifference — the zero-variance case', () => {
  it('recognises two constant groups that are far apart', () => {
    // A trader who holds every winner 20 min and every loser 6h has the
    // cleanest signal there is, even though neither group varies.
    const winners = Array(8).fill(20)
    const losers = Array(8).fill(360)
    expect(isRealDifference(losers, winners)).toBe(true)
  })

  it('ignores two constant groups a rounding error apart', () => {
    expect(isRealDifference(Array(8).fill(100), Array(8).fill(100.5))).toBe(false)
  })

  it('ignores two identical constant groups', () => {
    expect(isRealDifference(Array(8).fill(5), Array(8).fill(5))).toBe(false)
  })

  it('still refuses a small sample of constants', () => {
    expect(isRealDifference([20, 20, 20], [360, 360, 360])).toBe(false)
  })

  it('applies the normal gates when only one side is constant', () => {
    // welchT is defined here, so the ordinary rules apply rather than the
    // zero-variance shortcut. Same mean, wide spread -> nothing to report.
    expect(isRealDifference(Array(8).fill(20), [18, 22, 19, 21, 20, 23, 17, 20])).toBe(false)
    // ...and a genuinely large gap still registers.
    expect(isRealDifference(Array(8).fill(20), [300, 340, 280, 310, 290, 330, 270, 320])).toBe(
      true,
    )
  })
})
