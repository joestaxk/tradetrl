import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useAuth } from './auth'
import { loadPlan, savePlan as persistPlan } from './repo'
import { periodId } from './dates'
import type { PeriodKind, PeriodPlan, RiskRules } from './types'

export interface PeriodPlanValue {
  plan: PeriodPlan | null
  loading: boolean
  save: (strategyIds: string[], rules: RiskRules, note?: string) => Promise<void>
  reload: () => Promise<void>
}

/** Dev-preview override, same seam as trades, journals and strategies. */
export const PeriodPlanOverrideContext = createContext<PeriodPlan | null | undefined>(undefined)

/**
 * The plan for the period containing `anchorDay`.
 *
 * Read wherever off-plan needs deciding — the entry sheet marks a trade
 * against it at write time, and the review reports what came of it.
 */
export function usePeriodPlan(anchorDay: string, kind: PeriodKind = 'week'): PeriodPlanValue {
  const override = useContext(PeriodPlanOverrideContext)
  const { user } = useAuth()
  const [plan, setPlan] = useState<PeriodPlan | null>(null)
  const [loading, setLoading] = useState(true)

  const id = periodId(anchorDay, kind)
  const live = override === undefined

  const reload = useCallback(async () => {
    if (!user) return
    try {
      setPlan(await loadPlan(user.uid, id))
    } catch {
      // A missing plan is indistinguishable from no plan for every caller —
      // both mean "nothing was promised", so nothing is off-plan.
      setPlan(null)
    } finally {
      setLoading(false)
    }
  }, [user, id])

  useEffect(() => {
    if (!live) return
    if (!user) {
      setPlan(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    loadPlan(user.uid, id)
      .then((p) => {
        if (!cancelled) setPlan(p)
      })
      .catch(() => {
        if (!cancelled) setPlan(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [live, user, id])

  const save = useCallback(
    async (strategyIds: string[], rules: RiskRules, note?: string) => {
      if (!user) return
      await persistPlan(user.uid, anchorDay, kind, strategyIds, rules, note)
      await reload()
    },
    [user, anchorDay, kind, reload],
  )

  if (!live) {
    return { plan: override ?? null, loading: false, save: async () => {}, reload: async () => {} }
  }

  return { plan, loading, save, reload }
}
