import { Skeleton } from '#/components/ui/primitives'
import { NotConfigured, SignIn } from '#/components/app/sign-in'
import { Onboarding } from '#/components/app/onboarding'
import { AppShell } from '#/components/app/shell'
import { TradeEntrySheet } from '#/components/trades/entry-sheet'
import { useAuth } from '#/lib/auth'

/**
 * The one place that decides what an authenticated route renders.
 *
 * The 30-day expiry itself is enforced in AuthProvider — this component only
 * reflects the verdict, so the rule lives in exactly one place.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { status, onboarded } = useAuth()

  if (status === 'unconfigured') return <NotConfigured />
  if (status === 'loading') return <BootSkeleton />
  if (status === 'signed-out') return <SignIn />
  if (status === 'expired') return <SignIn expired />
  if (!onboarded) return <Onboarding />

  return (
    <AppShell>
      {children}
      {/* Global: the entry sheet is reachable from every screen. */}
      <TradeEntrySheet />
    </AppShell>
  )
}

/** Shaped like the calendar it precedes, so the page doesn't jump on load. */
function BootSkeleton() {
  return (
    <div className="grain min-h-dvh">
      <div className="h-14 border-b border-line" />
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[74px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="mt-4 h-[26rem] rounded-2xl sm:h-[32rem]" />
      </div>
    </div>
  )
}
