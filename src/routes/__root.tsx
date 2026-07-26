import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { TooltipProvider } from '#/components/ui/overlays'
import { Toaster } from '#/components/ui/toast'
import { AuthProvider } from '#/lib/auth'
import { NotFound } from '#/components/app/not-found'
import { unregisterServiceWorkers } from '#/lib/use-pwa'
import { watchForStaleBuild } from '#/lib/stale-build'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        // viewport-fit=cover so safe-area insets work on notched devices; no
        // maximum-scale, because blocking pinch-zoom is an accessibility fail.
        content: 'width=device-width, initial-scale=1, viewport-fit=cover',
      },
      { title: 'tradetrl — a trading journal that stays out of your way' },
      {
        name: 'description',
        content:
          'Log a trade in seconds. Nothing is mandatory but the outcome. See the truth about your discipline on Sunday, not a lecture on Tuesday.',
      },
      { name: 'theme-color', content: '#0b0d10' },
      { name: 'color-scheme', content: 'dark' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      { rel: 'apple-touch-icon', href: '/icons/icon-180.png', sizes: '180x180' },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..700&family=Geist:wght@300..700&family=Geist+Mono:wght@400;500&display=swap',
      },
    ],
  }),
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
})

// The PWA layer was removed after it repeatedly served a mixture of two
// builds. This actively tears down any worker still installed on a device.
unregisterServiceWorkers()
// Kept: a deploy that lands while the app is open should recover itself
// rather than breaking the screen. That is true with or without a worker.
watchForStaleBuild()

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <AuthProvider>
          <TooltipProvider delayDuration={250} skipDelayDuration={400}>
            {children}
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  )
}
