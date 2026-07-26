/**
 * Why it went the way it did — as taps, not prose.
 *
 * A free-text box is where the useful part of a journal goes to die. People
 * write "bad entry" on Monday, "entered too early" on Thursday and "should've
 * waited" the week after, and no software on earth can tell those are the same
 * admission. Nothing can be counted, so nothing can be learned.
 *
 * A fixed vocabulary can be counted. Tick "moved my SL" on six trades and the
 * review can tell you exactly what that habit cost — one tap instead of a
 * sentence, and it adds up.
 *
 * ── How this is organised ─────────────────────────────────────────────────
 * Not as a flat list of mistakes, but along the chain a thesis is actually
 * built from: context → draw on liquidity → key level → orderflow → time →
 * entry → stop → target. A trade fails at a *link*, and knowing which link
 * is the difference between "I had a bad week" and "my DOL read is fine, my
 * entry timing is what's costing me".
 *
 * The free-text note stays for everything that doesn't repeat.
 */

export type ReasonGroup =
  | 'context'
  | 'timing'
  | 'entry'
  | 'stop'
  | 'target'
  | 'state'
  | 'good'

export interface ReasonOption {
  id: string
  label: string
  group: ReasonGroup
  /** Offered when the trade went this way. Some fit any outcome. */
  when: 'loss' | 'win' | 'any'
  /** Longer form for anyone who doesn't use the shorthand. */
  hint?: string
}

/**
 * Deliberately blunt and first-person — "chased it" is what a trader actually
 * thinks. Nothing here is phrased as a failing of the person; they describe
 * the trade.
 */
export const REASONS: ReasonOption[] = [
  // ── the read: higher-timeframe thesis ──────────────────────────────────
  { id: 'bias-wrong', label: 'Bias was wrong', group: 'context', when: 'loss' },
  {
    id: 'context-wrong',
    label: 'Context was wrong',
    group: 'context',
    when: 'loss',
    hint: 'Higher-timeframe picture read the wrong way',
  },
  {
    id: 'dol-wrong',
    label: 'DOL was wrong',
    group: 'context',
    when: 'loss',
    hint: 'Price was drawing to different liquidity than I thought',
  },
  {
    id: 'kl-wrong',
    label: 'Key level was wrong',
    group: 'context',
    when: 'loss',
    hint: 'The level I traded from did not hold or did not matter',
  },
  {
    id: 'structure-misread',
    label: 'Misread structure',
    group: 'context',
    when: 'loss',
    hint: 'Called the shift or the trend incorrectly',
  },
  {
    id: 'orderflow-against',
    label: 'Orderflow against me',
    group: 'context',
    when: 'any',
    hint: 'Delivery was going the other way the whole time',
  },
  { id: 'against-trend', label: 'Traded against trend', group: 'context', when: 'any' },
  { id: 'missed-news', label: 'Missed the news', group: 'context', when: 'any' },
  { id: 'bias-right', label: 'Bias was right', group: 'context', when: 'win' },
  { id: 'dol-right', label: 'DOL was right', group: 'context', when: 'win' },
  { id: 'context-right', label: 'Context was right', group: 'context', when: 'win' },

  // ── when ───────────────────────────────────────────────────────────────
  {
    id: 'wrong-time',
    label: 'Wrong time of day',
    group: 'timing',
    when: 'any',
    hint: 'Outside the window this setup actually works in',
  },
  { id: 'wrong-session', label: 'Wrong session', group: 'timing', when: 'any' },
  { id: 'outside-killzone', label: 'Outside my killzone', group: 'timing', when: 'any' },
  { id: 'news-timing', label: 'Traded into news', group: 'timing', when: 'any' },
  { id: 'low-liquidity', label: 'Dead market', group: 'timing', when: 'any' },
  { id: 'right-time', label: 'Timing was right', group: 'timing', when: 'win' },

  // ── getting in ─────────────────────────────────────────────────────────
  { id: 'early', label: 'Entered too early', group: 'entry', when: 'any' },
  { id: 'late', label: 'Entered too late', group: 'entry', when: 'any' },
  { id: 'chased', label: 'Chased price', group: 'entry', when: 'any' },
  { id: 'no-confirmation', label: 'No confirmation', group: 'entry', when: 'loss' },
  {
    id: 'no-entry-model',
    label: 'No entry model',
    group: 'entry',
    when: 'loss',
    hint: 'Took it without the pattern I normally require',
  },
  { id: 'wrong-entry-tf', label: 'Wrong entry timeframe', group: 'entry', when: 'loss' },
  { id: 'bad-price', label: 'Bad price', group: 'entry', when: 'any' },
  { id: 'clean-entry', label: 'Clean entry', group: 'entry', when: 'win' },
  { id: 'waited', label: 'Waited for my setup', group: 'entry', when: 'win' },

  // ── the stop ───────────────────────────────────────────────────────────
  { id: 'sl-too-tight', label: 'SL too tight', group: 'stop', when: 'loss' },
  { id: 'sl-too-wide', label: 'SL too wide', group: 'stop', when: 'any' },
  {
    id: 'sl-obvious',
    label: 'SL in obvious liquidity',
    group: 'stop',
    when: 'loss',
    hint: 'Parked where everyone else had theirs',
  },
  { id: 'moved-stop', label: 'Moved my SL', group: 'stop', when: 'any' },
  { id: 'no-stop', label: 'No SL', group: 'stop', when: 'any' },
  { id: 'sl-right', label: 'SL was well placed', group: 'stop', when: 'win' },

  // ── the target ─────────────────────────────────────────────────────────
  { id: 'target-unrealistic', label: 'Target too far', group: 'target', when: 'any' },
  { id: 'target-too-close', label: 'Target too close', group: 'target', when: 'any' },
  { id: 'closed-early', label: 'Closed before target', group: 'target', when: 'any' },
  { id: 'no-partials', label: "Didn't take partials", group: 'target', when: 'any' },
  { id: 'moved-target', label: 'Moved my target', group: 'target', when: 'any' },
  { id: 'gave-back', label: 'Let a winner turn red', group: 'target', when: 'loss' },
  { id: 'held-too-long', label: 'Held too long', group: 'target', when: 'any' },
  { id: 'let-it-run', label: 'Let it run', group: 'target', when: 'win' },
  { id: 'hit-target', label: 'Hit my target', group: 'target', when: 'win' },

  // ── where my head was ──────────────────────────────────────────────────
  { id: 'revenge', label: 'Revenge trade', group: 'state', when: 'any' },
  { id: 'fomo', label: 'FOMO', group: 'state', when: 'any' },
  { id: 'bored', label: 'Boredom trade', group: 'state', when: 'any' },
  { id: 'tired', label: 'Tired', group: 'state', when: 'any' },
  { id: 'distracted', label: 'Distracted', group: 'state', when: 'any' },
  { id: 'overconfident', label: 'Overconfident', group: 'state', when: 'any' },
  { id: 'hesitated', label: 'Hesitated', group: 'state', when: 'any' },
  { id: 'oversized', label: 'Size too big', group: 'state', when: 'any' },

  // ── what went right ────────────────────────────────────────────────────
  { id: 'followed-plan', label: 'Followed my plan', group: 'good', when: 'any' },
  { id: 'patient', label: 'Patient', group: 'good', when: 'win' },
  { id: 'managed-well', label: 'Managed it well', group: 'good', when: 'win' },
  { id: 'all-aligned', label: 'Everything aligned', group: 'good', when: 'win' },
  {
    id: 'good-trade-bad-result',
    label: 'Good trade, bad result',
    group: 'good',
    when: 'loss',
    hint: 'Executed properly and it still lost — that happens',
  },
  { id: 'lucky', label: 'Got lucky', group: 'good', when: 'win' },
]

