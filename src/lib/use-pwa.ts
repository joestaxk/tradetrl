import { useCallback, useEffect, useState } from 'react'

/**
 * Install-to-home-screen.
 *
 * Chromium fires `beforeinstallprompt`, which we capture and replay when the
 * user asks — browsers require the prompt to come from a real gesture, so it
 * cannot be shown automatically.
 *
 * iOS Safari fires nothing and has no API: installing is Share → Add to Home
 * Screen. So we detect it and show instructions rather than a button that
 * would do nothing.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type InstallState = 'unsupported' | 'available' | 'ios' | 'installed'

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari's non-standard flag, still the only signal there.
    (window.navigator as { standalone?: boolean }).standalone === true
  )
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports as a Mac; the touch points give it away.
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  )
}

export function usePwaInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [state, setState] = useState<InstallState>('unsupported')

  useEffect(() => {
    if (isStandalone()) {
      setState('installed')
      return
    }
    if (isIos()) setState('ios')

    const onPrompt = (e: Event) => {
      // Chromium shows its own mini-infobar unless we take over.
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      setState('available')
    }
    const onInstalled = () => {
      setState('installed')
      setDeferred(null)
    }

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = useCallback(async () => {
    if (!deferred) return false
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    // The event is single-use; a dismissal means we wait for the next one.
    setDeferred(null)
    if (outcome === 'accepted') setState('installed')
    return outcome === 'accepted'
  }, [deferred])

  return { state, install, canInstall: state === 'available' }
}

/**
 * Registers the worker after load, so it never competes with first paint.
 * Skipped in dev, where a worker caching assets fights HMR.
 */
export function registerServiceWorker() {
  if (typeof window === 'undefined') return
  if (!('serviceWorker' in navigator)) return
  if (import.meta.env.DEV) return

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => {
      console.error('[pwa] service worker registration failed:', e)
    })
  })
}
