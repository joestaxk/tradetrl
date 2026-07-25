import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './auth'
import { listJournals, setActiveJournal as persistActive } from './repo'
import { activeJournal, resolveJournal, visibleJournals } from './journals'
import type { Journal, ResolvedJournal } from './types'

export interface JournalsValue {
  journals: Journal[]
  /** The account currently being journalled, with defaults resolved. */
  active: ResolvedJournal
  loading: boolean
  switchTo: (journalId: string) => Promise<void>
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

  const live = override === null

  const reload = useCallback(async () => {
    if (!user) return
    try {
      setJournals(await listJournals(user.uid))
    } catch {
      // A journals read failure must not take the whole app down — fall back
      // to the implicit single account so the trader can still log.
      setJournals([])
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (!live) return
    if (!user) {
      setJournals([])
      setLoading(false)
      return
    }
    void reload()
  }, [live, user, reload])

  const active = useMemo(
    () => resolveJournal(activeJournal(journals, profile), profile?.prefs),
    [journals, profile],
  )

  const switchTo = useCallback(
    async (journalId: string) => {
      if (!user) return
      await persistActive(user.uid, journalId)
      await refreshProfile()
    },
    [user, refreshProfile],
  )

  const value = useMemo<JournalsValue>(
    () => ({ journals: visibleJournals(journals), active, loading, switchTo, reload }),
    [journals, active, loading, switchTo, reload],
  )

  return override ?? value
}
