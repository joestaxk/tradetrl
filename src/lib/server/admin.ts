/**
 * Firebase Admin — server only, and loaded lazily.
 *
 * Admin SDK *reads* work on the Spark (free) plan; it's Cloud Functions'
 * outbound network calls that require Blaze. That is exactly why the cron
 * lives on Vercel and calls Resend from here instead of from a Firebase
 * Function (§9).
 *
 * WHY THE DYNAMIC IMPORT
 * ----------------------
 * Nitro eagerly loads every route module when the server function boots, so a
 * top-level `import ... from 'firebase-admin/app'` in a route pulled the whole
 * Admin SDK into the SSR path of *every page request*. Bundled and code-split
 * that way, the SDK's internal version registration ends up undefined and the
 * import throws `Cannot read properties of undefined (reading 'SDK_VERSION')`
 * — taking down page rendering, not just the cron.
 *
 * Importing inside the function keeps the SDK off the render path entirely:
 * it is loaded only when a route that actually needs Firestore-as-admin runs.
 *
 * Nothing here may be imported from client code — it reads secrets from
 * process.env that are deliberately not VITE_-prefixed.
 */

import type { App } from 'firebase-admin/app'
import type { Firestore } from 'firebase-admin/firestore'

let cached: Firestore | null = null

function credentials() {
  // Either a whole service-account JSON blob, or the three fields separately.
  const blob = process.env.FIREBASE_SERVICE_ACCOUNT
  if (blob) {
    try {
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
    } catch {
      // Malformed JSON in an env var shouldn't crash the process — fall
      // through to the separate fields and report unavailable if those are
      // missing too.
      console.error('[admin] FIREBASE_SERVICE_ACCOUNT is not valid JSON')
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

export async function getAdminApp(): Promise<App | null> {
  const creds = credentials()
  if (!creds) return null

  const { cert, getApp, getApps, initializeApp } = await import('firebase-admin/app')
  if (getApps().length > 0) return getApp()
  return initializeApp({ credential: cert(creds), projectId: creds.projectId })
}

/**
 * Returns null — never throws — when Admin isn't configured or fails to load,
 * so a caller can degrade rather than 500.
 */
export async function getAdminDb(): Promise<Firestore | null> {
  if (cached) return cached
  try {
    const app = await getAdminApp()
    if (!app) return null
    const { getFirestore } = await import('firebase-admin/firestore')
    cached = getFirestore(app)
    return cached
  } catch (e) {
    console.error('[admin] failed to initialise Firebase Admin:', e)
    return null
  }
}
