/**
 * Service worker for tradetrl.
 *
 * ── Deliberately minimal, and here is why ─────────────────────────────────
 * An earlier version cached hashed build assets. That is the standard advice
 * and it caused two production breakages in a row, because it lets a page end
 * up running a *mixture* of builds: the HTML came fresh from the network while
 * the JS came from cache. A route match then resolves against a route tree
 * that doesn't contain it, which surfaces as "Cannot read properties of
 * undefined (reading 'component')" — a white screen with no obvious cause.
 *
 * Caching hashed assets also bought almost nothing. Vercel already serves
 * /assets with `cache-control: immutable`, so the browser's own HTTP cache
 * handles them correctly and, crucially, evicts them the way a browser cache
 * should. We were reimplementing that badly.
 *
 * So this worker now does exactly two things:
 *
 *   1. makes the app installable (the manifest and icons)
 *   2. shows a real page instead of the browser's dinosaur when offline
 *
 * It never caches HTML, JS, CSS, Firestore, Auth or /api. Trade data is
 * already handled offline by Firestore's own IndexedDB layer, which queues
 * writes and replays them — duplicating that here would only fight it.
 */

const VERSION = 'v3'
const SHELL = `tradetrl-shell-${VERSION}`
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll([OFFLINE_URL, '/icons/icon-192.png']))
      // Take over immediately. A worker waiting for every tab to close is a
      // worker that never updates on an installed PWA.
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      // Drops the old asset caches too, which is what unsticks anyone
      // currently running a mixed build.
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(async () => {
        const clients = await self.clients.matchAll({ type: 'window' })
        for (const client of clients) {
          client.postMessage({ type: 'sw-activated', version: VERSION })
        }
      }),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  /*
    Navigations only. Everything else — scripts, styles, API calls, Firestore,
    Auth — goes straight to the network untouched, so the page can never run a
    half-updated build.
  */
  if (request.mode !== 'navigate') return

  event.respondWith(
    fetch(request).catch(async () => {
      const cached = await caches.match(OFFLINE_URL)
      return cached ?? Response.error()
    }),
  )
})
