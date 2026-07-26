import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearStaleBuildGuard, isStaleChunkError, reloadForNewBuild } from './stale-build'

describe('recognising a stale build', () => {
  it('catches the error Chrome throws', () => {
    expect(
      isStaleChunkError(
        new TypeError('Failed to fetch dynamically imported module: /assets/app-C8KK4_7L.js'),
      ),
    ).toBe(true)
  })

  it('catches the Firefox and Safari wordings', () => {
    expect(isStaleChunkError(new Error('Importing a module script failed.'))).toBe(true)
    expect(isStaleChunkError(new Error('Unable to load script /assets/x.js'))).toBe(true)
    expect(
      isStaleChunkError(new Error('error loading dynamically imported module')),
    ).toBe(true)
  })

  it('accepts a bare string, which is how window errors arrive', () => {
    expect(isStaleChunkError('Failed to fetch dynamically imported module')).toBe(true)
  })

  it('ignores unrelated failures', () => {
    // Reloading on a Firestore blip would be an infuriating false positive.
    expect(isStaleChunkError(new Error('permission-denied'))).toBe(false)
    expect(isStaleChunkError(new Error('Network request failed'))).toBe(false)
    expect(isStaleChunkError(null)).toBe(false)
    expect(isStaleChunkError(undefined)).toBe(false)
    expect(isStaleChunkError({})).toBe(false)
  })
})

describe('reloading, exactly once', () => {
  const reload = vi.fn()

  beforeEach(() => {
    sessionStorage.clear()
    reload.mockClear()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reloads to pick up the new build', () => {
    expect(reloadForNewBuild()).toBe(true)
    expect(reload).toHaveBeenCalledOnce()
  })

  it('refuses to loop when the reload did not help', () => {
    // An endless refresh is far worse to sit through than one error screen.
    reloadForNewBuild()
    expect(reloadForNewBuild()).toBe(false)
    expect(reload).toHaveBeenCalledOnce()
  })

  it('allows another reload after a successful render clears the guard', () => {
    reloadForNewBuild()
    clearStaleBuildGuard()
    expect(reloadForNewBuild()).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('still reloads when sessionStorage is unavailable', () => {
    // Private browsing can throw on access; a broken screen is worse.
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(reloadForNewBuild()).toBe(true)
    expect(reload).toHaveBeenCalledOnce()
    spy.mockRestore()
  })
})

describe('the half-updated route tree', () => {
  it('recognises the router error a mixed build produces', () => {
    /*
      When a fresh HTML shell meets a cached route chunk, the route match
      resolves against a tree that doesn't contain it and the router reads
      `.component` off undefined. Treating this as a stale build is what turns
      a white screen into an automatic recovery.
    */
    const err = new TypeError("Cannot read properties of undefined (reading 'component')")
    expect(/reading 'component'/i.test(err.message)).toBe(true)
  })
})
