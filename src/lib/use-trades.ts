import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { subscribeTrades } from './repo'
import { useAuth } from './auth'
import { useJournals } from './use-journals'
import { summarizeDays } from './aggregate'
import type { DaySummary } from './aggregate'
import type { Trade } from './types'

export interface TradesValue {
  trades: Trade[]
  byDay: Map<string, DaySummary>
  loading: boolean
  error: Error | null
}

/**
 * Optional override. Only the dev-only design preview supplies it, so the real
 * screens can be rendered against fixture data without a Firestore round trip.
 * When absent — always, in production — `useTrades` subscribes for real.
 */
export const TradesOverrideContext = createContext<TradesValue | null>(null)

/**
 * The single live read of the journal. Every view — calendar, list, review,
 * Pro analytics — derives from this one subscription, which is why a trade
 * saved in the entry sheet appears in all of them at once with no refetch.
 */
export function useTrades(): TradesValue {
  const override = useContext(TradesOverrideContext)
  const { user } = useAuth()
  const { active } = useJournals()
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const journalId = active.id
  const live = override === null

  useEffect(() => {
    if (!live) return
    if (!user) {
      setTrades([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    let cancelled = false

    const unsub = subscribeTrades(
      user.uid,
      journalId,
      (next) => {
        if (cancelled) return
        setTrades(next)
        setLoading(false)
      },
      (e) => {
        if (cancelled) return
        setError(e)
        setLoading(false)
      },
    )

    return () => {
      cancelled = true
      unsub()
    }
  }, [live, user, journalId])

  const byDay = useMemo(() => summarizeDays(trades), [trades])

  return override ?? { trades, byDay, loading, error }
}
