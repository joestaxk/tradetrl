import { Check, Download, Share } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Badge, Card, CardBody, CardHeader, CardTitle } from '#/components/ui/primitives'
import { usePwaInstall } from '#/lib/use-pwa'

/**
 * Install to home screen.
 *
 * Worth its own card because a journal you have to find a browser tab for is a
 * journal you stop opening — and the install is the difference between "a
 * website" and "the app I tap after I close a trade".
 */
export function InstallCard() {
  const { state, install } = usePwaInstall()

  if (state === 'unsupported') return null

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Install tradetrl</CardTitle>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
            Add it to your home screen and it opens like any other app — full
            screen, no browser bar, one tap from logging a trade.
          </p>
        </div>
        <Download className="size-4 shrink-0 text-ink-faint" aria-hidden />
      </CardHeader>
      <CardBody>
        {state === 'installed' && (
          <Badge tone="win" size="md">
            <Check aria-hidden />
            Installed
          </Badge>
        )}

        {state === 'available' && (
          <Button variant="primary" size="sm" onClick={() => void install()}>
            <Download aria-hidden />
            Add to home screen
          </Button>
        )}

        {/*
          iOS exposes no install API at all, so a button here would be a lie.
          The steps are short enough to just say out loud.
        */}
        {state === 'ios' && (
          <ol className="flex flex-col gap-2 text-[13px] leading-relaxed text-ink-dim">
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-line-strong text-[11px] text-ink-faint tnum">
                1
              </span>
              <span className="flex flex-wrap items-center gap-1.5">
                Tap
                <Share className="size-3.5 text-accent-bright" aria-hidden />
                <span className="text-ink">Share</span> in Safari's toolbar
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-line-strong text-[11px] text-ink-faint tnum">
                2
              </span>
              <span>
                Scroll down and choose{' '}
                <span className="text-ink">Add to Home Screen</span>
              </span>
            </li>
          </ol>
        )}
      </CardBody>
    </Card>
  )
}
