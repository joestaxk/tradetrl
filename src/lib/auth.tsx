import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import { getFirebaseAuth, googleProvider } from './firebase'
import { isFirebaseConfigured } from './env'
import { isSessionExpired } from './session'
import { loadUser, savePrefs, upsertUser } from './repo'
import type { UserDoc, UserPrefs } from './types'

export type AuthStatus =
  | 'loading'
  | 'signed-out'
  | 'signed-in'
  | 'expired'
  | 'unconfigured'

interface AuthValue {
  status: AuthStatus
  user: User | null
  profile: UserDoc | null
  signInWithGoogle: () => Promise<void>
  signOutNow: (reason?: 'expired') => Promise<void>
  updatePrefs: (prefs: Partial<UserPrefs>) => Promise<void>
  refreshProfile: () => Promise<void>
  /** True once the entry-detail choice has been made (§3). */
  onboarded: boolean
}

/**
 * Exported so the dev-only design preview (`/preview`) can mount the real app
 * screens against fixture data. Nothing in the shipped app reads it directly —
 * use `useAuth()`.
 */
export const AuthContext = createContext<AuthValue | null>(null)
export type { AuthValue }

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(
    isFirebaseConfigured ? 'loading' : 'unconfigured',
  )
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserDoc | null>(null)
  // Set when we sign someone out ourselves, so the sign-in screen can explain
  // why they are looking at it instead of their calendar.
  const expiredRef = useRef(false)

  useEffect(() => {
    if (!isFirebaseConfigured) return
    const auth = getFirebaseAuth()
    if (!auth) return

    // If Firebase never answers — offline, blocked, or a hung request — fall
    // back to the sign-in screen rather than shimmering a skeleton forever.
    // A wrong-but-recoverable "signed out" beats an unrecoverable spinner.
    const bootTimeout = setTimeout(() => {
      setStatus((s) => (s === 'loading' ? 'signed-out' : s))
    }, 8000)

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      clearTimeout(bootTimeout)
      if (!fbUser) {
        setUser(null)
        setProfile(null)
        setStatus(expiredRef.current ? 'expired' : 'signed-out')
        return
      }

      try {
        // Read before writing: upserting would stamp lastActiveAt and destroy
        // the very evidence the 30-day check depends on.
        const existing = await loadUser(fbUser.uid)
        if (existing && isSessionExpired(existing.lastActiveAt)) {
          expiredRef.current = true
          await signOut(auth)
          return
        }

        expiredRef.current = false
        const doc = await upsertUser({
          uid: fbUser.uid,
          displayName: fbUser.displayName,
          email: fbUser.email,
          photoURL: fbUser.photoURL,
        })
        setUser(fbUser)
        setProfile(doc)
        setStatus('signed-in')
      } catch {
        // A Firestore hiccup must not strand the user on a blank screen — keep
        // them signed in with whatever identity Firebase Auth already gave us.
        setUser(fbUser)
        setStatus('signed-in')
      }
    })

    return () => {
      clearTimeout(bootTimeout)
      unsubscribe()
    }
  }, [])

  const signInWithGoogle = useCallback(async () => {
    const auth = getFirebaseAuth()
    if (!auth) throw new Error('Firebase is not configured')
    expiredRef.current = false
    await signInWithPopup(auth, googleProvider())
  }, [])

  const signOutNow = useCallback(async (reason?: 'expired') => {
    const auth = getFirebaseAuth()
    if (!auth) return
    expiredRef.current = reason === 'expired'
    await signOut(auth)
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!user) return
    setProfile(await loadUser(user.uid))
  }, [user])

  const updatePrefs = useCallback(
    async (prefs: Partial<UserPrefs>) => {
      if (!user) return
      // Optimistic: settings toggles must feel instant, and a failed write is
      // surfaced by the caller's toast rather than by a reverting switch.
      setProfile((p) => (p ? { ...p, prefs: { ...p.prefs, ...prefs } } : p))
      await savePrefs(user.uid, prefs)
    },
    [user],
  )

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      profile,
      signInWithGoogle,
      signOutNow,
      updatePrefs,
      refreshProfile,
      onboarded: Boolean(profile?.onboardedAt),
    }),
    [status, user, profile, signInWithGoogle, signOutNow, updatePrefs, refreshProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
