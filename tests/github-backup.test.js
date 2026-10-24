import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  backupFilename,
  backupTimestamp,
  BACKUP_FOLDER,
  deleteBackup,
  downloadBackup,
  generateProfileId,
  listBackups,
  pruneBackups,
  profileIdForDevice,
  uploadBackup
} from '../src/core/github-backup.js'

const TOKEN = 'github_pat_test'
const PROFILE = 'zamok-test1'

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload)
  }
}

function textResponse(text, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('backupFilename', () => {
  it('stamps the local time into the name', () => {
    expect(backupFilename(new Date(2026, 9, 21, 18, 5, 7))).toBe('zamok-backup-2026-10-21-18-05-07.zmk')
  })

  it('round-trips through backupTimestamp', () => {
    const name = backupFilename(new Date(2026, 9, 21, 18, 5, 7))
    expect(new Date(backupTimestamp(name)).getTime()).toBe(new Date(2026, 9, 21, 18, 5, 7).getTime())
  })

  it('returns zero for a name without a stamp', () => {
    expect(backupTimestamp('random.zmk')).toBe(0)
  })
})

describe('generateProfileId', () => {
  it('produces a zamok- prefix and a safe suffix', () => {
    const id = generateProfileId()
    expect(id).toMatch(/^zamok-[a-z2-9]{6}$/)
  })

  it('does not repeat between calls', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateProfileId()))
    expect(ids.size).toBe(20)
  })
})

describe('profileIdForDevice', () => {
  it('is stable for the same device id', async () => {
    const first = await profileIdForDevice('abc123deviceid')
    const second = await profileIdForDevice('abc123deviceid')

    expect(first).toBe(second)
    expect(first).toMatch(/^zamok-[a-z2-9]{6}$/)
  })

  it('differs between devices', async () => {
    const first = await profileIdForDevice('device-one')
    const second = await profileIdForDevice('device-two')

    expect(first).not.toBe(second)
  })

  it('falls back to a random id without a device id', async () => {
    await expect(profileIdForDevice('')).resolves.toMatch(/^zamok-[a-z2-9]{6}$/)
  })
})

describe('listBackups', () => {
  it('returns only .zmk files, newest first', async () => {
    const calls = []
    vi.stubGlobal('fetch', async (url, options) => {
      calls.push({ url, options })
      return jsonResponse([
        { type: 'file', name: 'zamok-backup-2026-10-20-10-00-00.zmk', size: 1024, sha: 'a' },
        { type: 'file', name: 'zamok-backup-2026-10-21-10-00-00.zmk', size: 2048, sha: 'b' },
        { type: 'file', name: 'readme.md', size: 10, sha: 'c' },
        { type: 'dir', name: 'nested', size: 0, sha: 'd' }
      ])
    })

    const backups = await listBackups(TOKEN, PROFILE)

    expect(backups.map((entry) => entry.name)).toEqual([
      'zamok-backup-2026-10-21-10-00-00.zmk',
      'zamok-backup-2026-10-20-10-00-00.zmk'
    ])
    expect(backups[0].size).toBe(2048)
    expect(calls[0].url).toContain(`/contents/${encodeURIComponent(BACKUP_FOLDER)}/${PROFILE}`)
    expect(calls[0].options.headers.Authorization).toBe(`Bearer ${TOKEN}`)
  })

  it('treats a missing .backup folder as empty', async () => {
    vi.stubGlobal('fetch', async () => textResponse('{"message":"Not Found"}', 404))
    await expect(listBackups(TOKEN, PROFILE)).resolves.toEqual([])
  })

  it('explains a bad token', async () => {
    vi.stubGlobal('fetch', async () => textResponse('{"message":"Bad credentials"}', 401))
    await expect(listBackups(TOKEN, PROFILE)).rejects.toThrow('Токен GitHub неверный или истёк')
  })

  it('explains a rate limit', async () => {
    vi.stubGlobal('fetch', async () => textResponse('{"message":"API rate limit exceeded"}', 403))
    await expect(listBackups(TOKEN, PROFILE)).rejects.toThrow('Лимит запросов GitHub исчерпан')
  })

  it('explains missing permissions', async () => {
    vi.stubGlobal('fetch', async () => textResponse('{"message":"Resource not accessible"}', 403))
    await expect(listBackups(TOKEN, PROFILE)).rejects.toThrow('Нет прав на репозиторий')
  })

  it('rejects a profile id with unsafe characters', async () => {
    await expect(listBackups(TOKEN, '../other')).rejects.toThrow('Некорректный id профиля')
  })

  it('reports a lost connection', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(listBackups(TOKEN, PROFILE)).rejects.toThrow('Нет связи с GitHub')
  })
})

