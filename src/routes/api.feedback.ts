import { createFileRoute } from '@tanstack/react-router'
import { escapeHtml } from '#/lib/server/checkin-email'
import { MAX_NOTE } from '#/lib/feedback'
import {
  buildFeedbackMessage,
  sendTelegram,
  telegramConfigured,
} from '#/lib/server/telegram'

/**
 * Feedback → the admin's inbox.
 *
 * Deliberately fire-and-forget from the client's point of view: if Resend is
 * down or unconfigured, the user still sees their thank-you, because the
 * feedback is written to Firestore first and the email is only a convenience
 * for whoever reads it. Losing an email is annoying; making someone feel their
 * opinion vanished is worse.
 */

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'joestaxk@gmail.com'

const MOOD_LABEL: Record<string, string> = {
  love: 'Love it',
  good: "It's good",
  meh: "It's okay",
  bad: 'Not for me',
}

export const Route = createFileRoute('/api/feedback')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: {
          mood?: string
          note?: string
          email?: string
          name?: string
          uid?: string
          telegram?: string
          tradeCount?: number
          kind?: string
        }
        try {
          body = await request.json()
        } catch {
          return json({ ok: false, error: 'bad request' }, 400)
        }

        const mood = typeof body.mood === 'string' ? body.mood : ''
        const note = (typeof body.note === 'string' ? body.note : '').slice(0, MAX_NOTE)
        if (!mood && !note) return json({ ok: false, error: 'nothing to send' }, 400)

        /*
          Telegram first, and email only as a fallback.

          Telegram needs no domain, no DNS records and no verification wait,
          which is precisely what stopped email working here — and it arrives
          as a push notification rather than sitting unread in a spam folder.
        */
        if (telegramConfigured()) {
          const sent = await sendTelegram(
            buildFeedbackMessage({
              mood,
              note,
              name: body.name ?? null,
              email: body.email ?? null,
              telegram: body.telegram ?? null,
              context: body.kind === 'idea' ? 'idea' : 'feedback',
            }),
          )
          if (sent.ok) return json({ ok: true, delivered: 'telegram' })
          // Fall through to email rather than dropping it.
          console.error('[feedback] telegram failed:', sent.error)
        }

        const apiKey = process.env.RESEND_API_KEY
        const from = process.env.RESEND_FROM
        if (!apiKey || !from) {
          // Not an error the user should ever see — their feedback is already
          // saved. Report it so the deployment owner can spot the gap.
          console.warn('[feedback] no delivery channel configured')
          return json({ ok: true, delivered: 'none' })
        }

        const kind = body.kind === 'idea' ? 'Idea' : 'Feedback'
        const label = MOOD_LABEL[mood] ?? mood ?? '—'
        const who = body.name || body.email || body.uid || 'anonymous'
        const subject = `[tradetrl] ${kind}${mood ? ` · ${label}` : ''} — ${who}`

        try {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from,
              to: ADMIN_EMAIL,
              // So hitting reply goes to the trader, not into the void.
              reply_to: body.email || undefined,
              subject,
              html: render({ kind, label, mood, note, body }),
              text: [
                `${kind}${mood ? ` — ${label}` : ''}`,
                '',
                note || '(no note)',
                '',
                `From: ${body.name ?? '—'} <${body.email ?? '—'}>`,
                `uid: ${body.uid ?? '—'}`,
                `trades logged: ${body.tradeCount ?? '—'}`,
              ].join('\n'),
            }),
          })
          if (!res.ok) {
            console.error('[feedback] resend responded', res.status, await res.text())
            return json({ ok: true, delivered: 'none' })
          }
        } catch (e) {
          console.error('[feedback] send failed:', e)
          return json({ ok: true, delivered: 'none' })
        }

        return json({ ok: true, delivered: 'email' })
      },
    },
  },
})

function render({
  kind,
  label,
  mood,
  note,
  body,
}: {
  kind: string
  label: string
  mood: string
  note: string
  body: { name?: string; email?: string; uid?: string; tradeCount?: number }
}): string {
  const tone =
    mood === 'bad' ? '#ea8168' : mood === 'meh' ? '#d9a441' : mood ? '#4dbba3' : '#a2a8b4'

  return `<!doctype html>
<html><body style="margin:0;background:#0b0d10;padding:28px 16px;font:400 15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#eceef2;">
  <div style="max-width:520px;margin:0 auto;background:#14161a;border:1px solid #23262d;border-radius:14px;padding:24px;">
    <p style="margin:0;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#6e7480;">${escapeHtml(kind)}</p>
    ${mood ? `<p style="margin:10px 0 0;font-size:24px;font-weight:600;color:${tone};">${escapeHtml(label)}</p>` : ''}
    ${
      note
        ? `<p style="margin:16px 0 0;white-space:pre-wrap;color:#a2a8b4;">${escapeHtml(note)}</p>`
        : `<p style="margin:16px 0 0;color:#6e7480;font-style:italic;">No note — just the rating.</p>`
    }
    <table style="margin-top:22px;border-top:1px solid #23262d;padding-top:16px;width:100%;font-size:13px;color:#6e7480;">
      <tr><td style="padding:2px 0;">Name</td><td style="text-align:right;color:#a2a8b4;">${escapeHtml(body.name ?? '—')}</td></tr>
      <tr><td style="padding:2px 0;">Email</td><td style="text-align:right;color:#a2a8b4;">${escapeHtml(body.email ?? '—')}</td></tr>
      <tr><td style="padding:2px 0;">Trades logged</td><td style="text-align:right;color:#a2a8b4;">${escapeHtml(String(body.tradeCount ?? '—'))}</td></tr>
      <tr><td style="padding:2px 0;">uid</td><td style="text-align:right;color:#464b55;font-family:monospace;font-size:11px;">${escapeHtml(body.uid ?? '—')}</td></tr>
    </table>
  </div>
</body></html>`
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
