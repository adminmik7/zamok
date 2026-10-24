import { App } from '@capacitor/app'
import { Preferences } from '@capacitor/preferences'
import pkg from '../../package.json'

export const RELEASE_API_URL = 'https://api.github.com/repos/adminmik7/zamok/releases/latest'
export const RELEASE_PAGE_URL = 'https://github.com/adminmik7/zamok/releases/latest'

// The GitHub API allows 60 requests per hour, so an hourly check is safe and
// still keeps the release list fresh.
const CHECK_INTERVAL_MS = 60 * 60 * 1000
const PREFS_LAST_CHECK = 'zamok_update_last_check'
const PREFS_LATEST = 'zamok_update_latest'

export function normalizeVersion(value) {
  return String(value ?? '')
    .trim()
    .replace(/^v/i, '')
}

// Compares dotted versions numerically: 1.10 is newer than 1.9.
export function compareVersions(a, b) {
  const left = normalizeVersion(a).split(/[.-]/).map((part) => parseInt(part, 10) || 0)
  const right = normalizeVersion(b).split(/[.-]/).map((part) => parseInt(part, 10) || 0)
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0)
    if (diff !== 0) return diff > 0 ? 1 : -1
  }
  return 0
}

export function parseRelease(payload) {
  if (!payload || typeof payload !== 'object') return null
  const rawTag = payload.tag_name ?? payload.tag ?? ''
  const version = normalizeVersion(payload.version ?? rawTag)
  if (!version) return null
  const tag = String(rawTag).trim() || `v${version}`
  const assets = Array.isArray(payload.assets) ? payload.assets : []
  const apk = payload.asset ?? assets.find((asset) => /\.apk$/i.test(String(asset?.name ?? ''))) ?? null
  return {
    version,
    tag,
    name: String(payload.name ?? tag),
    notes: typeof payload.body === 'string' ? payload.body : typeof payload.notes === 'string' ? payload.notes : '',
    url: String(payload.html_url ?? payload.url ?? RELEASE_PAGE_URL),
    asset: apk
      ? {
          name: String(apk.name),
          url: String(apk.browser_download_url ?? apk.url ?? ''),
          size: Number(apk.size) || 0
        }
      : null
  }
}

export async function fetchLatestRelease({ fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch недоступен')
  const response = await fetchImpl(RELEASE_API_URL, {
    headers: { Accept: 'application/vnd.github+json' }
  })
  if (!response?.ok) throw new Error(`GitHub API: ${response?.status ?? 'ошибка'}`)
  const release = parseRelease(await response.json())
  if (!release) throw new Error('Релиз не найден')
  return release
}

export async function getAppVersion() {
  try {
    const info = await App.getInfo()
    return {
      version: normalizeVersion(info?.version) || pkg.version,
      build: String(info?.build ?? '')
    }
  } catch {
    return { version: pkg.version, build: '' }
  }
}

export async function checkForUpdate({ currentVersion, fetchImpl } = {}) {
  const release = await fetchLatestRelease({ fetchImpl })
  const available = compareVersions(release.version, currentVersion) > 0
  return { available, release }
}

export async function readUpdateCache() {
  try {
    const { value } = await Preferences.get({ key: PREFS_LATEST })
    if (!value) return null
    const release = parseRelease(JSON.parse(value))
    return release
  } catch {
    return null
  }
}

export async function writeUpdateCache(release) {
  try {
    await Preferences.set({ key: PREFS_LATEST, value: JSON.stringify(release) })
    await Preferences.set({ key: PREFS_LAST_CHECK, value: String(Date.now()) })
  } catch {
    void 0
  }
}

export async function shouldCheckForUpdate({ intervalMs = CHECK_INTERVAL_MS } = {}) {
  try {
    const { value } = await Preferences.get({ key: PREFS_LAST_CHECK })
    if (!value) return true
    return Date.now() - Number(value) > intervalMs
  } catch {
    return true
  }
}
