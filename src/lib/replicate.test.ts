import { describe, expect, it } from 'vitest'
import { replicaSummary, replicateTrade, scaleBetween } from './replicate'
import type { ResolvedJournal, TradeDraft } from './types'

const account = (id: string, name: string): ResolvedJournal => ({
  id,
  name,
  currency: 'USD',
  riskBasis: 'starting',
  riskRules: {},
})

const draft = (over: Partial<TradeDraft> = {}): TradeDraft =>
  ({
    date: '2026-07-14',
    pair: 'EURUSD',
    direction: 'buy',
    status: 'closed',
    outcome: 'win',
    pnl: 1_000,
    lotSize: 0.5,
    riskAmount: 500,
    riskPct: 1,
    rMultiple: 2,
    ...over,
  }) as TradeDraft

const targets = [
  { journal: account('a', '50k prop'), riskBase: 50_000 },
  { journal: account('b', '100k prop'), riskBase: 100_000 },
]

describe('scaleBetween', () => {
  it('is the ratio of the two risk bases', () => {
    expect(scaleBetween(50_000, 100_000)).toBe(2)
    expect(scaleBetween(100_000, 50_000)).toBe(0.5)
    expect(scaleBetween(50_000, 50_000)).toBe(1)
  })

  it('refuses to scale without both figures', () => {
    expect(scaleBetween(null, 100_000)).toBeNull()
    expect(scaleBetween(50_000, null)).toBeNull()
    expect(scaleBetween(0, 100_000)).toBeNull()
  })
})

describe('the same trade across accounts', () => {
  it('leaves the source account exactly as filled in', () => {
    const [source] = replicateTrade({
      draft: draft(),
      sourceJournalId: 'a',
      sourceRiskBase: 50_000,
      targets,
    })
    expect(source.scale).toBe(1)
    expect(source.draft.pnl).toBe(1_000)
    expect(source.draft.lotSize).toBe(0.5)
  })

  it('doubles the money on an account twice the size', () => {
    /*
      The point of the whole module. 1% of 50k is $500 and 1% of 100k is
      $1,000 — the same decision, twice the money. Copying the figures across
      unchanged would report the bigger account as risking half what it did.
    */
    const [, bigger] = replicateTrade({
      draft: draft(),
      sourceJournalId: 'a',
      sourceRiskBase: 50_000,
      targets,
    })
    expect(bigger.scale).toBe(2)
    expect(bigger.draft.riskAmount).toBe(1_000)
    expect(bigger.draft.pnl).toBe(2_000)
    expect(bigger.draft.lotSize).toBe(1)
  })

  it('holds the percentage and the R — that is what is being kept constant', () => {
    const [, bigger] = replicateTrade({
      draft: draft(),
      sourceJournalId: 'a',
      sourceRiskBase: 50_000,
      targets,
    })
    expect(bigger.draft.riskPct).toBe(1)
    expect(bigger.draft.rMultiple).toBe(2)
  })

  it('scales a loss down as readily as a win up', () => {
    const [, smaller] = replicateTrade({
      draft: draft({ pnl: -500, outcome: 'loss' }),
      sourceJournalId: 'b',
      sourceRiskBase: 100_000,
      targets: [
        { journal: account('b', '100k'), riskBase: 100_000 },
        { journal: account('a', '25k'), riskBase: 25_000 },
      ],
    })
    expect(smaller.scale).toBe(0.25)
    expect(smaller.draft.pnl).toBe(-125)
  })

  it('rounds lots to something a broker will actually accept', () => {
    const [, odd] = replicateTrade({
      draft: draft({ lotSize: 0.5 }),
      sourceJournalId: 'a',
      sourceRiskBase: 50_000,
      targets: [
        { journal: account('a', 'source'), riskBase: 50_000 },
        { journal: account('c', 'odd size'), riskBase: 33_333 },
      ],
    })
    // 0.5 × 0.6667 = 0.333…, which is not an order anyone can place.
    expect(odd.draft.lotSize).toBe(0.33)
  })

  it('never rounds a real position away to zero', () => {
    const [, tiny] = replicateTrade({
      draft: draft({ lotSize: 0.01 }),
      sourceJournalId: 'a',
      sourceRiskBase: 100_000,
      targets: [
        { journal: account('a', 'big'), riskBase: 100_000 },
        { journal: account('d', 'tiny'), riskBase: 1_000 },
      ],
    })
    expect(tiny.draft.lotSize).toBe(0.01)
  })

  it('copies unchanged, and says so, when a balance is missing', () => {
    const [, unknown] = replicateTrade({
      draft: draft(),
      sourceJournalId: 'a',
      sourceRiskBase: 50_000,
      targets: [
        { journal: account('a', 'source'), riskBase: 50_000 },
        { journal: account('e', 'no balance set'), riskBase: null },
      ],
    })
    expect(unknown.unscaled).toBe(true)
    expect(unknown.draft.pnl).toBe(1_000)
  })

  it('handles a minimal trade with no money figures at all', () => {
    const [, bigger] = replicateTrade({
      draft: draft({ lotSize: undefined, riskAmount: undefined, rMultiple: undefined }),
      sourceJournalId: 'a',
      sourceRiskBase: 50_000,
      targets,
    })
    expect(bigger.draft.lotSize).toBeUndefined()
    expect(bigger.draft.riskAmount).toBeUndefined()
    expect(bigger.draft.pnl).toBe(2_000)
  })

  it('produces one draft per selected account', () => {
    const four = replicateTrade({
      draft: draft(),
      sourceJournalId: 'a',
      sourceRiskBase: 50_000,
      targets: [
        { journal: account('a', 'A'), riskBase: 50_000 },
        { journal: account('b', 'B'), riskBase: 50_000 },
        { journal: account('c', 'C'), riskBase: 50_000 },
        { journal: account('d', 'D'), riskBase: 50_000 },
      ],
    })
    expect(four).toHaveLength(4)
    expect(four.map((r) => r.journalId)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('the summary line', () => {
  it('says nothing for a single account', () => {
    const one = replicateTrade({
      draft: draft(),
      sourceJournalId: 'a',
      sourceRiskBase: 50_000,
      targets: [{ journal: account('a', 'A'), riskBase: 50_000 }],
    })
    expect(replicaSummary(one)).toBe('')
  })

  it('totals what is genuinely at risk across all of them', () => {
    // The number a multi-account trader most needs and never calculates.
    const two = replicateTrade({
      draft: draft(),
      sourceJournalId: 'a',
      sourceRiskBase: 50_000,
      targets,
    })
    expect(replicaSummary(two)).toBe('2 accounts · $1,500 at risk in total')
  })

  it('still counts the accounts when no risk figures exist', () => {
    const two = replicateTrade({
      draft: draft({ riskAmount: undefined }),
      sourceJournalId: 'a',
      sourceRiskBase: 50_000,
      targets,
    })
    expect(replicaSummary(two)).toBe('This will be logged to 2 accounts.')
  })
})