export const REASON_GROUP_LABEL: Record<ReasonGroup, string> = {
  context: 'The read',
  timing: 'Timing',
  entry: 'The entry',
  stop: 'Stop loss',
  target: 'Target',
  state: 'Where my head was',
  good: 'What went right',
}

/** In the order a thesis is built, which is the order a post-mortem runs. */
export const REASON_GROUPS: ReasonGroup[] = [
  'context',
  'timing',
  'entry',
  'stop',
  'target',
  'state',
  'good',
]

export function reasonsFor(outcome: 'win' | 'loss' | 'flat'): ReasonOption[] {
  if (outcome === 'flat') return REASONS.filter((r) => r.when === 'any')
  return REASONS.filter((r) => r.when === 'any' || r.when === outcome)
}

export function reasonLabel(id: string): string {
  return REASONS.find((r) => r.id === id)?.label ?? id
}

export function reasonGroupOf(id: string): ReasonGroup | undefined {
  return REASONS.find((r) => r.id === id)?.group
}

/** The ones describing a link that broke, for the "what's costing me" rollup. */
export const COSTLY_REASONS = new Set(
  REASONS.filter((r) => r.group !== 'good' && r.when !== 'win').map((r) => r.id),
)

export function isCostly(id: string): boolean {
  return COSTLY_REASONS.has(id)
}

/**
 * Which link in the chain broke most often, and what it cost.
 *
 * The payoff for a fixed vocabulary: "your entries are fine, your targets are
 * where the money goes" is a sentence a free-text journal can never produce.
 */
export function weakestLink(
  reasonTags: { tags: string[]; pnl: number }[],
): { group: ReasonGroup; count: number; pnl: number } | null {
  const totals = new Map<ReasonGroup, { count: number; pnl: number }>()
  for (const row of reasonTags) {
    // A trade's P&L is attributed once per group, not once per tag, so
    // ticking three stop-related boxes doesn't triple-count the loss.
    const groups = new Set(
      row.tags.filter(isCostly).map(reasonGroupOf).filter(Boolean) as ReasonGroup[],
    )
    for (const g of groups) {
      const hit = totals.get(g) ?? { count: 0, pnl: 0 }
      hit.count += 1
      hit.pnl += row.pnl
      totals.set(g, hit)
    }
  }

  const ranked = [...totals.entries()]
    .filter(([, v]) => v.count >= 3 && v.pnl < 0)
    .sort((a, b) => a[1].pnl - b[1].pnl)

  if (ranked.length === 0) return null
  const [group, { count, pnl }] = ranked[0]
  return { group, count, pnl }
}
