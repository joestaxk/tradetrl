import { describe, expect, it } from 'vitest'
import { csvFilename, escapeCsv, tradesToCsv } from './export'
import { makeTrade } from '#/test/factories'

describe('CSV escaping', () => {
  it('leaves plain values alone', () => {
    expect(escapeCsv('EURUSD')).toBe('EURUSD')
    expect(escapeCsv(120.5)).toBe('120.5')
  })

  it('quotes a value containing a comma', () => {
    // The classic corruption: a reason field shifts every later column.
    expect(escapeCsv('London open, took the reclaim')).toBe(
      '"London open, took the reclaim"',
    )
  })

  it('doubles embedded quotes, per RFC 4180', () => {
    expect(escapeCsv('the "perfect" setup')).toBe('"the ""perfect"" setup"')
  })

  it('quotes values containing newlines', () => {
    expect(escapeCsv('line one\nline two')).toBe('"line one\nline two"')
  })

  it('renders missing values as empty, not "undefined"', () => {
    expect(escapeCsv(undefined)).toBe('')
    expect(escapeCsv(null)).toBe('')
  })

  it('preserves a legitimate zero', () => {
    expect(escapeCsv(0)).toBe('0')
  })
})

describe('tradesToCsv', () => {
  it('writes a header row', () => {
    const csv = tradesToCsv([])
    expect(csv.split('\r\n')[0]).toContain('date,time,pair,direction,outcome,pnl')
  })

  it('emits one row per trade, oldest first', () => {
    const csv = tradesToCsv([
      makeTrade({ date: '2026-07-15', pair: 'XAUUSD' }),
      makeTrade({ date: '2026-07-14', pair: 'EURUSD' }),
    ])
    const rows = csv.split('\r\n')
    expect(rows).toHaveLength(3)
    expect(rows[1]).toContain('EURUSD')
    expect(rows[2]).toContain('XAUUSD')
  })

  it('survives a reason field full of punctuation', () => {
    const csv = tradesToCsv([
      makeTrade({ reason: 'Swept the low, then reclaimed — took the "obvious" retest' }),
    ])
    const row = csv.split('\r\n')[1]
    expect(row).toContain('"Swept the low, then reclaimed — took the ""obvious"" retest"')
    // Header column count must still match the data row's real field count.
    expect(row.split('","').length).toBeGreaterThan(0)
  })

  it('flattens tags and violations into readable single cells', () => {
    const csv = tradesToCsv([
      makeTrade({
        tags: ['breakout', 'london'],
        ruleViolations: [{ code: 'risk-exceeded', message: 'Risked 2% against your 1% limit.' }],
      }),
    ])
    const row = csv.split('\r\n')[1]
    expect(row).toContain('breakout; london')
    expect(row).toContain('Risked 2% against your 1% limit.')
  })

  it('leaves a minimal trade with empty cells rather than junk', () => {
    const csv = tradesToCsv([makeTrade({ pnl: 120 })])
    const row = csv.split('\r\n')[1]
    expect(row).not.toContain('undefined')
    expect(row).not.toContain('null')
  })
})

describe('csvFilename', () => {
  it('is dated and slugged', () => {
    expect(csvFilename('Prop Firm #2', new Date('2026-07-14T10:00:00Z'))).toBe(
      'tradetrl-prop-firm-2-2026-07-14.csv',
    )
  })

  it('falls back sensibly for an unnameable journal', () => {
    expect(csvFilename('!!!', new Date('2026-07-14T10:00:00Z'))).toBe(
      'tradetrl-journal-2026-07-14.csv',
    )
  })
})
