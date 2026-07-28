import { describe, expect, it } from 'vitest'
import {
  ALL_JOURNALS_ID,
  DEFAULT_JOURNAL_ID,
  activeJournal,
  allJournalsView,
  compactAmount,
  isAllJournals,
  journalSubtitle,
  kindLabel,
  resolveJournal,
  visibleJournals,
} from './journals'
import { makePrefs } from '#/test/factories'
import type { Journal, UserDoc } from './types'

const journal = (over: Partial<Journal> = {}): Journal => ({
  id: 'j1',
  name: 'FTMO 50k',
  createdAt: 0,
  ...over,
})

const user = (over: Partial<UserDoc> = {}): UserDoc => ({
  uid: 'u1',
  displayName: null,
  email: null,
  photoURL: null,
  createdAt: 0,
  lastActiveAt: 0,
  plan: 'pro',
  activeJournalId: 'j1',
  prefs: makePrefs(),
  ...over,
})

describe('resolveJournal', () => {
  it('prefers the account’s own balance over the user default', () => {
    const r = resolveJournal(
      journal({ startingBalance: 50_000 }),
      makePrefs({ accountSize: 10_000 }),
    )
    expect(r.startingBalance).toBe(50_000)
  })

  it('falls back to the user default when the account has none', () => {
    const r = resolveJournal(journal(), makePrefs({ accountSize: 10_000 }))
    expect(r.startingBalance).toBe(10_000)
  })

  it('respects an explicit zero rather than falling through to the default', () => {
    // `||` here would silently substitute the user's balance for a blown
    // account, making every risk percentage wrong.
    const r = resolveJournal(journal({ startingBalance: 0 }), makePrefs({ accountSize: 10_000 }))
    expect(r.startingBalance).toBe(0)
  })

  it('keeps two accounts’ balances genuinely separate', () => {
    const prefs = makePrefs({ accountSize: 10_000 })
    const prop = resolveJournal(journal({ id: 'a', startingBalance: 50_000 }), prefs)
    const personal = resolveJournal(journal({ id: 'b', startingBalance: 100_000 }), prefs)
    expect(prop.startingBalance).toBe(50_000)
    expect(personal.startingBalance).toBe(100_000)
  })

  it('resolves currency with a USD floor', () => {
    expect(resolveJournal(journal({ currency: 'GBP' }), makePrefs()).currency).toBe('GBP')
    expect(resolveJournal(journal(), makePrefs({ currency: 'EUR' })).currency).toBe('EUR')
    expect(resolveJournal(null, undefined).currency).toBe('USD')
  })

  it('uses the account’s rules when it has them', () => {
    const r = resolveJournal(
      journal({ riskRules: { maxRiskPerTradePct: 0.5 } }),
      makePrefs({ riskRules: { maxRiskPerTradePct: 2 } }),
    )
    expect(r.riskRules.maxRiskPerTradePct).toBe(0.5)
  })

  it('never returns undefined rules', () => {
    expect(resolveJournal(null, undefined).riskRules).toEqual({})
  })

  it('produces a usable shape with nothing configured at all', () => {
    const r = resolveJournal(null, undefined)
    expect(r.id).toBe(DEFAULT_JOURNAL_ID)
    expect(r.name).toBe('My journal')
  })
})

describe('activeJournal', () => {
  const a = journal({ id: 'a', name: 'A' })
  const b = journal({ id: 'b', name: 'B' })

  it('picks the account the user last selected', () => {
    expect(activeJournal([a, b], user({ activeJournalId: 'b' }))?.id).toBe('b')
  })

  it('falls back to the default account when the selection is stale', () => {
    const d = journal({ id: DEFAULT_JOURNAL_ID })
    // A deleted account must not leave the trader looking at nothing.
    expect(activeJournal([d, a], user({ activeJournalId: 'gone' }))?.id).toBe(
      DEFAULT_JOURNAL_ID,
    )
  })

  it('falls back to the first account when there is no default either', () => {
    expect(activeJournal([a, b], user({ activeJournalId: 'gone' }))?.id).toBe('a')
  })

  it('has nothing to return when there are no accounts', () => {
    expect(activeJournal([], user())).toBeNull()
  })
})

describe('visibleJournals', () => {
  it('hides archived accounts from the switcher', () => {
    const rows = visibleJournals([
      journal({ id: 'a' }),
      journal({ id: 'b', archivedAt: 1 }),
    ])
    expect(rows.map((j) => j.id)).toEqual(['a'])
  })
})

describe('labels', () => {
  it('names the known account types', () => {
    expect(kindLabel('prop')).toBe('Prop firm')
    expect(kindLabel('personal')).toBe('Personal')
    expect(kindLabel(undefined)).toBeNull()
  })

  it('passes an unknown type through rather than dropping it', () => {
    expect(kindLabel('futures')).toBe('futures')
  })

  it('summarises an account compactly for the switcher', () => {
    expect(
      journalSubtitle(resolveJournal(journal({ startingBalance: 50_000, kind: 'prop' }), makePrefs())),
    ).toBe('$50K · Prop firm')
  })

  it('says only what it knows', () => {
    expect(journalSubtitle(resolveJournal(journal({ kind: 'personal' }), makePrefs()))).toBe(
      'Personal',
    )
    expect(journalSubtitle(resolveJournal(journal(), makePrefs()))).toBe('')
  })

  it('formats balances in the account currency', () => {
    expect(compactAmount(100_000, 'USD')).toBe('$100K')
    expect(compactAmount(500, 'USD')).toBe('$500')
  })
})

describe('the all-accounts lens', () => {
  it('is recognisable, and nothing else is', () => {
    expect(isAllJournals(ALL_JOURNALS_ID)).toBe(true)
    expect(isAllJournals(DEFAULT_JOURNAL_ID)).toBe(false)
    expect(isAllJournals('some-firestore-id')).toBe(false)
    expect(isAllJournals(undefined)).toBe(false)
  })

  it('reports no balance, because summing accounts describes nothing', () => {
    /*
      A prop evaluation plus a personal account do not add up to a meaningful
      figure, and a blended risk base would misstate every trade shown under
      the lens. Better to show nothing than something confidently wrong.
    */
    const view = allJournalsView(makePrefs({ accountSize: 50_000 }))
    expect(view.startingBalance).toBeUndefined()
    expect(view.riskRules).toEqual({})
  })

  it('still follows the trader’s display currency', () => {
    expect(allJournalsView(makePrefs({ currency: 'GBP' })).currency).toBe('GBP')
  })

  it('is named for what it is', () => {
    expect(allJournalsView(undefined).name).toBe('All accounts')
  })

  it('does not collide with a real account', () => {
    const real = resolveJournal(
      { id: 'acct-1', name: 'FTMO 50k', createdAt: 0, startingBalance: 50_000 },
      makePrefs(),
    )
    expect(isAllJournals(real.id)).toBe(false)
    expect(real.startingBalance).toBe(50_000)
  })
})
