/**
 * CSV export (§10) — for prop-firm evaluations and personal records.
 *
 * Kept pure and separately tested because CSV escaping is the classic place a
 * journal quietly corrupts itself: a reason field containing a comma, a quote
 * or a newline must survive a round trip into Excel intact.
 */

import { sortChronological } from './aggregate'
import type { Trade } from './types'

const COLUMNS = [
  'date',
  'time',
  'pair',
  'direction',
  'outcome',
  'pnl',
  'lotSize',
  'entryPrice',
  'exitPrice',
  'stopPrice',
  'riskAmount',
  'riskPct',
  'rMultiple',
  'tags',
  'reason',
  'ruleViolations',
  'beforeChartUrl',
  'afterChartUrl',
] as const

/** RFC 4180 escaping: quote when needed, and double any embedded quote. */
export function escapeCsv(value: unknown): string {
  if (value === undefined || value === null) return ''
  const s = String(value)
  if (s === '') return ''
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function tradesToCsv(trades: Trade[]): string {
  const rows = sortChronological(trades).map((t) =>
    COLUMNS.map((col) => {
      switch (col) {
        case 'tags':
          return escapeCsv((t.tags ?? []).join('; '))
        case 'ruleViolations':
          return escapeCsv((t.ruleViolations ?? []).map((v) => v.message).join(' '))
        default:
          return escapeCsv(t[col as keyof Trade])
      }
    }).join(','),
  )
  return [COLUMNS.join(','), ...rows].join('\r\n')
}

export function csvFilename(journalName = 'journal', now: Date = new Date()): string {
  const stamp = now.toISOString().slice(0, 10)
  const slug = journalName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `tradetrl-${slug || 'journal'}-${stamp}.csv`
}

/** Browser-only: triggers a download without a server round trip. */
export function downloadCsv(trades: Trade[], journalName?: string): void {
  if (typeof document === 'undefined') return
  // The BOM makes Excel read UTF-8 correctly — without it, a reason field with
  // an em dash or a currency symbol arrives mangled.
  const blob = new Blob(['﻿', tradesToCsv(trades)], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = csvFilename(journalName)
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