describe('uploadBackup', () => {
  it('sends the backup as base64 JSON', async () => {
    let body = null
    vi.stubGlobal('fetch', async (url, options) => {
      body = JSON.parse(options.body)
      return jsonResponse({ content: { sha: 'new-sha' } })
    })

    const result = await uploadBackup(TOKEN, PROFILE, 'zamok-backup-2026-10-21-18-00-00.zmk', '{"format":"zmk"}')

    expect(result.sha).toBe('new-sha')
    expect(body.message).toContain('zamok-backup-2026-10-21-18-00-00.zmk')
    expect(atob(body.content)).toBe('{"format":"zmk"}')
  })
})

describe('downloadBackup', () => {
  it('requests the raw file and returns its text', async () => {
    let accept = null
    vi.stubGlobal('fetch', async (url, options) => {
      accept = options.headers.Accept
      return textResponse('{"format":"zmk"}')
    })

    await expect(downloadBackup(TOKEN, PROFILE, 'zamok-backup-2026-10-21-18-00-00.zmk')).resolves.toBe('{"format":"zmk"}')
    expect(accept).toBe('application/vnd.github.raw')
  })
})

describe('pruneBackups', () => {
  it('deletes everything past the limit, newest kept', async () => {
    const deleted = []
    const files = Array.from({ length: 12 }, (_, index) => ({
      type: 'file',
      name: `zamok-backup-2026-10-${String(index + 1).padStart(2, '0')}-10-00-00.zmk`,
      size: 100,
      sha: `sha-${index}`
    }))
    vi.stubGlobal('fetch', async (url, options = {}) => {
      if (options.method === 'DELETE') {
        deleted.push(decodeURIComponent(url.split('/').pop()))
        return jsonResponse({})
      }
      return jsonResponse(files)
    })

    const removed = await pruneBackups(TOKEN, PROFILE, 10)

    expect(removed).toHaveLength(2)
    expect(deleted).toEqual(removed)
    expect(removed).toContain('zamok-backup-2026-10-01-10-00-00.zmk')
  })

  it('keeps the upload successful when a delete fails', async () => {
    const files = [
      { type: 'file', name: 'zamok-backup-2026-10-01-10-00-00.zmk', size: 100, sha: 'a' },
      { type: 'file', name: 'zamok-backup-2026-10-02-10-00-00.zmk', size: 100, sha: 'b' }
    ]
    vi.stubGlobal('fetch', async (url, options = {}) => {
      if (options.method === 'DELETE') return textResponse('{"message":"nope"}', 403)
      return jsonResponse(files)
    })

    await expect(pruneBackups(TOKEN, PROFILE, 1)).resolves.toEqual([])
  })
})

describe('deleteBackup', () => {
  it('sends the file sha', async () => {
    let body = null
    vi.stubGlobal('fetch', async (url, options) => {
      body = JSON.parse(options.body)
      return jsonResponse({})
    })

    await deleteBackup(TOKEN, PROFILE, 'zamok-backup-2026-10-01-10-00-00.zmk', 'sha-1')
    expect(body.sha).toBe('sha-1')
  })
})
