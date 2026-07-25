import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Mark } from '#/components/app/mark'

/**
 * 404. Router warns (rightly) if this isn't configured — the default is a bare
 * `<p>Not Found</p>`, which on a dark app reads as a broken page rather than a
 * wrong address.
 */
export function NotFound() {
  return (
    <main className="mesh grain flex min-h-dvh flex-col items-center justify-center px-5 py-16 text-center">
      <Mark className="size-9" />
      <p className="mt-6 font-display text-3xl leading-tight text-ink">
        Nothing logged here
      </p>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">
        That address doesn't point at anything. Your journal is where you left it.
      </p>
      <div className="mt-7 flex flex-col gap-2 sm:flex-row">
        <Button variant="primary" asChild>
          <Link to="/app">
            <ArrowLeft aria-hidden />
            Back to your journal
          </Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link to="/">Home</Link>
        </Button>
      </div>
    </main>
  )
}
