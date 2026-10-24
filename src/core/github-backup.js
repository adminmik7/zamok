export const BACKUP_OWNER = 'adminmik7'
export const BACKUP_REPO = 'zamok-backup'
export const BACKUP_FOLDER = '.backup'
export const MAX_BACKUPS = 10

const API_ROOT = `https://api.github.com/repos/${BACKUP_OWNER}/${BACKUP_REPO}/contents`
const PROFILE_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'

export function generateProfileId() {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  let suffix = ''
  for (const byte of bytes) suffix += PROFILE_ALPHABET[byte % PROFILE_ALPHABET.length]
  return `zamok-${suffix}`
}

export async function profileIdForDevice(deviceId) {
  if (!deviceId) return generateProfileId()
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`zamok:${deviceId}`))
  const bytes = new Uint8Array(digest)
  let suffix = ''
  for (let index = 0; index < 6; index += 1) suffix += PROFILE_ALPHABET[bytes[index] % PROFILE_ALPHABET.length]
  return `zamok-${suffix}`
}

function profileFolder(profile) {
  const clean = String(profile || '').trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(clean)) throw new Error('Некорректный id профиля')
  return `${encodeURIComponent(BACKUP_FOLDER)}/${encodeURIComponent(clean)}`
}

function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function githubError(status, payload) {
  const message = String(payload || '')
  let text = `GitHub ответил ${status}`
  if (status === 401) text = 'Токен GitHub неверный или истёк'
  if (status === 403) {
    text = /rate limit/i.test(message)
      ? 'Лимит запросов GitHub исчерпан, попробуйте позже'
      : 'Нет прав на репозиторий: токену нужно право Contents'
  }
  if (status === 404) text = 'Репозиторий или папка .backup не найдены'
  if (status === 422) text = 'GitHub отклонил файл резервной копии'
  const error = new Error(text)
  error.status = status
  return error
}

async function request(url, { token, method = 'GET', body, accept } = {}) {
  let response
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: accept || 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    })
  } catch {
    throw new Error('Нет связи с GitHub')
  }
  const text = await response.text()
  if (!response.ok) throw githubError(response.status, text)
  if (accept === 'application/vnd.github.raw') return text
  return text ? JSON.parse(text) : null
}

export function backupTimestamp(name) {
  const match = /(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})/.exec(String(name || ''))
  if (!match) return 0
  const [, year, month, day, hour, minute, second] = match.map(Number)
  return new Date(year, month - 1, day, hour, minute, second).getTime()
}

export function backupFilename(now = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return `zamok-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.zmk`
}

export async function listBackups(token, profile) {
  const folder = profileFolder(profile)
  let entries
  try {
    entries = await request(`${API_ROOT}/${folder}?_=${Date.now()}`, { token })
  } catch (error) {
    if (error.status === 404) return []
    throw error
  }
  if (!Array.isArray(entries)) return []
  return entries
    .filter((entry) => entry?.type === 'file' && /\.zmk$/i.test(String(entry.name || '')))
    .map((entry) => ({
      name: entry.name,
      size: Number(entry.size) || 0,
      sha: entry.sha || '',
      date: backupTimestamp(entry.name)
    }))
    .sort((left, right) => right.name.localeCompare(left.name))
}

export async function uploadBackup(token, profile, filename, content) {
  const data = await request(`${API_ROOT}/${profileFolder(profile)}/${encodeURIComponent(filename)}`, {
    token,
    method: 'PUT',
    body: { message: `backup: ${filename}`, content: encodeBase64(content) }
  })
  return { name: filename, sha: data?.content?.sha || '' }
}

export async function downloadBackup(token, profile, filename) {
  return request(`${API_ROOT}/${profileFolder(profile)}/${encodeURIComponent(filename)}`, {
    token,
    accept: 'application/vnd.github.raw'
  })
}

export async function deleteBackup(token, profile, filename, sha) {
  await request(`${API_ROOT}/${profileFolder(profile)}/${encodeURIComponent(filename)}`, {
    token,
    method: 'DELETE',
    body: { message: `prune: ${filename}`, sha }
  })
}

export async function pruneBackups(token, profile, max = MAX_BACKUPS) {
  const backups = await listBackups(token, profile)
  const stale = backups.slice(max)
  const removed = []
  for (const backup of stale) {
    try {
      await deleteBackup(token, profile, backup.name, backup.sha)
      removed.push(backup.name)
    } catch {
      void 0
    }
  }
  return removed
}
