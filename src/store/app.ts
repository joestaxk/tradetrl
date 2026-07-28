import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { today } from '#/lib/dates'
import type { PeriodKind, Trade } from '#/lib/types'

/**
 * UI state. Deliberately *not* server state — trades live in a Firestore
 * subscription, and this store only holds what the user is currently looking
 * at.
 *
 * §7: the calendar/list toggle is a rendering choice over the same data, so it
 * is a store field and not a route. Switching is instant, with no navigation
 * and no refetch.
 */

export type ViewMode = 'calendar' | 'list'

interface AppState {
  viewMode: ViewMode
  /** Any day inside the month the calendar is showing. */
  anchorDay: string
  /** Day whose detail modal is open, or null. */
  selectedDay: string | null
  /** Trade being edited in the entry sheet, or 'new', or null when closed. */
  entryTarget: Trade | 'new' | null
  /** Prefilled date when opening a fresh entry from a day cell. */
  entryDate: string | null
  /**
   * The trade just saved, awaiting an optional reflection. Never persisted —
   * a half-finished thought should not follow someone into tomorrow.
   */
  reflectTarget: Trade | null
  reviewPeriod: PeriodKind
  reviewAnchor: string

  setViewMode: (mode: ViewMode) => void
  toggleViewMode: () => void
  setAnchorDay: (day: string) => void
  openDay: (day: string) => void
  closeDay: () => void
  openNewTrade: (date?: string) => void
  openEditTrade: (trade: Trade) => void
  closeEntry: () => void
  openReflection: (trade: Trade) => void
  closeReflection: () => void
  setReviewPeriod: (kind: PeriodKind) => void
  setReviewAnchor: (day: string) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      viewMode: 'calendar',
      anchorDay: today(),
      selectedDay: null,
      entryTarget: null,
      entryDate: null,
      reflectTarget: null,
      reviewPeriod: 'week',
      reviewAnchor: today(),

      setViewMode: (viewMode) => set({ viewMode }),
      toggleViewMode: () =>
        set({ viewMode: get().viewMode === 'calendar' ? 'list' : 'calendar' }),
      setAnchorDay: (anchorDay) => set({ anchorDay }),
      openDay: (selectedDay) => set({ selectedDay }),
      closeDay: () => set({ selectedDay: null }),
      openNewTrade: (date) => set({ entryTarget: 'new', entryDate: date ?? today() }),
      openEditTrade: (trade) => set({ entryTarget: trade, entryDate: trade.date }),
      closeEntry: () => set({ entryTarget: null, entryDate: null }),
      openReflection: (reflectTarget) => set({ reflectTarget }),
      closeReflection: () => set({ reflectTarget: null }),
      setReviewPeriod: (reviewPeriod) => set({ reviewPeriod }),
      setReviewAnchor: (reviewAnchor) => set({ reviewAnchor }),
    }),
    {
      name: 'tradetrl-ui',
      // Only the durable preferences survive a reload. Restoring an open modal
      // or a stale anchor month on next visit would be disorienting.
      partialize: (s) => ({ viewMode: s.viewMode, reviewPeriod: s.reviewPeriod }),
    },
  ),
)
