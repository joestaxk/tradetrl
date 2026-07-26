import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './auth'
import { subscribeStrategies } from './repo'
import { activeStrategies, strategyName } from './strategies'
import type { Strategy } from './types'

export interface StrategiesValue {
  /** Everything, including archived — for the settings list. */
  all: Strategy[]
  /** What the picker offers. */
  active: Strategy[]
  loading: boolean
  nameOf: (id: string | undefined) => string | undefined
}

/** Dev-preview override, same seam as trades and journals. */
export const StrategiesOverrideContext = createContext<StrategiesValue | null>(null)

export function useStrategies(): StrategiesValue {
  const override = useContext(StrategiesOverrideContext)
  const { user } = useAuth()
  const [all, setAll] = useState<Strategy[]>([])
  const [loading, setLoading] = useState(true)

  const live = override === null

  useEffect(() => {
    if (!live) return
    if (!user) {
      setAll([])
      setLoading(false)
      return
    }
    let cancelled = false
    const unsub = subscribeStrategies(
      user.uid,
      (rows) => {
        if (cancelled) return
        setAll(rows)
        setLoading(false)
      },
      () => {
        // A strategies read failure must not stop someone logging a trade —
        // the picker simply has nothing in it.
        if (!cancelled) setLoading(false)
      },
    )
    return () => {
      cancelled = true
      unsub()
    }
  }, [live, user])

  const value = useMemo<StrategiesValue>(
    () => ({
      all,
      active: activeStrategies(all),
      loading,
      nameOf: (id) => strategyName(all, id),
    }),
    [all, loading],
  )

  return override ?? value
}
