import { useEffect, useState } from 'react'
import { conversionNeeded } from './risk'

/**
 * Client side of the FX lookup.
 *
 * Two layers of caching sit in front of the network: a module-level map shared
 * by every mount, and localStorage so a reload doesn't re-fetch. The hook only
 * ever fires when a conversion is genuinely required — a USD account trading
 * XXXUSD, or any pair whose rate can be derived from its own price, never
 * touches this.
 */

const TTL_MS = 60 * 60 * 1000
const STORAGE_KEY = 'tradetrl-fx'

export interface RateState {
  rate: number | null
  fetchedAt: number | null
  loading: boolean
  /** Served from cache after a failed refresh. */
  stale: boolean
}

interface Entry {
  rate: number
  fetchedAt: number
}

const memory = new Map<string, Entry>()

function readStore(): Record<string, Entry> {
  if (typeof localStorage === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, Entry>
  } catch {
    return {}
  }
}

function writeStore(key: string, entry: Entry) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readStore(), [key]: entry }))
  } catch {
    // A full or blocked localStorage must never break the calculator.
  }
}

function cached(key: string): Entry | null {
  return memory.get(key) ?? readStore()[key] ?? null
}

export function useFxRate(pair: string, accountCurrency = 'USD'): RateState {
  const need = conversionNeeded(pair, accountCurrency)
  const key = need ? `${need.from}${need.to}` : null

  const [state, setState] = useState<RateState>(() => {
    const hit = key ? cached(key) : null
    return {
      rate: key === null ? 1 : (hit?.rate ?? null),
      fetchedAt: hit?.fetchedAt ?? null,
      loading: false,
      stale: false,
    }
  })

  useEffect(() => {
    if (!key || !need) {
      setState({ rate: 1, fetchedAt: null, loading: false, stale: false })
      return
    }

    const hit = cached(key)
    if (hit && Date.now() - hit.fetchedAt < TTL_MS) {
      setState({ rate: hit.rate, fetchedAt: hit.fetchedAt, loading: false, stale: false })
      return
    }

    let cancelled = false
    // Show the stale figure while refreshing, rather than blanking the readout.
    setState((s) => ({ ...s, rate: hit?.rate ?? s.rate, loading: true }))

    fetch(`/api/fx-rate?from=${need.from}&to=${need.to}`)
      .then((r) => r.json())
      .then((body: { ok: boolean; rate?: number; fetchedAt?: number; stale?: boolean }) => {
        if (cancelled) return
        if (!body.ok || typeof body.rate !== 'number') throw new Error('no rate')
        const entry = { rate: body.rate, fetchedAt: body.fetchedAt ?? Date.now() }
        memory.set(key, entry)
        writeStore(key, entry)
        setState({
          rate: entry.rate,
          fetchedAt: entry.fetchedAt,
          loading: false,
          stale: Boolean(body.stale),
        })
      })
      .catch(() => {
        if (cancelled) return
        setState({
          rate: hit?.rate ?? null,
          fetchedAt: hit?.fetchedAt ?? null,
          loading: false,
          stale: hit !== null,
        })
      })

    return () => {
      cancelled = true
    }
  }, [key, need?.from, need?.to])

  return state
}

/** 'rate as of 14:32' — shown beside a converted figure so it is never implied live. */
export function formatRateAge(fetchedAt: number | null): string | null {
  if (!fetchedAt) return null
  const d = new Date(fetchedAt)
  return `rate as of ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
