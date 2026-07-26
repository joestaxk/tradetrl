/**
 * Service worker for tradetrl.
 *
 * Deliberately conservative. A trading journal's correctness matters more than
 * its offline story, so this worker will never serve stale application data:
 *
 *  - hashed build assets are cached forever (their URL changes on every build)
 *  - navigations go to the network first, falling back to a cached shell only
 *    when genuinely offline, so a deploy is never masked by a stale HTML shell
 *  - Firestore, Firebase Auth and every /api/ call are never touched, because
 *    a cached trade list or a cached auth response is a correctness bug
 *
 * Firestore's own IndexedDB layer already handles offline reads and queues
 * writes; duplicating that here would only fight it.
 */

const VERSION = 'v1'
const ASSETS = `tradetrl-assets-${VERSION}`
const SHELL = `tradetrl-shell-${VERSION}`
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll([OFFLINE_URL, '/icons/icon-192.png']))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== ASSETS && k !== SHELL)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

/** Hosts whose responses must never be cached or replayed. */
function isNeverCacheable(url) {
  return (
    url.pathname.startsWith('/api/') ||
    /(^|\.)googleapis\.com$/.test(url.hostname) ||
    /(^|\.)firebaseio\.com$/.test(url.hostname) ||
    /(^|\.)firebaseapp\.com$/.test(url.hostname) ||
    /(^|\.)google\.com$/.test(url.hostname) ||
    /(^|\.)gstatic\.com$/.test(url.hostname)
  )
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (isNeverCacheable(url)) return

  // Navigations: network first. A cached shell would happily hide a deploy.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(OFFLINE_URL)
        return cached ?? Response.error()
      }),
    )
    return
  }

  // Build assets are content-hashed, so a hit is always correct.
  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(ASSETS).then((c) => c.put(request, copy))
            }
            return res
          }),
      ),
    )
    return
  }

  // Icons and the manifest: cache-first, they change rarely and matter little.
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/icons/') || url.pathname.endsWith('.webmanifest'))
  ) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(SHELL).then((c) => c.put(request, copy))
            }
            return res
          }),
      ),
    )
  }
})
