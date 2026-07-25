/**
 * Firebase Admin — server only.
 *
 * Admin SDK *reads* work on the Spark (free) plan; it's Cloud Functions'
 * outbound network calls that require Blaze. That is exactly why the cron
 * lives on Vercel and calls Resend from here instead of from a Firebase
 * Function (§9).
 *
 * Nothing in this file may be imported from client code — it reads secrets
 * from process.env that are deliberately not VITE_-prefixed.
 */

import { cert, getApp, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

let cached: Firestore | null = null

function credentials() {
  // Either a whole service-account JSON blob, or the three fields separately.
  const blob = process.env.FIREBASE_SERVICE_ACCOUNT
  if (blob) {
    const parsed = JSON.parse(blob) as {
      project_id: string
      client_email: string
      private_key: string
    }
    return {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key,
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  // Env vars flatten newlines to the literal two characters `\n`; restore them
  // or the PEM parser rejects the key with a very unhelpful error.
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!projectId || !clientEmail || !privateKey) return null
  return { projectId, clientEmail, privateKey }
}

export function adminAvailable(): boolean {
  return credentials() !== null
}

export function getAdminApp(): App | null {
  const creds = credentials()
  if (!creds) return null
  if (getApps().length > 0) return getApp()
  return initializeApp({
    credential: cert(creds),
    projectId: creds.projectId,
  })
}

export function getAdminDb(): Firestore | null {
  if (cached) return cached
  const app = getAdminApp()
  if (!app) return null
  cached = getFirestore(app)
  return cached
}
