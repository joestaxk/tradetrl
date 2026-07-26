import { Link, useRouterState } from '@tanstack/react-router'
import { BarChart3, CalendarDays, LogOut, NotebookPen, Plus, Settings } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Wordmark } from '#/components/app/mark'
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  DropdownTrigger,
} from '#/components/ui/overlays'
import { Badge } from '#/components/ui/primitives'
import { JournalSwitcher } from '#/components/app/journal-switcher'
import { useAuth } from '#/lib/auth'
import { useAppStore } from '#/store/app'
import { cn } from '#/components/ui/cn'

const NAV = [
  { to: '/app', label: 'Journal', icon: CalendarDays, exact: true },
  { to: '/app/review', label: 'Review', icon: NotebookPen, exact: false },
  { to: '/app/insights', label: 'Insights', icon: BarChart3, exact: false },
] as const

export function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, signOutNow } = useAuth()
  const openNewTrade = useAppStore((s) => s.openNewTrade)
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  const initial = (profile?.displayName ?? profile?.email ?? '?').trim().charAt(0).toUpperCase()

  return (
    <div className="grain flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-base/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link to="/app" className="flex shrink-0 items-center" aria-label="tradetrl home">
            <Wordmark />
          </Link>

          {/* Desktop nav. On mobile this moves to the bottom bar below. */}
          <nav className="ml-3 hidden items-center gap-0.5 sm:flex">
            {NAV.map(({ to, label, exact }) => (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact }}
                className={cn(
                  'flex h-9 items-center rounded-lg px-3 text-[13px] font-medium',
                  'text-ink-muted transition-colors duration-200 hover:bg-panel hover:text-ink',
                  'data-[status=active]:bg-panel data-[status=active]:text-ink',
                )}
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex min-w-0 items-center gap-2">
            {/* Which account you are journalling is never ambiguous. */}
            <JournalSwitcher className="max-w-[9rem] sm:max-w-[14rem]" />

            <Button
              size="sm"
              variant="primary"
              onClick={() => openNewTrade()}
              className="hidden sm:inline-flex"
            >
              <Plus aria-hidden />
              Log a trade
            </Button>

            <Dropdown>
              <DropdownTrigger asChild>
                <button
                  // Plain dimensions + flex off. Utility sizing kept losing to
                  // the header's flex row, which squeezed this into an oval.
                  style={{
                    width: 36,
                    height: 36,
                    minWidth: 36,
                    minHeight: 36,
                    flex: '0 0 auto',
                    borderRadius: '50%',
                  }}
                  className={cn(
                    'flex items-center justify-center self-center overflow-hidden',
                    'border border-line-strong bg-raised text-[13px] font-medium text-ink-dim',
                    'transition-colors duration-200 hover:border-ink-faint hover:text-ink',
                  )}
                  aria-label="Account menu"
                >
                  {profile?.photoURL ? (
                    <img
                      src={profile.photoURL}
                      alt=""
                      className="size-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    initial
                  )}
                </button>
              </DropdownTrigger>
              <DropdownContent>
                <DropdownLabel>
                  <span className="block truncate normal-case tracking-normal text-[13px] text-ink">
                    {profile?.displayName ?? 'Signed in'}
                  </span>
                  <span className="block truncate text-[11px] normal-case tracking-normal text-ink-faint">
                    {profile?.email}
                  </span>
                </DropdownLabel>
                <DropdownSeparator />
                <DropdownItem asChild>
                  <Link to="/app/settings">
                    <Settings aria-hidden />
                    Settings
                    {profile?.plan === 'pro' && (
                      <Badge tone="accent" className="ml-auto">
                        Pro
                      </Badge>
                    )}
                  </Link>
                </DropdownItem>
                <DropdownSeparator />
                <DropdownItem tone="danger" onSelect={() => void signOutNow()}>
                  <LogOut aria-hidden />
                  Sign out
                </DropdownItem>
              </DropdownContent>
            </Dropdown>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-5 sm:px-6 sm:pb-16 sm:pt-7">
        {children}
      </main>

      {/*
        Mobile: bottom nav + a floating primary action. Every target is 44px
        or larger, and the bar sits above the home indicator (§12).
      */}
      <div className="fixed inset-x-0 bottom-0 z-30 sm:hidden">
        <Button
          size="lg"
          variant="primary"
          onClick={() => openNewTrade()}
          className="absolute -top-[4.5rem] right-4 size-14 rounded-full p-0 shadow-[0_10px_30px_-8px_rgba(124,131,240,0.8)]"
          aria-label="Log a trade"
        >
          <Plus className="size-6" aria-hidden />
        </Button>
        <nav className="flex border-t border-line bg-base/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
          {NAV.map(({ to, label, icon: Icon, exact }) => {
            const active = exact ? pathname === to : pathname.startsWith(to)
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  'flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-1',
                  'text-[11px] font-medium transition-colors duration-200',
                  active ? 'text-accent-bright' : 'text-ink-muted',
                )}
              >
                <Icon className="size-[18px]" aria-hidden />
                {label}
              </Link>
            )
          })}
          <Link
            to="/app/settings"
            className={cn(
              'flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-1',
              'text-[11px] font-medium transition-colors duration-200',
              pathname.startsWith('/app/settings') ? 'text-accent-bright' : 'text-ink-muted',
            )}
          >
            <Settings className="size-[18px]" aria-hidden />
            Settings
          </Link>
        </nav>
      </div>
    </div>
  )
}
