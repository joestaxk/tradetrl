/**
 * Journals = trading accounts.
 *
 * A trader running a 50k prop evaluation alongside a 100k personal account
 * needs those kept apart: separate calendars, separate stats, and — critically
 * — separate balances, because "1% risk" is $500 on one and $1,000 on the
 * other. Reading account size off the *user* rather than the account would
 * make every risk figure on one of them wrong.
 *
 * Per-journal settings are optional and fall back to the user's defaults, so
 * an existing single-journal trader never has to fill anything in twice.
 */

import type { Journal, ResolvedJournal, UserDoc, UserPrefs } from './types'

export const DEFAULT_JOURNAL_ID = 'default'

/**
 * The "every account at once" lens.
 *
 * Not a real journal — no balance, no rules, nothing stored under it. It is a
 * way of *looking* at trades, which is why logging is not allowed while it is
 * selected: a trade has to belong to an account for its risk to mean anything.
 */
export const ALL_JOURNALS_ID = '__all__'

export function isAllJournals(id: string | undefined): boolean {
  return id === ALL_JOURNALS_ID
}

/** The synthetic account shown while the all-accounts lens is active. */
export function allJournalsView(prefs: UserPrefs | undefined): ResolvedJournal {
  return {
    id: ALL_JOURNALS_ID,
    name: 'All accounts',
    // No balance and no rules on purpose. Summing balances across a prop
    // evaluation and a personal account produces a number that means nothing,
    // and a blended risk rule would misreport every trade under it.
    startingBalance: undefined,
    startedOn: undefined,
    riskBasis: 'starting',
    currency: prefs?.currency ?? 'USD',
    riskRules: {},
  }
}

export function resolveJournal(
  journal: Journal | null | undefined,
  prefs: UserPrefs | undefined,
): ResolvedJournal {
  return {
    id: journal?.id ?? DEFAULT_JOURNAL_ID,
    name: journal?.name ?? 'My journal',
    kind: journal?.kind,
    // `??` not `||`, so an explicit 0 is respected rather than silently
    // falling through to the user default.
    startingBalance: journal?.startingBalance ?? prefs?.accountSize,
    startedOn: journal?.startedOn,
    riskBasis: journal?.riskBasis ?? 'starting',
    currency: journal?.currency ?? prefs?.currency ?? 'USD',
    riskRules: journal?.riskRules ?? prefs?.riskRules ?? {},
  }
}

export function activeJournal(
  journals: Journal[],
  user: UserDoc | null | undefined,
): Journal | null {
  if (journals.length === 0) return null
  return (
    journals.find((j) => j.id === user?.activeJournalId) ??
    journals.find((j) => j.id === DEFAULT_JOURNAL_ID) ??
    journals[0]
  )
}

/** Journals a trader can switch between — archived ones stay out of the way. */
export function visibleJournals(journals: Journal[]): Journal[] {
  return journals.filter((j) => !j.archivedAt)
}

const KIND_LABELS: Record<string, string> = {
  prop: 'Prop firm',
  personal: 'Personal',
  demo: 'Demo',
  backtest: 'Backtest',
}

export const JOURNAL_KINDS = ['personal', 'prop', 'demo', 'backtest'] as const

export function kindLabel(kind: string | undefined): string | null {
  if (!kind) return null
  return KIND_LABELS[kind] ?? kind
}

/**
 * '50k prop' style summary for the switcher. Compact on purpose — this sits in
 * a header at 320px.
 */
export function journalSubtitle(journal: ResolvedJournal): string {
  const bits: string[] = []
  if (typeof journal.startingBalance === 'number' && journal.startingBalance > 0) {
    bits.push(compactAmount(journal.startingBalance, journal.currency))
  }
  const label = kindLabel(journal.kind)
  if (label) bits.push(label)
  return bits.join(' · ')
}

export function compactAmount(n: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    notation: n >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: n >= 10_000 ? 0 : 0,
  }).format(n)
}
