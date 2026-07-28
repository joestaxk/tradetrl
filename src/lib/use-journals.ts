import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './auth'
import { subscribeJournals, setActiveJournal as persistActive, updateJournal } from './repo'
import {
  activeJournal,
  allJournalsView,
  isAllJournals,
  resolveJournal,
  visibleJournals,
} from './journals'
import type { Journal, ResolvedJournal } from './types'

export interface JournalsValue {
  journals: Journal[]
  /** The account currently being journalled, with defaults resolved. */
  active: ResolvedJournal
  loading: boolean
  switchTo: (journalId: string) => Promise<void>
  /**
   * Save an account and show it immediately.
   *
   * The local copy updates first and the write follows, so the UI never waits
   * on a round trip to reflect something the user just did. If the write
   * fails, the subscription's next snapshot overwrites the optimistic value
   * with the truth — so a failure self-corrects rather than persisting a lie.
   */
  patch: (journalId: string, changes: Partial<Journal>) => Promise<void>
  reload: () => Promise<void>
}

/** Dev-preview override, same seam as `TradesOverrideContext`. */
export const JournalsOverrideContext = createContext<JournalsValue | null>(null)

/**
 * The active trading account.
 *
 * Every risk figure in the app resolves through here, so switching accounts
 * re-bases percentages against the right balance rather than quietly reusing
 * the last one.
 */
export function useJournals(): JournalsValue {
  const override = useContext(JournalsOverrideContext)
  const { user, profile, refreshProfile } = useAuth()
  const [journals, setJournals] = useState<Journal[]>([])
  const [loading, setLoading] = useState(true)
  // Set the instant an account switch is requested, cleared once the profile
  // catches up — so the header and every figure change on the same frame.
  const [localActiveId, setLocalActiveId] = useState<string | null>(null)

  useEffect(() => {
    if (profile?.activeJournalId && profile.activeJournalId === localActiveId) {
      setLocalActiveId(null)
    }
  }, [profile?.activeJournalId, localActiveId])

  const live = override === null

  // Kept for callers that want an explicit refresh; the subscription makes it
  // a no-op in practice.
  const reload = useCallback(async () => {}, [])

  useEffect(() => {
    if (!live) return
    if (!user) {
      setJournals([])
      setLoading(false)
      return
    }
    let cancelled = false
    const unsub = subscribeJournals(
      user.uid,
      (rows) => {
        if (cancelled) return
        setJournals(rows)
        setLoading(false)
      },
      () => {
        // A journals read failure must not take the whole app down — fall back
        // to the implicit single account so the trader can still log.
        if (!cancelled) setLoading(false)
      },
    )
    return () => {
      cancelled = true
      unsub()
    }
  }, [live, user])

  const patch = useCallback(
    async (journalId: string, changes: Partial<Journal>) => {
      if (!user) return
      setJournals((cur) =>
        cur.map((j) => (j.id === journalId ? { ...j, ...changes } : j)),
      )
      await updateJournal(user.uid, journalId, changes)
    },
    [user],
  )

  const active = useMemo(() => {
    const wanted = localActiveId ?? profile?.activeJournalId
    if (isAllJournals(wanted)) return allJournalsView(profile?.prefs)

    const chosen =
      (localActiveId && journals.find((j) => j.id === localActiveId)) ||
      activeJournal(journals, profile)
    return resolveJournal(chosen, profile?.prefs)
  }, [journals, profile, localActiveId])

  const switchTo = useCallback(
    async (journalId: string) => {
      if (!user) return
      // Switching account is the single most latency-sensitive action here —
      // the whole page re-derives from it, so it must feel instant.
      setLocalActiveId(journalId)
      await persistActive(user.uid, journalId)
      await refreshProfile()
    },
    [user, refreshProfile],
  )

  const value = useMemo<JournalsValue>(
    () => ({ journals: visibleJournals(journals), active, loading, switchTo, patch, reload }),
    [journals, active, loading, switchTo, patch, reload],
  )

  return override ?? value
}
