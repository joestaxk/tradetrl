import { useEffect, useState } from 'react'
import { firebaseConfig } from '#/lib/env'
import { useAuth } from '#/lib/auth'

/**
 * A readout of what sign-in is actually doing, shown with `?debug=1`.
 *
 * A login that fails *silently* is the hardest kind to fix: there is no error
 * code, so every attempt at a diagnosis is guesswork. This surfaces the few
 * facts that distinguish the plausible causes from each other — whether the
 * credential arrived, whether it persisted, and whether the domain the app is
 * served from matches the domain the auth flow was configured for.
 *
 * Nothing secret is shown. The Firebase web config is public by design, and no
 * token is ever rendered.
 */
export function AuthDebug() {
  const { status, user, profile } = useAuth()
  const [rows, setRows] = useState<[string, string][]>([])

  useEffect(() => {
    const host = window.location.hostname
    const authDomain = firebaseConfig.authDomain ?? '(unset)'

    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true

    let stored = 'none'
    try {
      // Firebase writes its session under a key containing the API key.
      const key = Object.keys(localStorage).find((k) => k.startsWith('firebase:authUser'))
      stored = key ? 'present' : 'none'
    } catch {
      stored = 'localStorage blocked'
    }

    void navigator.serviceWorker?.getRegistrations?.().then((regs) => {
      setRows((r) => [...r, ['service workers', String(regs.length)]])
    })

    setRows([
      ['status', status],
      ['signed in as', user?.uid ? `${user.uid.slice(0, 8)}…` : 'nobody'],
      ['profile loaded', profile ? 'yes' : 'no'],
      ['stored session', stored],
      ['page host', host],
      ['authDomain', authDomain],
      [
        'same origin?',
        authDomain === host ? 'yes' : 'NO — cross-origin, storage may be blocked',
      ],
      ['installed app', standalone ? 'yes' : 'no'],
      ['cookies enabled', String(navigator.cookieEnabled)],
    ])
  }, [status, user, profile])

  return (
    <div className="mx-auto mt-8 w-full max-w-sm rounded-xl border border-line bg-panel p-3.5 text-left">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-ink-faint">
        Sign-in diagnostics
      </p>
      <dl className="flex flex-col gap-1">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="shrink-0 text-[11px] text-ink-muted">{k}</dt>
            <dd className="truncate text-right text-[11px] text-ink-dim">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2.5 text-[11px] leading-relaxed text-ink-faint">
        Screenshot this if sign-in keeps returning you here.
      </p>
    </div>
  )
}
