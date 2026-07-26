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
        const url = new URL(request.url)
        /*
          `?dry=1` runs the whole job and reports exactly who would be emailed
          and what the subject line would be, without calling Resend. It is the
          only honest way to confirm a deployment is wired up correctly —
          otherwise the first real test is a live send to real users.
        */
        const dryRun = url.searchParams.get('dry') === '1'
        // Lets you check a specific day rather than waiting for one to happen.
        const dateOverride = url.searchParams.get('date') ?? undefined

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
        if (!dryRun && (!apiKey || !from)) {
          return json(
            {
              ok: false,
              error:
                'Resend is not configured. Set RESEND_API_KEY and RESEND_FROM (the from address must be on a domain you have verified in Resend).',
            },
            500,
          )
        }

        /*
          Resend's `resend.dev` sender is testing-only: it can reach the
          account owner's own address and nobody else, returning 403 for
          everyone. Running the real job with it would mean one delivered
          email and a wall of failures, so we stop and say why instead.
          The dry run still works, which is how you check the rest of the
          wiring before you own a domain.
        */
        const testingSender = /@resend\.dev>?\s*$/.test((from ?? '').trim())
        if (testingSender && !dryRun) {
          return json(
            {
              ok: false,
              error:
                'RESEND_FROM uses resend.dev, which can only deliver to your own Resend account address. Verify a domain you own and set RESEND_FROM to an address on it before enabling check-in emails.',
            },
            500,
          )
        }

        const db = await getAdminDb()
        if (!db) {
          return json({ ok: false, error: 'Firebase Admin is not configured' }, 500)
        }

        const date = dateOverride ?? todayUtc()
        const optedIn = await db
          .collection('users')
          .where('prefs.emailCheckInOptIn', '==', true)
          .get()

        let sent = 0
        let skipped = 0
        const failures: string[] = []
        const wouldSend: { to: string; subject: string }[] = []

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

            if (dryRun) {
              wouldSend.push({ to: user.email, subject: content.subject })
              sent++
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

        return json({
          ok: true,
          dryRun,
          date,
          sent,
          skipped,
          failures,
          ...(dryRun
            ? {
                wouldSend,
                resendConfigured: Boolean(apiKey && from),
                from: from ?? null,
                // Surfaced in the dry run so the limitation is visible before
                // anyone flips the feature on.
                testingSenderOnly: testingSender,
              }
            : {}),
        })
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
