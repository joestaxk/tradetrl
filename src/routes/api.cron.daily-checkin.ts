import { createFileRoute } from '@tanstack/react-router'
import { getAdminDb } from '#/lib/server/admin'
import { buildCheckIn } from '#/lib/server/checkin-email'
import type { Trade } from '#/lib/types'

/**
 * Vercel Cron → this route → Resend (§9).
 *
 * Runs once on weekday evenings (see vercel.json). Three gates before a single
 * email leaves:
 *   1. the caller proves it is the cron (CRON_SECRET);
 *   2. the deployment has the email feature configured at all;
 *   3. the individual user opted in — this is the one feature explicitly
 *      gated behind consent, and the check is per-user, not per-deployment.
 */

const DAY_MS = 86_400_000

export const Route = createFileRoute('/api/cron/daily-checkin')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.CRON_SECRET
        const auth = request.headers.get('authorization')

        // Without a secret configured we refuse rather than run openly — an
        // unauthenticated endpoint that sends mail is a spam cannon.
        if (!secret) {
          return json({ ok: false, error: 'CRON_SECRET is not configured' }, 500)
        }
        if (auth !== `Bearer ${secret}`) {
          return json({ ok: false, error: 'unauthorized' }, 401)
        }

        const apiKey = process.env.RESEND_API_KEY
        const from = process.env.RESEND_FROM
        const appUrl = process.env.APP_URL ?? 'https://tradetrl.app'
        if (!apiKey || !from) {
          return json({ ok: false, error: 'Resend is not configured' }, 500)
        }

        const db = await getAdminDb()
        if (!db) {
          return json({ ok: false, error: 'Firebase Admin is not configured' }, 500)
        }

        const date = todayUtc()
        const optedIn = await db
          .collection('users')
          .where('prefs.emailCheckInOptIn', '==', true)
          .get()

        let sent = 0
        let skipped = 0
        const failures: string[] = []

        for (const doc of optedIn.docs) {
          const user = doc.data() as {
            email?: string
            displayName?: string
            prefs?: { currency?: string }
            activeJournalId?: string
          }
          if (!user.email) {
            skipped++
            continue
          }

          try {
            const snap = await db
              .collection('users')
              .doc(doc.id)
              .collection('trades')
              .where('date', '==', date)
              .get()

            const trades = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Trade)
            const content = buildCheckIn({
              date,
              trades,
              displayName: user.displayName,
              currency: user.prefs?.currency ?? 'USD',
              appUrl,
            })

            // A day with no trades gets no email. Silence is a feature.
            if (!content) {
              skipped++
              continue
            }

            const res = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from,
                to: user.email,
                subject: content.subject,
                html: content.html,
                text: content.text,
              }),
            })

            if (res.ok) sent++
            else failures.push(`${doc.id}: ${res.status}`)
          } catch (e) {
            // One user's failure must not abort the rest of the run.
            failures.push(`${doc.id}: ${(e as Error).message}`)
          }
        }

        return json({ ok: true, date, sent, skipped, failures })
      },
    },
  },
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** The cron fires in UTC, so "today" is the UTC day it fired on. */
function todayUtc(now: Date = new Date()): string {
  return new Date(now.getTime()).toISOString().slice(0, 10)
}

export { DAY_MS }
