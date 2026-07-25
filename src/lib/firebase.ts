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
    // Spec: stay signed in indefinitely unless the user signs out. The 30-day
    // expiry is enforced explicitly in session.ts, because Firebase has no
    // native concept of it — local persistence alone never expires.
    void setPersistence(authInstance, browserLocalPersistence)
  }
  return authInstance
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
