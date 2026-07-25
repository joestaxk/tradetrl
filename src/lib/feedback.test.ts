import { describe, expect, it } from 'vitest'
import {
  FEEDBACK_MIN_DAYS,
  FEEDBACK_MIN_TRADES,
  FEEDBACK_SNOOZE_MS,
  MAX_NOTE,
  MOODS,
  normalizeNote,
  replyFor,
  shouldAsk,
} from './feedback'

const NOW = 1_800_000_000_000
const ready = { tradeCount: FEEDBACK_MIN_TRADES, activeDays: FEEDBACK_MIN_DAYS, now: NOW }

describe('when we ask', () => {
  it('asks once the trader has actually used the thing', () => {
    expect(shouldAsk({ state: undefined, ...ready })).toBe(true)
  })

  it('never asks someone with nothing to have an opinion about', () => {
    expect(shouldAsk({ state: undefined, ...ready, tradeCount: 1 })).toBe(false)
    expect(shouldAsk({ state: undefined, ...ready, activeDays: 1 })).toBe(false)
  })

  it('needs both enough trades and enough days', () => {
    // 20 trades in one sitting is one opinion about one session.
    expect(shouldAsk({ state: undefined, ...ready, activeDays: 1, tradeCount: 20 })).toBe(false)
  })
})

describe('never asking twice', () => {
  it('goes silent forever once answered', () => {
    expect(shouldAsk({ state: { submittedAt: NOW - 1000 }, ...ready })).toBe(false)
  })

  it('stays silent even years later', () => {
    expect(
      shouldAsk({
        state: { submittedAt: NOW - 5 * 365 * 86_400_000 },
        ...ready,
      }),
    ).toBe(false)
  })

  it('stays silent no matter how much more they use it', () => {
    expect(
      shouldAsk({
        state: { submittedAt: NOW - 1000, mood: 'love' },
        ...ready,
        tradeCount: 5000,
        activeDays: 400,
      }),
    ).toBe(false)
  })
})

describe('respecting a dismissal', () => {
  it('goes quiet for a long time after being closed', () => {
    expect(shouldAsk({ state: { dismissedAt: NOW - 1000 }, ...ready })).toBe(false)
    expect(
      shouldAsk({ state: { dismissedAt: NOW - FEEDBACK_SNOOZE_MS + 1000 }, ...ready }),
    ).toBe(false)
  })

  it('may ask once more long afterwards — a dismissal is not a refusal', () => {
    expect(
      shouldAsk({ state: { dismissedAt: NOW - FEEDBACK_SNOOZE_MS - 1000 }, ...ready }),
    ).toBe(true)
  })

  it('treats an answer as final even if they dismissed a previous one', () => {
    expect(
      shouldAsk({
        state: { dismissedAt: NOW - FEEDBACK_SNOOZE_MS - 1000, submittedAt: NOW - 500 },
        ...ready,
      }),
    ).toBe(false)
  })
})

describe('tone', () => {
  it('replies warmly to every mood, including the unhappy one', () => {
    for (const m of MOODS) {
      const reply = replyFor(m.value)
      expect(reply.length).toBeGreaterThan(0)
      expect(reply).not.toMatch(/!/)
    }
    // The worst rating gets the warmest reply — they did us the biggest favour.
    expect(replyFor('bad')).toContain('helps most')
  })

  it('never sells, argues or asks for a review', () => {
    const all = MOODS.map((m) => `${m.label} ${m.reply}`)
      .join(' ')
      .toLowerCase()
    for (const word of ['upgrade', 'pro', 'rate us', 'review', 'share', 'sorry to hear']) {
      expect(all).not.toContain(word)
    }
  })

  it('offers a genuine "not for me" — a rating scale with no bad option is theatre', () => {
    expect(MOODS.map((m) => m.value)).toContain('bad')
  })
})

describe('note handling', () => {
  it('drops an empty or whitespace-only note rather than storing it', () => {
    expect(normalizeNote('')).toBeUndefined()
    expect(normalizeNote('   \n  ')).toBeUndefined()
  })

  it('trims what it keeps', () => {
    expect(normalizeNote('  the calendar is great  ')).toBe('the calendar is great')
  })

  it('caps a paste so one submission cannot blow up a document', () => {
    expect(normalizeNote('x'.repeat(50_000))).toHaveLength(MAX_NOTE)
  })
})
