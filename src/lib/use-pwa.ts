/**
 * Removing the PWA.
 *
 * The install/offline layer was withdrawn after it caused three separate
 * production failures: chunks served from a stale cache after a deploy, a
 * route tree from one build meeting a manifest from another, and a login flow
 * routed through a worker mid-OAuth. Each was a variation on the same theme —
 * a service worker letting the app run a mixture of two builds.
 *
 * What it bought in return was small. Vercel already serves hashed assets with
 * `cache-control: immutable`, so the browser's own HTTP cache did the caching
 * correctly, and Firestore's IndexedDB layer already handles offline reads and
 * queued writes. The worker was reimplementing both, badly.
 *
 * This module now exists only to undo it, and to keep undoing it for as long
 * as installs remain in the wild.
 */

/**
 * Removes any previously registered worker and every cache it created.
 *
 * Deliberately runs on every load rather than once. A user who installed the
 * app months ago and opens it today must be cleaned up on that visit — there
 * is no other moment we are guaranteed to get.
 */
export function unregisterServiceWorkers(): void {
  if (typeof window === 'undefined') return
  if (!('serviceWorker' in navigator)) return

  void navigator.serviceWorker
    .getRegistrations()
    .then(async (registrations) => {
      if (registrations.length === 0) return

      console.warn('[pwa] removing %d stale service worker(s)', registrations.length)
      await Promise.all(registrations.map((r) => r.unregister()))

      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      }
    })
    .catch((e) => {
      // Never let cleanup break the page it is cleaning up.
      console.error('[pwa] cleanup failed:', e)
    })
}
