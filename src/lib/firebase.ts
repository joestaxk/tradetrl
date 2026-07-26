/**
 * Firebase client. Lazily initialised and browser-only — TanStack Start
 * renders these routes on the server too, and the web SDK must never run there.
 */

import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  setPersistence,
  type Auth,
} from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'
import { firebaseConfig, isFirebaseConfigured } from './env'

let app: FirebaseApp | null = null
let authInstance: Auth | null = null
let dbInstance: Firestore | null = null
let persistenceReady: Promise<void> = Promise.resolve()

export function getFirebaseApp(): FirebaseApp | null {
  if (typeof window === 'undefined' || !isFirebaseConfigured) return null
  if (!app) app = getApps().length ? getApp() : initializeApp(firebaseConfig)
  return app
}

export function getFirebaseAuth(): Auth | null {
  const a = getFirebaseApp()
  if (!a) return null
  if (!authInstance) {
    authInstance = getAuth(a)
    /*
      Kicked off here so it is in flight as early as possible, but callers that
      are about to sign in must await `authReady()` instead of relying on this.

      `setPersistence` is asynchronous. Starting a sign-in before it settles
      means Firebase may still be on in-memory persistence, and an in-memory
      credential does not survive the full page reload that a redirect sign-in
      performs — the user authenticates, comes back, and is signed out. That is
      a silent failure with no error to catch.
    */
    persistenceReady = setPersistence(authInstance, browserLocalPersistence).catch(
      (e) => {
        // Storage can be unavailable (private mode, locked-down browsers).
        // Sign-in still works for the session; it just won't be remembered.
        console.error('[auth] could not enable persistent sessions:', e)
      },
    )
  }
  return authInstance
}

/**
 * Resolves once session persistence is actually configured.
 * Must be awaited before any sign-in call.
 */
export async function authReady(): Promise<void> {
  getFirebaseAuth()
  await persistenceReady
}

export function getDb(): Firestore | null {
  const a = getFirebaseApp()
  if (!a) return null
  if (!dbInstance) dbInstance = getFirestore(a)
  return dbInstance
}

export function googleProvider() {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  return provider
}
