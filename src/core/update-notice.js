import { normalizeVersion } from './update.js'
import { readNative, writeNative } from './store.js'

const PREFS_SEEN = 'zamok_update_seen_versions'
const SEEN_LIMIT = 20

function storage() {
  if (typeof localStorage !== 'undefined') return localStorage
  return null
}

async function readRaw() {
  const native = await readNative(PREFS_SEEN)
  if (native) return native
  const s = storage()
  return s ? s.getItem(PREFS_SEEN) : null
}

async function writeRaw(value) {
  await writeNative(PREFS_SEEN, value)
}

export async function readSeenVersions() {
  try {
    const raw = await readRaw()
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map((item) => normalizeVersion(item)).filter(Boolean)
  } catch {
    return []
  }
}

export async function rememberSeenVersion(version) {
  const target = normalizeVersion(version)
  if (!target) return []
  try {
    const seen = await readSeenVersions()
    if (seen.includes(target)) return seen
    const next = [...seen, target].slice(-SEEN_LIMIT)
    await writeRaw(JSON.stringify(next))
    return next
  } catch {
    return []
  }
}

export function shouldNotifyUpdate({ screen = '', version = '', seen = [] } = {}) {
  const target = normalizeVersion(version)
  if (!target) return false
  if (screen === 'settings') return false
  const known = seen.map((item) => normalizeVersion(item))
  return !known.includes(target)
}
