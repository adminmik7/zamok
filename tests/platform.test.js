import { beforeEach, describe, expect, it, vi } from 'vitest'

const { state } = vi.hoisted(() => ({ state: { verifyIdentity: () => Promise.resolve(), calls: [] } }))

vi.mock('@capgo/capacitor-native-biometric', () => ({
  NativeBiometric: {
    verifyIdentity: (options) => {
      state.calls.push(options)
      return state.verifyIdentity()
    }
  }
}))

const { biometricAuthenticate, shareFile } = await import('../src/platform/native.js')

describe('biometricAuthenticate', () => {
  beforeEach(() => {
    state.calls = []
    state.verifyIdentity = () => Promise.resolve()
  })

  it('resolves true when verifyIdentity succeeds', async () => {
    await expect(biometricAuthenticate()).resolves.toBe(true)
    expect(state.calls[0]).toMatchObject({ negativeButtonText: 'Отмена' })
  })

  it('resolves false when verifyIdentity is cancelled or fails', async () => {
    state.verifyIdentity = () => Promise.reject(new Error('USER_CANCEL'))
    await expect(biometricAuthenticate()).resolves.toBe(false)
  })

  it('blurs the app while the system prompt is open', async () => {
    let release = null
    state.verifyIdentity = () => new Promise((resolve) => { release = resolve })

    const pending = biometricAuthenticate()
    await Promise.resolve()
    await Promise.resolve()

    const overlay = document.getElementById('privacy-blur-overlay')
    expect(overlay).toBeTruthy()
    expect(overlay.classList.contains('is-active')).toBe(true)

    release()
    await expect(pending).resolves.toBe(true)
    expect(overlay.classList.contains('is-active')).toBe(false)
  })

  it('drops the caret from the password field while the prompt is open', async () => {
    let release = null
    state.verifyIdentity = () => new Promise((resolve) => { release = resolve })
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()

    const pending = biometricAuthenticate()
    await Promise.resolve()
    await Promise.resolve()

    expect(document.activeElement).not.toBe(input)

    release()
    await pending
    expect(document.activeElement).toBe(input)

    input.remove()
  })

  it('removes the blur when the prompt is cancelled', async () => {
    let reject = null
    state.verifyIdentity = () => new Promise((_, fail) => { reject = fail })

    const pending = biometricAuthenticate()
    await Promise.resolve()
    await Promise.resolve()

    reject(new Error('USER_CANCEL'))
    await expect(pending).resolves.toBe(false)
    expect(document.getElementById('privacy-blur-overlay').classList.contains('is-active')).toBe(false)
  })
})

describe('shareFile', () => {
  it('falls back to a download link outside a native shell', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:backup')
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    await expect(shareFile('backup.json', '{}')).resolves.toBe(true)

    expect(URL.createObjectURL).toHaveBeenCalled()
    expect(click).toHaveBeenCalled()
    click.mockRestore()
  })
})
