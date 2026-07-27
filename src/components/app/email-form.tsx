import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Field, Input } from '#/components/ui/field'
import { useAuth } from '#/lib/auth'
import { cn } from '#/components/ui/cn'

/**
 * Email and password sign-in.
 *
 * Exists because Google sign-in depends on a popup or a cross-origin redirect,
 * and both are unreliable in exactly the places traders actually open this
 * app: Safari with tracking prevention on, an installed home-screen app, or a
 * link tapped inside Telegram or Instagram. This path has none of those moving
 * parts — a form, a request, a session.
 *
 * Sign-in and sign-up are one form with a toggle rather than two screens.
 * Splitting them makes people who cannot remember which they did last time
 * guess, and guessing wrong is where accounts get duplicated.
 */
export function EmailForm({ className }: { className?: string }) {
  const { signInWithEmail, createAccount, resetPassword } = useAuth()

  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const signup = mode === 'signup'
  const canSubmit = email.trim().length > 3 && password.length >= 6 && !busy

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setProblem(null)
    setNotice(null)
    try {
      if (signup) await createAccount(email, password, name)
      else await signInWithEmail(email, password)
    } catch (err) {
      setProblem(messageFor((err as { code?: string })?.code, signup))
      console.error('[auth] email sign-in failed:', err)
    } finally {
      setBusy(false)
    }
  }

  const forgot = async () => {
    if (email.trim().length < 4) {
      setProblem('Type your email address first, then tap this again.')
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      await resetPassword(email)
      // Deliberately not "if that address exists" — the wording that protects
      // against account enumeration also reads as a shrug. Firebase already
      // returns the same result either way.
      /*
        Deliberately worded to cover the Google-only case too: the reset link
        will happily *add* a password to an account that never had one, which
        is the escape hatch for someone who signed up with Google and can no
        longer use it.
      */
      setNotice(
        'Check your email for a link to set a password. This works even if you originally signed in with Google — look in spam if it has not arrived in a minute.',
      )
    } catch (err) {
      setProblem(messageFor((err as { code?: string })?.code, false))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className={cn('flex flex-col gap-3', className)}>
      {signup && (
        <Field label="Your name" optional>
          {(id) => (
            <Input
              id={id}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              placeholder="Sam"
            />
          )}
        </Field>
      )}

      <Field label="Email">
        {(id) => (
          <Input
            id={id}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="email"
            placeholder="you@example.com"
            required
          />
        )}
      </Field>

      <Field
        label="Password"
        hint={signup ? 'At least 6 characters.' : undefined}
      >
        {(id) => (
          <Input
            id={id}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            // Tells a password manager to offer a new password on sign-up and
            // the saved one on sign-in.
            autoComplete={signup ? 'new-password' : 'current-password'}
            placeholder="••••••••"
            required
          />
        )}
      </Field>

      {problem && (
        <p className="rounded-lg border border-loss-edge bg-loss-wash px-3 py-2.5 text-[13px] leading-relaxed text-ink-dim">
          {problem}
        </p>
      )}
      {notice && (
        <p className="rounded-lg border border-win-edge bg-win-wash px-3 py-2.5 text-[13px] leading-relaxed text-ink-dim">
          {notice}
        </p>
      )}

      <Button type="submit" variant="primary" size="lg" disabled={!canSubmit}>
        {busy && <Loader2 className="animate-spin" aria-hidden />}
        {signup ? 'Create account' : 'Sign in'}
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
        <button
          type="button"
          onClick={() => {
            setMode(signup ? 'signin' : 'signup')
            setProblem(null)
            setNotice(null)
          }}
          className="text-accent-bright underline-offset-2 hover:underline"
        >
          {signup ? 'I already have an account' : 'Create an account'}
        </button>

        {!signup && (
          <button
            type="button"
            onClick={forgot}
            className="text-ink-muted underline-offset-2 hover:text-ink hover:underline"
          >
            Forgot password
          </button>
        )}
      </div>
    </form>
  )
}

/**
 * Firebase's error codes in plain English.
 *
 * `invalid-credential` covers wrong password, unknown email and a few other
 * cases — Firebase deliberately collapses them so an attacker cannot discover
 * which addresses are registered. The wording has to stay useful without
 * undoing that.
 */
function messageFor(code: string | undefined, signup: boolean): string {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      /*
        This one code covers three different situations, because Firebase
        collapses them so nobody can probe which addresses are registered. One
        of the three is a genuine dead end if we stay silent: an account
        created with Google has no password, so every attempt here fails and
        the message would send them round in circles.

        Naming Google as a possibility costs nothing — it reveals no account —
        and it is the difference between recovering and giving up.
      */
      return "That email and password don't match an account. If you first signed in with Google, use the Google button below. Otherwise check both, or use “Forgot password” to set one."
    case 'auth/account-exists-with-different-credential':
      return 'You already have an account with that email, created a different way. Try the Google button below, or use “Forgot password” to set a password for it.'
    case 'auth/email-already-in-use':
      return 'There is already an account with that email. Try signing in instead.'
    case 'auth/invalid-email':
      return "That doesn't look like an email address."
    case 'auth/weak-password':
      return 'Passwords need to be at least 6 characters.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a minute and try again.'
    case 'auth/network-request-failed':
      return 'No connection. Check your internet and try again.'
    case 'auth/operation-not-allowed':
      // Aimed squarely at whoever deployed this, because no user can fix it.
      return 'Email sign-in is not switched on for this app yet. Enable Email/Password in Firebase → Authentication → Sign-in method.'
    default:
      return signup
        ? "Couldn't create that account. Please try again in a moment."
        : "Couldn't sign you in. Please try again in a moment."
  }
}
