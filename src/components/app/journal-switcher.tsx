import { Check, ChevronsUpDown, Plus, Wallet } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  DropdownTrigger,
} from '#/components/ui/overlays'
import { Badge } from '#/components/ui/primitives'
import {
  ALL_JOURNALS_ID,
  isAllJournals,
  journalSubtitle,
  kindLabel,
  resolveJournal,
} from '#/lib/journals'
import { useAuth } from '#/lib/auth'
import { useJournals } from '#/lib/use-journals'
import { cn } from '#/components/ui/cn'

/**
 * Account switcher.
 *
 * Shows the balance alongside the name, because the whole reason accounts are
 * separate is that the same 1% rule means different money on each — seeing
 * "50k" while you log keeps that present.
 *
 * Hidden entirely when there is only one account: a switcher with nothing to
 * switch to is chrome.
 */
export function JournalSwitcher({ className }: { className?: string }) {
  const { profile } = useAuth()
  const { journals, active, switchTo } = useJournals()

  // Shown once there is more than one thing to choose between — which now
  // includes the all-accounts lens, so a second account is not required.
  if (journals.length === 0) return null

  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button
          className={cn(
            'flex h-9 min-w-0 items-center gap-2 rounded-lg border border-line bg-panel px-2.5',
            'text-left transition-colors duration-200 hover:border-line-strong hover:bg-raised',
            className,
          )}
          aria-label={`Active account: ${active.name}`}
        >
          <Wallet className="size-3.5 shrink-0 text-ink-faint" aria-hidden />
          <span className="min-w-0 truncate text-[13px] font-medium text-ink">
            {active.name}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-ink-faint" aria-hidden />
        </button>
      </DropdownTrigger>

      <DropdownContent align="start" className="min-w-64">
        <DropdownLabel>Accounts</DropdownLabel>

        {/*
          A lens rather than an account: every trade you have ever logged,
          including any whose account was later deleted.
        */}
        <DropdownItem className="h-auto py-2" onSelect={() => void switchTo(ALL_JOURNALS_ID)}>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] text-ink">All accounts</span>
            <span className="truncate text-[11px] text-ink-faint">
              Everything in one calendar
            </span>
          </span>
          {isAllJournals(active.id) && (
            <Check className="ml-auto size-4 shrink-0 text-accent" aria-hidden />
          )}
        </DropdownItem>
        <DropdownSeparator />
        {journals.map((j) => {
          const resolved = resolveJournal(j, profile?.prefs)
          const subtitle = journalSubtitle(resolved)
          return (
            <DropdownItem
              key={j.id}
              className="h-auto py-2"
              onSelect={() => void switchTo(j.id)}
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[13px] text-ink">{j.name}</span>
                {subtitle && (
                  <span className="truncate text-[11px] text-ink-faint tnum">{subtitle}</span>
                )}
              </span>
              {j.id === active.id && (
                <Check className="ml-auto size-4 shrink-0 text-accent" aria-hidden />
              )}
            </DropdownItem>
          )
        })}
        <DropdownSeparator />
        <DropdownItem asChild>
          <Link to="/app/settings" hash="accounts">
            <Plus aria-hidden />
            Manage accounts
          </Link>
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  )
}

/** Compact badge for the active account — used where a full switcher won't fit. */
export function JournalBadge() {
  const { active } = useJournals()
  const label = kindLabel(active.kind)
  if (!label) return null
  return <Badge tone="neutral">{label}</Badge>
}
