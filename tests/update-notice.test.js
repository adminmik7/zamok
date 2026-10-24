import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map()

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: ({ key }) => (store.has(key) ? Promise.resolve({ value: store.get(key) }) : Promise.resolve({ value: null })),
    set: ({ key, value }) => {
      store.set(key, value)
      return Promise.resolve()
    }
  }
}))

const { readSeenVersions, rememberSeenVersion, shouldNotifyUpdate } = await import('../src/core/update-notice.js')

beforeEach(() => {
  store.clear()
  if (typeof localStorage !== 'undefined') localStorage.clear()
})

describe('shouldNotifyUpdate', () => {
  it('allows a notification for a fresh version', () => {
    expect(shouldNotifyUpdate({ version: '1.13.0', seen: [] })).toBe(true)
  })

  it('skips a version without a number', () => {
    expect(shouldNotifyUpdate({ version: '', seen: [] })).toBe(false)
  })

  it('skips the settings screen', () => {
    expect(shouldNotifyUpdate({ screen: 'settings', version: '1.13.0', seen: [] })).toBe(false)
  })

  it('skips a version the user has already checked manually', () => {
    expect(shouldNotifyUpdate({ version: '1.13.0', seen: ['1.13.0'] })).toBe(false)
  })

  it('compares versions without the v prefix', () => {
    expect(shouldNotifyUpdate({ version: '1.13.0', seen: ['v1.13.0'] })).toBe(false)
    expect(shouldNotifyUpdate({ version: 'v1.13.0', seen: ['1.13.0'] })).toBe(false)
  })
})

describe('rememberSeenVersion', () => {
  it('remembers a version and reads it back', async () => {
    await rememberSeenVersion('1.13.0')
    expect(await readSeenVersions()).toEqual(['1.13.0'])
  })

  it('keeps the list without duplicates', async () => {
    await rememberSeenVersion('1.13.0')
    await rememberSeenVersion('1.13.0')
    expect(await readSeenVersions()).toEqual(['1.13.0'])
  })

  it('keeps several versions in order', async () => {
    await rememberSeenVersion('1.13.0')
    await rememberSeenVersion('1.14.0')
    expect(await readSeenVersions()).toEqual(['1.13.0', '1.14.0'])
  })

  it('ignores an empty version', async () => {
    await rememberSeenVersion('')
    expect(await readSeenVersions()).toEqual([])
  })

  it('reads an empty list when nothing was stored', async () => {
    expect(await readSeenVersions()).toEqual([])
  })
})
