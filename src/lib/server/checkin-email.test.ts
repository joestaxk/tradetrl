import { describe, expect, it } from 'vitest'
import { buildCheckIn, escapeHtml } from './checkin-email'
import { makeTrade } from '#/test/factories'

const base = { date: '2026-07-14', displayName: 'Sam Rivers', appUrl: 'https://x.test' }

describe('when an email is sent at all', () => {
  it('sends nothing for a day with no trades — silence is the feature', () => {
    expect(buildCheckIn({ ...base, trades: [] })).toBeNull()
  })

  it('sends for a day with trades', () => {
    expect(buildCheckIn({ ...base, trades: [makeTrade({ pnl: 120 })] })).not.toBeNull()
  })
})

describe('content', () => {
  it('greets by first name only', () => {
    const c = buildCheckIn({ ...base, trades: [makeTrade()] })!
    expect(c.heading).toBe('Evening, Sam.')
  })

  it('greets neutrally when there is no name', () => {
    const c = buildCheckIn({ ...base, displayName: null, trades: [makeTrade()] })!
    expect(c.heading).toBe('Evening.')
  })

  it('states the day in the subject with the net figure', () => {
    const c = buildCheckIn({ ...base, trades: [makeTrade({ pnl: 250 })] })!
    expect(c.subject).toBe('Tuesday, 14 July — +$250.00')
  })

  it('phrases a single trade differently from several', () => {
    const one = buildCheckIn({ ...base, trades: [makeTrade({ pair: 'XAUUSD', pnl: 300 })] })!
    expect(one.lines[0]).toContain('One trade today — XAUUSD')

    const many = buildCheckIn({
      ...base,
      trades: [makeTrade({ pnl: 300 }), makeTrade({ pnl: -100 })],
    })!
    expect(many.lines[0]).toContain('2 trades today, 1 of them green')
  })

  it('nudges about missing reasoning without pressuring', () => {
    const c = buildCheckIn({ ...base, trades: [makeTrade()] })!
    const line = c.lines.find((l) => l.includes('why'))
    expect(line).toContain('No pressure')
  })

  it('says nothing about reasoning when every trade has one', () => {
    const c = buildCheckIn({
      ...base,
      trades: [makeTrade({ reason: 'London sweep' })],
    })!
    expect(c.lines.some((l) => l.includes("didn't write down why"))).toBe(false)
  })

  it('mentions violations once, flatly, and defers them to the review', () => {
    const c = buildCheckIn({
      ...base,
      trades: [
        makeTrade({ ruleViolations: [{ code: 'risk-exceeded', message: 'x' }] }),
        makeTrade(),
      ],
    })!
    const line = c.lines.find((l) => l.includes('outside the rules'))
    expect(line).toContain('weekly review')
    expect(c.lines.filter((l) => l.includes('outside the rules'))).toHaveLength(1)
  })

  it('asks a different question after a losing day', () => {
    const green = buildCheckIn({ ...base, trades: [makeTrade({ pnl: 100 })] })!
    const red = buildCheckIn({ ...base, trades: [makeTrade({ pnl: -100 })] })!
    expect(green.question).not.toBe(red.question)
    expect(red.question).toContain('bad decision')
  })
})

describe('tone — §0 says the journal has no opinion', () => {
  const cases = [
    ['a big win', [makeTrade({ pnl: 5000 })]],
    ['a big loss', [makeTrade({ pnl: -5000 })]],
    ['a broken rule', [makeTrade({ ruleViolations: [{ code: 'risk-exceeded' as const, message: 'x' }] })]],
  ] as const

  it.each(cases)('never congratulates, commiserates or scolds after %s', (_label, trades) => {
    const c = buildCheckIn({ ...base, trades: [...trades] })!
    const body = [...c.lines, c.question, c.heading].join(' ').toLowerCase()
    for (const word of [
      'congratulations',
      'well done',
      'great job',
      'unlucky',
      'sorry',
      'you should',
      'you must',
      'never again',
    ]) {
      expect(body).not.toContain(word)
    }
    expect(body).not.toMatch(/!/)
  })
})

describe('html rendering', () => {
  it('produces a full document with both html and text parts', () => {
    const c = buildCheckIn({ ...base, trades: [makeTrade()] })!
    expect(c.html).toMatch(/^<!doctype html>/)
    expect(c.html).toContain('</html>')
    expect(c.text).toContain('Open your journal: https://x.test/app')
  })

  it('links to settings so opting out is one click', () => {
    const c = buildCheckIn({ ...base, trades: [makeTrade()] })!
    expect(c.html).toContain('https://x.test/app/settings')
  })

  it('escapes user-controlled text rather than injecting it raw', () => {
    const c = buildCheckIn({
      ...base,
      displayName: '<script>alert(1)</script>',
      trades: [makeTrade()],
    })!
    expect(c.html).not.toContain('<script>')
    expect(c.html).toContain('&lt;script&gt;')
  })

  it('escapes every dangerous character', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;')
  })

  it('colours the figure by sign', () => {
    expect(buildCheckIn({ ...base, trades: [makeTrade({ pnl: 100 })] })!.html).toContain(
      '#4dbba3',
    )
    expect(buildCheckIn({ ...base, trades: [makeTrade({ pnl: -100 })] })!.html).toContain(
      '#ea8168',
    )
  })
})
