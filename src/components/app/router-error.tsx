import { useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Mark } from '#/components/app/mark'
import { isStaleChunkError, reloadForNewBuild } from '#/lib/stale-build'

/**
 * The last line of defence when a route fails to render.
 *
 * Two distinct situations arrive here and they need different treatment:
 *
 *  - **A stale build.** The page was loaded before a deploy and is asking for
 *    code that no longer exists. Nothing to explain and nothing the user can
 *    do — reload straight onto the current version. This also catches
 *    "Cannot read properties of undefined (reading 'component')", which is
 *    what a half-updated route tree looks like from the inside.
 *
 *  - **A genuine error.** Say so plainly, offer a reload, and never leave a
 *    blank screen. A trader who just logged a trade needs to know their data
 *    is safe, because a white screen reads as data loss.
 */
export function RouterError({ error }: { error: unknown }) {
  const stale =
    isStaleChunkError(error) ||
    // A route tree from one build meeting a manifest from another.
    /reading 'component'/i.test(String((error as Error)?.message ?? ''))

  useEffect(() => {
    if (stale) reloadForNewBuild()
  }, [stale])

  useEffect(() => {
    console.error('[router] route failed to render:', error)
  }, [error])

  if (stale) {
    // A reload is already in flight; this shows for a fraction of a second.
    return (
      <main className="grain flex min-h-dvh items-center justify-center px-5">
        <p className="text-sm text-ink-muted">Updating to the latest version…</p>
      </main>
    )
  }

  return (
    <main className="mesh grain flex min-h-dvh flex-col items-center justify-center px-5 py-16 text-center">
      <Mark className="size-9" />
      <h1 className="mt-6 font-display text-2xl leading-tight text-ink">
        That screen didn't load
      </h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">
        Something went wrong rendering this page. Your trades are safe — they live
        on the server, not in this screen.
      </p>
      <Button variant="primary" className="mt-7" onClick={() => window.location.reload()}>
        <RefreshCw aria-hidden />
        Reload
      </Button>
    </main>
  )
}
