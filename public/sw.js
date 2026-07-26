/**
 * Self-destructing service worker.
 *
 * The PWA is gone. This file cannot simply be deleted, because a browser that
 * already registered the previous worker keeps running it — deleting the file
 * server-side leaves those users on a stale worker indefinitely, which is
 * exactly the trap we are climbing out of.
 *
 * So the file stays, and its only job is to remove itself: drop every cache,
 * unregister, and reload each open page onto the plain, un-serviced app. Once
 * a client has run this it will never fetch a service worker again, because
 * nothing registers one any more.
 *
 * Do not delete this file until you are confident no installs remain.
 */

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Every cache this app ever created.
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))

      await self.registration.unregister()

      // Reload open pages so they leave the worker's control immediately
      // rather than at some unpredictable point later.
      const clients = await self.clients.matchAll({ type: 'window' })
      for (const client of clients) client.navigate(client.url)
    })(),
  )
})

// Nothing is intercepted. Every request goes straight to the network.
