import { useState } from 'react'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Mark } from '#/components/app/mark'
import { AuthDebug } from '#/components/app/auth-debug'
import { useAuth } from '#/lib/auth'
import { toast } from '#/components/ui/toast'

/** Google's mark, inline SVG — §12 forbids raster or emoji icons anywhere. */
function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.06 12.25c0-.82-.07-1.6-.21-2.36H12v4.46h6.2a5.3 5.3 0 0 1-2.3 3.48v2.9h3.72c2.18-2 3.44-4.96 3.44-8.48Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.11 0 5.72-1.03 7.62-2.79l-3.72-2.89c-1.03.69-2.35 1.1-3.9 1.1-3 0-5.54-2.02-6.45-4.74H1.71v2.98A11.99 11.99 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.55 14.68a7.2 7.2 0 0 1 0-4.6V7.1H1.71a12 12 0 0 0 0 10.56l3.84-2.98Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.69 0 3.21.58 4.4 1.72l3.3-3.3C17.71 1.2 15.1 0 12 0 7.44 0 3.5 2.62 1.71 6.44l3.84 2.98C6.46 6.77 9 4.75 12 4.75Z"
      />
    </svg>
  )
}

export function SignIn({ expired = false }: { expired?: boolean }) {
  const showDebug =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('debug')

  const { signInWithGoogle } = useAuth()
  const [busy, setBusy] = useState(false)
  // Persisted alongside the button, because a toast disappears before a
  // developer has finished reading a setup instruction.
  const [problem, setProblem] = useState<string | null>(null)

  const go = async () => {
    setBusy(true)
    try {
      await signInWithGoogle()
    } catch (e) {
      const code = (e as { code?: string })?.code ?? ''
      // A user closing the Google popup is not an error worth shouting about.
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return
      }
      // The technical cause goes to the console for whoever is running this.
      // The trader gets plain English — a Firebase error code on a sign-in
      // screen is noise to them and slightly alarming.
      console.error('[auth] sign-in failed:', code || e)

      // Only two things a user can actually act on: their popup blocker and
      // their connection. Everything else is our problem, and we say so.
      const actionable: Record<string, { title: string; description: string }> = {
        'auth/popup-blocked': {
          title: 'Your browser blocked the popup',
          description: 'Allow popups for this site, then try again.',
        },
        'auth/network-request-failed': {
          title: 'No connection',
          description: 'Check your internet and try again.',
        },
        /*
          The one misconfiguration a user will actually hit, and the most
          common cause of a Google sign-in that appears to do nothing: the
          domain the app is served from is not on Firebase's authorised list.
          Naming it exactly turns a support ticket into a one-line fix.
        */
        'auth/unauthorized-domain': {
          title: 'This site is not authorised for sign-in yet',
          description:
            typeof window !== 'undefined'
              ? `Add ${window.location.hostname} to Firebase → Authentication → Settings → Authorized domains.`
              : 'The domain needs adding to the Firebase authorised domains list.',
        },
        'auth/operation-not-supported-in-this-environment': {
          title: 'This browser cannot complete sign-in',
          description: 'Open the site in Chrome or Safari directly and try again.',
        },
      }
      const hit = actionable[code]
      setProblem(
        hit
          ? `${hit.title}. ${hit.description}`
          : "Sign-in isn't working right now. This one's on us — please try again shortly.",
      )
      toast.error(hit?.title ?? "Sign-in isn't available", {
        description: hit?.description ?? 'Please try again in a moment.',
        duration: 6000,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mesh grain flex min-h-dvh flex-col items-center justify-center px-5 py-16">
      <div className="w-full max-w-sm">
        <div className="stagger flex flex-col items-center text-center" style={{ '--i': 0 } as React.CSSProperties}>
          <Mark className="size-11" />
          <h1 className="mt-6 font-display text-3xl leading-tight text-ink">
            Welcome back
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            One tap in. Your journal is exactly where you left it.
          </p>
        </div>

        {expired && (
          <div
            className="stagger mt-6 flex gap-2.5 rounded-xl border border-caution/25 bg-caution-wash px-3.5 py-3"
            style={{ '--i': 1 } as React.CSSProperties}
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-caution" aria-hidden />
            <p className="text-[13px] leading-relaxed text-ink-dim">
              It's been over 30 days, so we signed you out. Nothing was lost — sign
              back in and everything is still here.
            </p>
          </div>
        )}

        <div className="stagger mt-8" style={{ '--i': 2 } as React.CSSProperties}>
          <Button size="lg" variant="secondary" className="w-full" onClick={go} disabled={busy}>
            <GoogleGlyph />
            {busy ? 'Opening Google…' : 'Continue with Google'}
          </Button>
          {problem ? (
            <div className="mt-4 flex gap-2.5 rounded-xl border border-loss-edge bg-loss-wash px-3.5 py-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-loss" aria-hidden />
              <p className="text-[13px] leading-relaxed text-ink-dim">{problem}</p>
            </div>
          ) : (
            <p className="mt-4 text-center text-xs leading-relaxed text-ink-faint">
              Google is the only way in — no password to forget, nothing to reset.
            </p>
          )}
        </div>

        {/* Opt-in, so a stuck user can hand back facts instead of symptoms. */}
        {showDebug && <AuthDebug />}
      </div>
    </main>
  )
}

export function NotConfigured() {
  return (
    <main className="mesh grain flex min-h-dvh items-center justify-center px-5 py-16">
      <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-6">
        <Mark className="size-9" />
        <h1 className="mt-5 font-display text-2xl text-ink">Almost there</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Firebase isn't wired up yet, so there's nothing to sign in to. Copy{' '}
          <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[12px] text-ink-dim">
            .env.example
          </code>{' '}
          to{' '}
          <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-[12px] text-ink-dim">
            .env
          </code>
          , fill in the six <span className="font-mono text-[12px]">VITE_FIREBASE_*</span>{' '}
          values from your Firebase project, and restart the dev server.
        </p>
        <Button variant="outline" size="md" className="mt-5" asChild>
          <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer">
            Open Firebase console
            <ArrowRight aria-hidden />
          </a>
        </Button>
      </div>
    </main>
  )
}
