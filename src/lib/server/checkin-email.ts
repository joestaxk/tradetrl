/**
 * The evening check-in email (§9).
 *
 * Purpose is a short, warm note on how the day *felt* — not a data dump. The
 * copy rules follow from §0: it never congratulates a win, never commiserates
 * a loss, and never tells the trader what to do next. It reports, and it asks
 * one open question.
 *
 * Kept pure (no network, no Firestore) so the tone and the numbers are
 * testable without sending anything.
 */

import { computeStats } from '../aggregate'
import { formatMoney } from '../calc'
import { longDayLabel } from '../dates'
import type { Trade } from '../types'

export interface CheckInContent {
  subject: string
  heading: string
  lines: string[]
  question: string
  html: string
  text: string
}

export interface CheckInInput {
  date: string
  trades: Trade[]
  displayName?: string | null
  currency?: string
  appUrl?: string
}

/** null when there is nothing worth sending — a quiet day gets no email. */
export function buildCheckIn({
  date,
  trades,
  displayName,
  currency = 'USD',
  appUrl = 'https://tradetrl.app',
}: CheckInInput): CheckInContent | null {
  if (trades.length === 0) return null

  const stats = computeStats(trades)
  const first = (displayName ?? '').trim().split(/\s+/)[0]
  const greeting = first ? `Evening, ${first}.` : 'Evening.'

  const lines: string[] = []

  lines.push(
    stats.trades === 1
      ? `One trade today — ${trades[0].pair.toUpperCase()}, ${formatMoney(stats.pnl, { currency })}.`
      : `${stats.trades} trades today, ${stats.wins} of them green, for ${formatMoney(stats.pnl, { currency })}.`,
  )

  const withReason = trades.filter((t) => t.reason?.trim())
  if (withReason.length === 0) {
    lines.push(
      "You didn't write down why on any of them. No pressure — but a sentence now is worth a lot in a month.",
    )
  } else if (withReason.length < trades.length) {
    lines.push(
      `You noted your reasoning on ${withReason.length} of ${trades.length}.`,
    )
  }

  const violations = trades.reduce((n, t) => n + (t.ruleViolations?.length ?? 0), 0)
  if (violations > 0) {
    // Stated once, flatly, then dropped. The place to sit with it is Sunday.
    const count = trades.filter((t) => (t.ruleViolations?.length ?? 0) > 0).length
    lines.push(
      `${count} ${count === 1 ? 'trade sits' : 'trades sit'} outside the rules you set. It's in your weekly review.`,
    )
  }

  const question =
    stats.pnl >= 0
      ? 'Did today go the way you planned it, or did it just go well?'
      : 'Was today a bad outcome, or a bad decision? They are not the same thing.'

  const subject = `${longDayLabel(date)} — ${formatMoney(stats.pnl, { currency })}`

  return {
    subject,
    heading: greeting,
    lines,
    question,
    html: renderHtml({ greeting, lines, question, appUrl, date, stats, currency }),
    text: [greeting, '', ...lines, '', question, '', `Open your journal: ${appUrl}/app`].join(
      '\n',
    ),
  }
}

/**
 * Email HTML. Tables and inline styles, because every other layout technique
 * is a coin flip across mail clients. The restraint is the design: one rule,
 * one figure, generous space, no charts, no logos shouting.
 */
function renderHtml({
  greeting,
  lines,
  question,
  appUrl,
  date,
  stats,
  currency,
}: {
  greeting: string
  lines: string[]
  question: string
  appUrl: string
  date: string
  stats: ReturnType<typeof computeStats>
  currency: string
}): string {
  const accent = '#7c83f0'
  const ink = '#eceef2'
  const dim = '#a2a8b4'
  const faint = '#6e7480'
  const panel = '#14161a'
  const base = '#0b0d10'
  const line = '#23262d'
  const figure = stats.pnl > 0 ? '#4dbba3' : stats.pnl < 0 ? '#ea8168' : dim

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<title>${escapeHtml(longDayLabel(date))}</title>
</head>
<body style="margin:0;padding:0;background:${base};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(
    lines[0] ?? '',
  )}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${base};padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:${panel};border:1px solid ${line};border-radius:14px;">
      <tr><td style="padding:28px 28px 0 28px;">
        <p style="margin:0;font:500 12px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:${faint};">
          ${escapeHtml(longDayLabel(date))}
        </p>
        <p style="margin:18px 0 0 0;font:400 30px/1.1 Georgia,'Times New Roman',serif;color:${ink};">
          ${escapeHtml(greeting)}
        </p>
        <p style="margin:14px 0 0 0;font:600 34px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${figure};">
          ${escapeHtml(formatMoney(stats.pnl, { currency }))}
        </p>
      </td></tr>
      <tr><td style="padding:20px 28px 0 28px;">
        ${lines
          .map(
            (l) =>
              `<p style="margin:0 0 12px 0;font:400 15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${dim};">${escapeHtml(
                l,
              )}</p>`,
          )
          .join('')}
      </td></tr>
      <tr><td style="padding:8px 28px 0 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="border-top:1px solid ${line};padding-top:20px;">
            <p style="margin:0;font:400 15px/1.6 Georgia,'Times New Roman',serif;font-style:italic;color:${ink};">
              ${escapeHtml(question)}
            </p>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:24px 28px 28px 28px;">
        <a href="${escapeHtml(appUrl)}/app" style="display:inline-block;background:${accent};color:${base};text-decoration:none;font:500 14px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;padding:13px 18px;border-radius:10px;">
          Open your journal
        </a>
      </td></tr>
    </table>
    <p style="margin:20px 0 0 0;font:400 12px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${faint};max-width:480px;">
      You turned this on in tradetrl. Turn it off any time in
      <a href="${escapeHtml(appUrl)}/app/settings" style="color:${faint};">Settings</a>.
    </p>
  </td></tr>
</table>
</body>
</html>`
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
