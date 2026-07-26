/**
 * Client-side environment. Vite only exposes `VITE_`-prefixed vars to the
 * browser bundle, which is exactly the boundary we want: the Firebase web
 * config is public by design, the Admin service account never is.
 */

const raw = import.meta.env

export const firebaseConfig = {
  apiKey: raw.VITE_FIREBASE_API_KEY as string,
  authDomain: raw.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: raw.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket: raw.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: raw.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: raw.VITE_FIREBASE_APP_ID as string,
}

/**
 * True when Firebase is actually configured. The app is fully explorable
 * without it — the landing page renders, and the app shell shows a clear
 * setup notice rather than a stack trace.
 */
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId,
)

/** Feature flags. The email check-in ships off by default (§9). */
export const flags = {
  emailCheckIn: raw.VITE_ENABLE_EMAIL_CHECKIN === 'true',
}

/**
 * Public Telegram handle for direct support, without the leading '@'.
 *
 * A bot can only message someone who messaged it first, so the in-app form is
 * one-way by design. This link is the other half: a real conversation, one tap
 * away, in an app the trader already has open on their phone.
 */
export const telegramHandle = (raw.VITE_TELEGRAM_HANDLE as string | undefined)?.replace(
  /^@/,
  '',
)

export const telegramUrl = telegramHandle ? `https://t.me/${telegramHandle}` : null

export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
