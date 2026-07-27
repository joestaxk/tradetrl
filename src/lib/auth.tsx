import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import { authReady, getFirebaseAuth, googleProvider } from './firebase'
import { checkAuthDomain, isFirebaseConfigured } from './env'
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
  signInWithEmail: (email: string, password: string) => Promise<void>
  createAccount: (email: string, password: string, name?: string) => Promise<void>
  resetPassword: (email: string) => Promise<void>
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

/** How long we'll wait on Firestore before signing someone in anyway. */
const PROFILE_TIMEOUT_MS = 10_000

/**
 * Reject after `ms` rather than waiting forever.
 *
 * Firestore's SDK has no request timeout — it queues and retries
 * indefinitely, which is right for a write and completely wrong for anything
 * blocking a login.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timed out')), ms),
    ),
  ])
}

/**
 * Environments where a popup cannot report back and must not be attempted.
 *
 * Detection is conservative: when unsure we use the popup, because it is the
 * better experience where it works and redirect has its own cost (a full page
 * load, and third-party-storage restrictions on some browsers).
 */
function prefersRedirectSignIn(): boolean {
  if (typeof window === 'undefined') return false

  // An installed PWA. The popup opens in a separate browser process with no
  // handle back to the standalone window.
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  if (standalone) return true

  // In-app browsers, where popups are either blocked or orphaned.
  const ua = navigator.userAgent || ''
  return /FBAN|FBAV|Instagram|Line\/|Twitter|LinkedInApp|MicroMessenger|TelegramBot|WebView|; wv\)/i.test(
    ua,
  )
}

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

    /*
      Started here, deliberately early. `signInWithPopup` must not await
      anything, so persistence has to be in flight well before the user
      clicks — by which point it has settled.
    */
    void authReady()

    // Loud, because it is invisible otherwise: Firebase throws nothing, the
    // user is simply sent to a URL that does not exist.
    const misconfigured = checkAuthDomain()
    if (misconfigured) console.error('[auth] %s', misconfigured)

    // If Firebase never answers — offline, blocked, or a hung request — fall
    // back to the sign-in screen rather than shimmering a skeleton forever.
    // A wrong-but-recoverable "signed out" beats an unrecoverable spinner.
    const bootTimeout = setTimeout(() => {
      setStatus((s) => (s === 'loading' ? 'signed-out' : s))
    }, 8000)

    /*
      Completes a redirect sign-in. Without this the credential sitting in the
      URL after returning from Google is never consumed, and the user lands
      back on the sign-in screen having just signed in.
    */
    void getRedirectResult(auth).catch((e) => {
      console.error('[auth] redirect sign-in failed:', e)
    })

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      clearTimeout(bootTimeout)
      if (!fbUser) {
        setUser(null)
        setProfile(null)
        setStatus(expiredRef.current ? 'expired' : 'signed-out')
        return
      }

      try {
        /*
          Bounded, deliberately.

          The Firestore SDK retries a stalled request forever rather than
          rejecting it, so `await loadUser(...)` can simply never settle — and
          because the boot timeout was already cleared above, nothing would
          ever set a status. The user watches the sign-in screen do nothing,
          having successfully authenticated. Signing in must never depend on a
          database round trip completing.
        */
        const existing = await withTimeout(loadUser(fbUser.uid), PROFILE_TIMEOUT_MS)
        if (existing && isSessionExpired(existing.lastActiveAt)) {
          expiredRef.current = true
          await signOut(auth)
          return
        }

        expiredRef.current = false
        const doc = await withTimeout(
          upsertUser({
            uid: fbUser.uid,
            displayName: fbUser.displayName,
            email: fbUser.email,
            photoURL: fbUser.photoURL,
          }),
          PROFILE_TIMEOUT_MS,
        )
        setUser(fbUser)
        setProfile(doc)
        setStatus('signed-in')
      } catch (e) {
        // A Firestore hiccup must not strand the user on a blank screen — keep
        // them signed in with whatever identity Firebase Auth already gave us.
        // The profile fills in on the next load.
        console.error('[auth] profile load failed, continuing signed in:', e)
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

    /*
      NOTHING may be awaited before `signInWithPopup` below.

      Safari — and Firefox, less strictly — only allows a popup that is opened
      synchronously within the call stack of the user's click. Any `await`
      first yields to the event loop, the gesture is considered spent, and the
      popup is blocked. Persistence used to be awaited right here, which is
      precisely why Safari users could not sign in while other browsers could.

      Persistence is instead started at boot (see the effect above) and has
      long since settled by the time anyone reaches this button.
    */

    /*
      Popup or redirect, chosen by where we're running.

      `signInWithPopup` needs the popup to talk back to the page that opened
      it. In an installed PWA (display: standalone) and inside in-app browsers
      — Instagram, Facebook, Telegram, LinkedIn — that channel doesn't exist:
      the account picker appears, the user picks, the popup closes, and the
      opener is never told. Nothing happens, no error is thrown, and there is
      nothing for us to catch. It is the single most reported "login is
      broken" symptom for Firebase web apps.

      So those environments go straight to redirect, which leaves the page
      entirely and comes back with the credential in the URL.
    */
    if (prefersRedirectSignIn()) {
      // Safe to await: a redirect opens no popup, so no gesture to preserve.
      await authReady()
      await signInWithRedirect(auth, googleProvider())
      return
    }

    try {
      // Called synchronously — see the note above.
      const popup = signInWithPopup(auth, googleProvider())
      await popup
    } catch (e) {
      const code = (e as { code?: string })?.code ?? ''
      // The browser refusing or losing the popup is recoverable — redirect
      // works where popups don't. A cancellation is the user's choice.
      const popupFailed =
        code === 'auth/popup-blocked' ||
        code === 'auth/operation-not-supported-in-this-environment' ||
        code === 'auth/internal-error'
      if (popupFailed) {
        await signInWithRedirect(auth, googleProvider())
        return
      }
      throw e
    }
  }, [])

  /*
    Email and password. Deliberately plain.

    No popup, no redirect, no cross-origin iframe and no third-party storage —
    which is the entire reason it exists here. Every environment that has given
    Google sign-in trouble (Safari's ITP, installed PWAs, in-app browsers)
    handles this identically to a desktop browser, because it is a single form
    POST to Firebase and nothing more.
  */
  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const auth = getFirebaseAuth()
    if (!auth) throw new Error('Firebase is not configured')
    expiredRef.current = false
    await authReady()
    await signInWithEmailAndPassword(auth, email.trim(), password)
  }, [])

  const createAccount = useCallback(
    async (email: string, password: string, name?: string) => {
      const auth = getFirebaseAuth()
      if (!auth) throw new Error('Firebase is not configured')
      expiredRef.current = false
      await authReady()
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
      // Set before the auth listener writes the user document, so the journal
      // greets them by name rather than by email address.
      if (name?.trim()) {
        await updateProfile(cred.user, { displayName: name.trim() })
      }
    },
    [],
  )

  /** Firebase sends this itself — no Resend, no domain, nothing to configure. */
  const resetPassword = useCallback(async (email: string) => {
    const auth = getFirebaseAuth()
    if (!auth) throw new Error('Firebase is not configured')
    await sendPasswordResetEmail(auth, email.trim())
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
      signInWithEmail,
      createAccount,
      resetPassword,
      signOutNow,
      updatePrefs,
      refreshProfile,
      onboarded: Boolean(profile?.onboardedAt),
    }),
    [
      status,
      user,
      profile,
      signInWithGoogle,
      signInWithEmail,
      createAccount,
      resetPassword,
      signOutNow,
      updatePrefs,
      refreshProfile,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
