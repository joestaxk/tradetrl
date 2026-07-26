/**
 * Recovering from a deploy that happened while the app was open.
 *
 * ── The failure ───────────────────────────────────────────────────────────
 * Routes are code-split, so tapping "Insights" fetches a chunk on demand. The
 * chunk filename contains a content hash, so every deploy produces new names
 * and removes the old ones from the server.
 *
 * A page that was loaded before the deploy still holds the *old* filenames. It
 * asks for `app-C8KK4_7L.js`, the server no longer has it, and the browser
 * throws "Failed to fetch dynamically imported module". The screen just breaks.
 *
 * An installed PWA makes this far worse than a normal tab: it is never really
 * closed, so a single instance can outlive several deploys.
 *
 * ── The fix ───────────────────────────────────────────────────────────────
 * There is nothing to repair in place — the code the page needs is genuinely
 * gone. The only correct move is to reload and pick up the current build. So
 * we detect the failure precisely and reload once, guarding against a loop in
 * case the reload lands on something that fails for a different reason.
 */

const RELOAD_GUARD = 'tradetrl:reloaded-for-stale-build'

/** Does this error mean "the build moved under us"? */
export function isStaleChunkError(reason: unknown): boolean {
  const message =
    typeof reason === 'string'
      ? reason
      : reason instanceof Error
        ? `${reason.name}: ${reason.message}`
        : ''

  return (
    /Failed to fetch dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    // Safari's wording when a module 404s.
    /Unable to load script/i.test(message)
  )
}

/**
 * Reload once to pick up the new build.
 *
 * The guard lives in `sessionStorage` so it survives the reload but not the
 * tab — a genuine, persistent failure therefore surfaces as an error the
 * second time rather than an endless refresh loop, which is far harder to
 * diagnose and much worse to sit through.
 */
export function reloadForNewBuild(): boolean {
  if (typeof window === 'undefined') return false

  try {
    if (sessionStorage.getItem(RELOAD_GUARD)) {
      console.error('[build] still failing after a reload — not looping')
      return false
    }
    sessionStorage.setItem(RELOAD_GUARD, String(Date.now()))
  } catch {
    // Private mode can throw on sessionStorage. Reloading once without a guard
    // is still better than leaving someone on a broken screen.
  }

  console.warn('[build] a new version is deployed — reloading')
  window.location.reload()
  return true
}

/** Called once the app has rendered successfully, so the guard doesn't stick. */
export function clearStaleBuildGuard(): void {
  try {
    sessionStorage.removeItem(RELOAD_GUARD)
  } catch {
    // Nothing to do; the guard expires with the tab anyway.
  }
}

/**
 * Watches for the three ways a stale chunk surfaces.
 *
 * Vite fires `vite:preloadError` for preloads it manages, but a plain
 * `import()` that fails arrives only as an unhandled rejection — and Safari
 * reports some as window errors. All three are covered because missing any one
 * leaves a real user staring at a dead screen.
 */
export function watchForStaleBuild(): void {
  if (typeof window === 'undefined') return

  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault()
    reloadForNewBuild()
  })

  window.addEventListener('unhandledrejection', (event) => {
    if (isStaleChunkError(event.reason)) {
      event.preventDefault()
      reloadForNewBuild()
    }
  })

  window.addEventListener('error', (event) => {
    if (isStaleChunkError(event.message) || isStaleChunkError(event.error)) {
      reloadForNewBuild()
    }
  })

  /*
    A new service worker taking control means new assets are live. Reloading
    here is proactive rather than reactive: the user gets the current build
    before they tap something that no longer exists.
  */
  if ('serviceWorker' in navigator) {
    let reloading = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return
      reloading = true
      reloadForNewBuild()
    })
  }
}
