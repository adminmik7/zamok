import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function splash() {
  return document.getElementById('splash')
}

describe('splash screen', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
    document.body.innerHTML = '<div id="splash"></div>'
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stays visible for at least three seconds', async () => {
    const { hideSplash, whenSplashHidden } = await import('../src/ui/splash.js')
    const done = hideSplash()
    let hidden = false
    whenSplashHidden().then(() => {
      hidden = true
    })

    await vi.advanceTimersByTimeAsync(2999)
    expect(splash()).not.toBeNull()
    expect(splash().classList.contains('splash-exit')).toBe(false)
    expect(hidden).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    expect(splash().classList.contains('splash-exit')).toBe(true)
    expect(hidden).toBe(false)

    await vi.advanceTimersByTimeAsync(400)
    expect(splash()).toBeNull()
    expect(hidden).toBe(true)
    await done
  })

  it('does not fail when the overlay is already gone', async () => {
    document.body.innerHTML = ''
    const { hideSplash, whenSplashHidden } = await import('../src/ui/splash.js')
    const done = hideSplash()
    await vi.advanceTimersByTimeAsync(3000)
    await done
    await whenSplashHidden()
    expect(splash()).toBeNull()
  })
})
