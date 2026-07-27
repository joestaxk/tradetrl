import { useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from '#/components/app/shell'
import { JournalPage } from '#/components/app/journal-page'
import { ReviewPage } from '#/components/review/review-page'
import { SettingsPage } from '#/components/settings/settings-page'
import { InsightsPage } from '#/components/insights/insights-page'
import { Onboarding } from '#/components/app/onboarding'
import { TradeEntrySheet } from '#/components/trades/entry-sheet'
import { NotFound } from '#/components/app/not-found'
import { SegmentedGroup, SegmentedItem, SegmentedShell } from '#/components/ui/toggles'
import { AuthContext, type AuthValue } from '#/lib/auth'
import { TradesOverrideContext } from '#/lib/use-trades'
import { JournalsOverrideContext, type JournalsValue } from '#/lib/use-journals'
import { resolveJournal } from '#/lib/journals'
import { summarizeDays } from '#/lib/aggregate'
import { fixtureJournals, fixtureProfile, fixtureTrades } from '#/test/fixtures'
import { useAppStore } from '#/store/app'

/**
 * Design preview — development only.
 *
 * Mounts the *real* screens against fixture data so the highest-density views
 * (calendar grid, day detail, review) can be checked at 320px without needing
 * a live Google sign-in. In production this route renders the 404 page, and
 * every write path is a no-op, so it cannot touch anyone's journal.
 */
const SCREENS = ['journal', 'review', 'insights', 'settings', 'onboarding'] as const
type Screen = (typeof SCREENS)[number]

export const Route = createFileRoute('/preview')({
  // Deep-linkable so each screen can be screenshotted at a given width.
  validateSearch: (
    search: Record<string, unknown>,
  ): { screen: Screen; sheet?: string } => ({
    screen: SCREENS.includes(search.screen as Screen) ? (search.screen as Screen) : 'journal',
    // ?sheet=new opens the entry form on mount, so the densest form in the app
    // can be screenshotted at any width without a click.
    sheet: typeof search.sheet === 'string' ? search.sheet : undefined,
  }),
  component: PreviewRoute,
})

function PreviewRoute() {
  if (!import.meta.env.DEV) return <NotFound />
  return <Preview />
}

function Preview() {
  const { screen: initial, sheet } = Route.useSearch()
  const [screen, setScreen] = useState<Screen>(initial)
  const openNewTrade = useAppStore((s) => s.openNewTrade)

  useEffect(() => {
    if (sheet) openNewTrade()
  }, [sheet, openNewTrade])
  const trades = useMemo(() => fixtureTrades(), [])
  const profile = useMemo(() => fixtureProfile(), [])
  const journals = useMemo(() => fixtureJournals(), [])
  const [activeId, setActiveId] = useState('default')

  const journalsValue = useMemo<JournalsValue>(
    () => ({
      journals,
      active: resolveJournal(
        journals.find((j) => j.id === activeId) ?? journals[0],
        profile.prefs,
      ),
      loading: false,
      switchTo: async (id: string) => setActiveId(id),
      patch: async () => {},
      reload: async () => {},
    }),
    [journals, activeId, profile.prefs],
  )

  const auth = useMemo<AuthValue>(
    () => ({
      status: 'signed-in',
      // Enough of a User for the screens; they only read uid.
      user: { uid: 'preview' } as AuthValue['user'],
      profile,
      onboarded: true,
      signInWithGoogle: async () => {},
      signInWithEmail: async () => {},
      createAccount: async () => {},
      resetPassword: async () => {},
      signOutNow: async () => {},
      updatePrefs: async () => {},
      refreshProfile: async () => {},
    }),
    [profile],
  )

  const tradesValue = useMemo(
    () => ({ trades, byDay: summarizeDays(trades), loading: false, error: null }),
    [trades],
  )

  return (
    <AuthContext.Provider value={auth}>
      <TradesOverrideContext.Provider value={tradesValue}>
        <JournalsOverrideContext.Provider value={journalsValue}>
        <div data-preview-toolbar className="fixed inset-x-2 top-2 z-50 flex justify-center overflow-x-auto">
          <SegmentedGroup
            type="single"
            value={screen}
            onValueChange={(v) => v && setScreen(v as Screen)}
            aria-label="Preview screen"
            asChild
          >
            <SegmentedShell className="shrink-0 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.9)]">
              <SegmentedItem value="journal">Journal</SegmentedItem>
              <SegmentedItem value="review">Review</SegmentedItem>
              <SegmentedItem value="insights">Insights</SegmentedItem>
              <SegmentedItem value="settings">Settings</SegmentedItem>
              <SegmentedItem value="onboarding">Onboard</SegmentedItem>
            </SegmentedShell>
          </SegmentedGroup>
        </div>

        {screen === 'onboarding' ? (
          <Onboarding />
        ) : (
          <AppShell>
            {screen === 'journal' && <JournalPage />}
            {screen === 'review' && <ReviewPage />}
            {screen === 'insights' && <InsightsPage />}
            {screen === 'settings' && <SettingsPage />}
            <TradeEntrySheet />
          </AppShell>
        )}
        </JournalsOverrideContext.Provider>
      </TradesOverrideContext.Provider>
    </AuthContext.Provider>
  )
}
