import { describe, expect, it } from 'vitest'
import { TELEGRAM_MAX, buildFeedbackMessage, escapeTelegramHtml } from './telegram'

describe('escaping', () => {
  it('escapes the characters that break Telegram HTML mode', () => {
    // An unescaped '<' makes the whole API call fail, losing the feedback.
    expect(escapeTelegramHtml('a < b > c & d')).toBe('a &lt; b &gt; c &amp; d')
  })

  it('escapes an ampersand before the angle brackets it might form', () => {
    expect(escapeTelegramHtml('&lt;')).toBe('&amp;lt;')
  })

  it('leaves ordinary text alone', () => {
    expect(escapeTelegramHtml('the calendar is great')).toBe('the calendar is great')
  })
})

describe('feedback message', () => {
  it('leads with the mood in plain words', () => {
    expect(buildFeedbackMessage({ mood: 'love' })).toContain('Loves it')
    expect(buildFeedbackMessage({ mood: 'bad' })).toContain('Not for them')
  })

  it('falls back gracefully for an unknown mood', () => {
    expect(buildFeedbackMessage({ mood: 'weird' })).toContain('weird')
  })

  it('includes the note', () => {
    expect(buildFeedbackMessage({ mood: 'good', note: 'the heatmap is useful' })).toContain(
      'the heatmap is useful',
    )
  })

  it('carries contact details so a reply is possible', () => {
    const msg = buildFeedbackMessage({
      mood: 'good',
      name: 'Sam Rivers',
      email: 'sam@example.com',
      telegram: 'samr',
    })
    expect(msg).toContain('Sam Rivers')
    expect(msg).toContain('sam@example.com')
    expect(msg).toContain('@samr')
  })

  it('does not double the @ on a handle', () => {
    expect(buildFeedbackMessage({ telegram: '@samr' })).toContain('@samr')
    expect(buildFeedbackMessage({ telegram: '@samr' })).not.toContain('@@')
  })

  it('says plainly when there is no way to reply', () => {
    // Otherwise silence looks like a bug rather than the sender's choice.
    expect(buildFeedbackMessage({ mood: 'meh' })).toMatch(/sent anonymously/i)
  })

  it('escapes user text rather than injecting it raw', () => {
    const msg = buildFeedbackMessage({
      mood: 'bad',
      note: '<script>alert(1)</script>',
      name: 'a<b',
    })
    expect(msg).not.toContain('<script>')
    expect(msg).toContain('&lt;script&gt;')
    expect(msg).toContain('a&lt;b')
  })

  it('keeps its own formatting tags intact', () => {
    expect(buildFeedbackMessage({ mood: 'love' })).toMatch(/^<b>/)
  })

  it('truncates rather than letting Telegram reject the whole message', () => {
    const msg = buildFeedbackMessage({ mood: 'good', note: 'x'.repeat(10_000) })
    expect(msg.length).toBeLessThanOrEqual(TELEGRAM_MAX)
    expect(msg).toMatch(/truncated/i)
  })

  it('notes where in the app it came from', () => {
    expect(buildFeedbackMessage({ mood: 'good', context: '/app/insights' })).toContain(
      '/app/insights',
    )
  })
})
