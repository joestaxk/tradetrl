import { createFileRoute } from '@tanstack/react-router'

/**
 * FX rate lookup for the risk calculator (§5).
 *
 * Server-side and cached for an hour, so a trader typing into the lot-size
 * field never triggers a request per keystroke. Frankfurter is free, needs no
 * key, and publishes ECB reference rates — accurate enough for sizing a
 * position, and we say so rather than implying tick-level precision.
 *
 * Failure is never fatal: the client keeps the last rate it saw and labels it
 * with a timestamp. A slightly stale rate beats a blank risk figure.
 */

const TTL_MS = 60 * 60 * 1000

interface CacheEntry {
  rate: number
  fetchedAt: number
}

// Module-scope cache. Warm within a single serverless instance; a cold start
// simply re-fetches, which is the correct trade-off for a free-tier deploy.
const cache = new Map<string, CacheEntry>()

const SUPPORTED = new Set(['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'])

export const Route = createFileRoute('/api/fx-rate')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const from = (url.searchParams.get('from') ?? '').toUpperCase()
        const to = (url.searchParams.get('to') ?? '').toUpperCase()

        if (!SUPPORTED.has(from) || !SUPPORTED.has(to)) {
          return json({ ok: false, error: 'unsupported currency' }, 400)
        }
        // Identity is free and must never cost a request.
        if (from === to) {
          return json({ ok: true, rate: 1, from, to, fetchedAt: Date.now(), cached: true })
        }

        const key = `${from}${to}`
        const hit = cache.get(key)
        const fresh = hit && Date.now() - hit.fetchedAt < TTL_MS
        if (fresh) {
          return json(
            { ok: true, rate: hit.rate, from, to, fetchedAt: hit.fetchedAt, cached: true },
            200,
            hit.fetchedAt,
          )
        }

        try {
          const res = await fetch(
            `https://api.frankfurter.dev/v1/latest?base=${from}&symbols=${to}`,
            { signal: AbortSignal.timeout(4000) },
          )
          if (!res.ok) throw new Error(`upstream ${res.status}`)

          const body = (await res.json()) as { rates?: Record<string, number> }
          const rate = body.rates?.[to]
          if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
            throw new Error('no rate in response')
          }

          const entry = { rate, fetchedAt: Date.now() }
          cache.set(key, entry)
          return json(
            { ok: true, rate, from, to, fetchedAt: entry.fetchedAt, cached: false },
            200,
            entry.fetchedAt,
          )
        } catch (e) {
          // Serve the stale entry rather than nothing — §5 says a rate that is
          // an hour old is far more useful than a blocked calculator.
          if (hit) {
            return json({
              ok: true,
              rate: hit.rate,
              from,
              to,
              fetchedAt: hit.fetchedAt,
              cached: true,
              stale: true,
            })
          }
          return json({ ok: false, error: (e as Error).message, from, to }, 503)
        }
      },
    },
  },
})

function json(body: unknown, status = 200, fetchedAt?: number) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (status === 200) {
    const age = fetchedAt ? Math.floor((Date.now() - fetchedAt) / 1000) : 0
    const remaining = Math.max(0, 3600 - age)
    // Let the CDN and the browser share the same hour-long window.
    headers['cache-control'] = `public, max-age=${remaining}, stale-while-revalidate=86400`
  }
  return new Response(JSON.stringify(body), { status, headers })
}
