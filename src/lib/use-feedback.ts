import { useCallback, useMemo, useState } from 'react'
import { useAuth } from './auth'
import { saveFeedback } from './repo'
import { normalizeNote, shouldAsk, type Mood } from './feedback'
import type { Trade } from './types'

/**
 * Feedback plumbing.
 *
 * Firestore is written first and the admin email is best-effort after it, so
 * a mail outage never costs us the response — and the user is thanked either
 * way, because from their side the job is done the moment they tap.
 */
export function useFeedback(trades: Trade[]) {
  const { user, profile, refreshProfile } = useAuth()
  // Local dismissal so closing the card is instant, before the write lands.
  const [dismissed, setDismissed] = useState(false)

  const activeDays = useMemo(() => new Set(trades.map((t) => t.date)).size, [trades])

  const ask =
    !dismissed &&
    shouldAsk({
      state: profile?.feedback,
      tradeCount: trades.length,
      activeDays,
    })

  const send = useCallback(
    async (
      mood: Mood | undefined,
      note: string,
      kind: 'feedback' | 'idea' = 'feedback',
      telegram?: string,
    ) => {
      const clean = normalizeNote(note)
      if (!mood && !clean) return

      if (user) {
        try {
          await saveFeedback(user.uid, { mood, note: clean, kind })
          await refreshProfile()
        } catch (e) {
          // Their opinion still reaches us via the delivery call below.
          console.error('[feedback] save failed:', e)
        }
      }

      try {
        await fetch('/api/feedback', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            mood,
            note: clean,
            kind,
            // How to reply. Blank means they chose to stay anonymous.
            telegram: telegram?.trim() || undefined,
            uid: user?.uid,
            email: profile?.email,
            name: profile?.displayName,
            tradeCount: trades.length,
          }),
        })
      } catch (e) {
        console.error('[feedback] notify failed:', e)
      }
    },
    [user, profile, trades.length, refreshProfile],
  )

  const dismiss = useCallback(async () => {
    setDismissed(true)
    if (!user) return
    try {
      await saveFeedback(user.uid, { dismissed: true })
      await refreshProfile()
    } catch (e) {
      console.error('[feedback] dismiss failed:', e)
    }
  }, [user, refreshProfile])

  return { ask, send, dismiss }
}
