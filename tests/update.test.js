import { describe, expect, it, vi } from 'vitest'

vi.mock('@capacitor/app', () => ({
  App: { getInfo: () => Promise.resolve({ version: '1.0', build: '1' }) }
}))

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: () => Promise.reject(new Error('no prefs')),
    set: () => Promise.resolve()
  }
}))

const { checkForUpdate, compareVersions, fetchLatestRelease, getAppVersion, normalizeVersion, parseRelease } =
  await import('../src/core/update.js')

const releasePayload = {
  tag_name: 'v1.1',
  name: 'Замок 1.1',
  body: 'Что-то новенькое',
  html_url: 'https://github.com/adminmik7/zamok/releases/tag/v1.1',
  assets: [
    { name: 'zamok-1.1.apk', browser_download_url: 'https://example.com/zamok-1.1.apk', size: 7340032 },
    { name: 'notes.txt', browser_download_url: 'https://example.com/notes.txt', size: 10 }
  ]
}

describe('version helpers', () => {
  it('normalizes a tag to a plain version', () => {
    expect(normalizeVersion('v1.0')).toBe('1.0')
    expect(normalizeVersion(' 1.2.3 ')).toBe('1.2.3')
  })

  it('compares versions numerically', () => {
    expect(compareVersions('1.0', '1.0')).toBe(0)
    expect(compareVersions('1.1', '1.0')).toBe(1)
    expect(compareVersions('1.0', '1.1')).toBe(-1)
    expect(compareVersions('1.10', '1.9')).toBe(1)
    expect(compareVersions('v2.0', '1.9.9')).toBe(1)
  })
})

describe('release parsing', () => {
  it('reads the version, the page and the apk asset', () => {
    const release = parseRelease(releasePayload)
    expect(release.version).toBe('1.1')
    expect(release.url).toContain('/releases/tag/v1.1')
    expect(release.asset).toMatchObject({ name: 'zamok-1.1.apk', size: 7340032 })
  })

  it('returns null for a payload without a tag', () => {
    expect(parseRelease({})).toBeNull()
    expect(parseRelease(null)).toBeNull()
  })

  it('reads back its own output so the cached release is usable', () => {
    const cached = parseRelease(releasePayload)
    const restored = parseRelease(cached)
    expect(restored.version).toBe('1.1')
    expect(restored.tag).toBe('v1.1')
    expect(restored.asset).toMatchObject({ name: 'zamok-1.1.apk', size: 7340032 })
  })
})

describe('fetchLatestRelease', () => {
  it('fetches the latest release', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(releasePayload) }))
    const release = await fetchLatestRelease({ fetchImpl })

    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(release.version).toBe('1.1')
  })

  it('throws when GitHub answers with an error', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve({ ok: false, status: 403 }))
    await expect(fetchLatestRelease({ fetchImpl })).rejects.toThrow('403')
  })
})

describe('checkForUpdate', () => {
  it('reports a newer release as available', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(releasePayload) }))
    const result = await checkForUpdate({ currentVersion: '1.0', fetchImpl })

    expect(result.available).toBe(true)
    expect(result.release.version).toBe('1.1')
  })

  it('reports the current release as up to date', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(releasePayload) }))
    const result = await checkForUpdate({ currentVersion: '1.1', fetchImpl })

    expect(result.available).toBe(false)
  })
})

describe('getAppVersion', () => {
  it('reads the version of the running app', async () => {
    await expect(getAppVersion()).resolves.toMatchObject({ version: '1.0' })
  })
})
