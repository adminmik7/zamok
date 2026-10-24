import { Preferences } from '@capacitor/preferences'
import { decryptJson, deriveKey, encryptJson, randomSalt, PBKDF2_ITERATIONS } from './crypto.js'

const VAULT_KEY = 'zamok_vault_v1'
const SETTINGS_KEY = 'zamok_settings_v1'
const CATEGORIES_KEY = 'zamok_categories_v1'

export const DEFAULT_SETTINGS = {
  autoLockMs: 60000,
  clipboardClearMs: 30000,
  biometrics: false,
  theme: 'dark',
  sort: 'updated',
  defaultCategory: 'other',
  serverProfile: '',
  secureScreen: true
}

export const DEFAULT_CATEGORIES = [
  { id: 'work', label: 'Работа', color: '#6366f1' },
  { id: 'personal', label: 'Личное', color: '#06b6d4' },
  { id: 'finance', label: 'Финансы', color: '#22c55e' },
  { id: 'social', label: 'Соцсети', color: '#f59e0b' },
  { id: 'other', label: 'Общее', color: '#94a3b8' }
]

// Mutated in place on load/save so every screen sees the current list.
export const CATEGORIES = DEFAULT_CATEGORIES.map((category) => ({ ...category }))

export const CATEGORY_COLORS = [
  '#6366f1', '#06b6d4', '#22c55e', '#f59e0b', '#ec4899', '#a855f7', '#f97316', '#94a3b8',
  '#ef4444', '#f43f5e', '#d946ef', '#8b5cf6', '#3b82f6', '#0ea5e9', '#14b8a6', '#84cc16',
  '#eab308', '#a16207', '#78716c', '#475569', '#1e293b', '#f8fafc', '#fb7185', '#4ade80'
]

export async function readCategories() {
  const native = await readNative(CATEGORIES_KEY)
  const raw = native ?? readRaw(CATEGORIES_KEY)
  if (raw) {
    try {
      const list = JSON.parse(raw)
      if (Array.isArray(list)) {
        const clean = list.filter((category) => category && category.id && category.label)
        if (clean.length) return clean
      }
    } catch {
      // fall through to defaults
    }
  }
  return DEFAULT_CATEGORIES.map((category) => ({ ...category }))
}

export async function writeCategories(list) {
  CATEGORIES.splice(0, CATEGORIES.length, ...list)
  const payload = JSON.stringify(list)
  try {
    await writeNative(CATEGORIES_KEY, payload)
  } catch {
    writeRaw(CATEGORIES_KEY, payload)
  }
}

function storage() {
  if (typeof localStorage !== 'undefined') return localStorage
  return null
}

function readRaw(key) {
  const s = storage()
  return s ? s.getItem(key) : null
}

function writeRaw(key, value) {
  const s = storage()
  if (s) s.setItem(key, value)
}

function removeRaw(key) {
  const s = storage()
  if (s) s.removeItem(key)
}

export async function readNative(key) {
  try {
    const { value } = await Preferences.get({ key })
    return value
  } catch {
    return null
  }
}

export async function writeNative(key, value) {
  try {
    await Preferences.set({ key, value })
  } catch {
    writeRaw(key, value)
  }
}

export async function readSettings() {
  const native = await readNative(SETTINGS_KEY)
  const raw = native ?? readRaw(SETTINGS_KEY)
  if (!raw) return { ...DEFAULT_SETTINGS }
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export async function writeSettings(settings) {
  const payload = JSON.stringify(settings)
  try {
    await writeNative(SETTINGS_KEY, payload)
  } catch {
    writeRaw(SETTINGS_KEY, payload)
  }
}

export async function readVaultMeta() {
  const native = await readNative(VAULT_KEY)
  const raw = native ?? readRaw(VAULT_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// A missing vault and a damaged one both read as null above, and that used to
// make the app offer "create a vault", overwriting unreadable data for good.
export async function vaultMetaStatus() {
  const native = await readNative(VAULT_KEY)
  const raw = native ?? readRaw(VAULT_KEY)
  if (!raw) return 'missing'
  try {
    const meta = JSON.parse(raw)
    if (!meta || typeof meta.salt !== 'string' || typeof meta.iv !== 'string' || typeof meta.data !== 'string') {
      return 'corrupt'
    }
    return 'ok'
  } catch {
    return 'corrupt'
  }
}

export async function writeVaultMeta(meta) {
  const payload = JSON.stringify(meta)
  try {
    await writeNative(VAULT_KEY, payload)
  } catch {
    writeRaw(VAULT_KEY, payload)
  }
}

export async function removeVault() {
  try {
    await Preferences.remove({ key: VAULT_KEY })
  } catch {
    removeRaw(VAULT_KEY)
  }
  removeRaw(VAULT_KEY)
}

export class Vault {
  constructor() {
    this.key = null
    this.salt = null
    this.items = []
    this.unlocked = false
    this.batchDepth = 0
    this.batchPending = false
  }

  async exists() {
    return Boolean(await readVaultMeta())
  }

  async create(masterPassword) {
    try {
      const salt = randomSalt()
      const key = await deriveKey(masterPassword, salt)
      this.key = key
      this.salt = salt
      this.items = []
      this.unlocked = true
      await this.persist()
      return this
    } catch (error) {
      console.error('Vault create failed:', error)
      throw error
    }
  }

  async unlock(masterPassword) {
    const meta = await readVaultMeta()
    if (!meta) throw new Error('Хранилище не найдено')
    const key = await deriveKey(masterPassword, meta.salt)
    const items = await decryptJson(key, { iv: meta.iv, data: meta.data })
    this.key = key
    this.salt = meta.salt
    this.items = items
    this.unlocked = true
    return this
  }

  async persist() {
    if (this.batchDepth) {
      this.batchPending = true
      return
    }
    if (!this.key) throw new Error('Хранилище заблокировано — разблокируйте его заново')
    const payload = await encryptJson(this.key, this.items)
    const meta = await readVaultMeta()
    const next = { salt: this.salt, iv: payload.iv, data: payload.data, createdAt: meta?.createdAt ?? Date.now() }
    await writeVaultMeta(next)
  }

  async batch(action) {
    this.batchDepth += 1
    try {
      await action()
    } finally {
      this.batchDepth -= 1
      if (this.batchDepth === 0 && this.batchPending) {
        this.batchPending = false
        await this.persist()
      }
    }
  }

  lock() {
    this.key = null
    this.unlocked = false
    this.items = []
  }

  list() {
    return [...this.items]
  }

  get(id) {
    return this.items.find((item) => item.id === id) ?? null
  }

  async upsert(entry) {
    const now = Date.now()
    const existing = entry.id ? this.get(entry.id) : null
    const record = {
      id: entry.id ?? `id_${now.toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
      title: (entry.title || '').trim(),
      username: entry.username || '',
      password: entry.password || '',
      url: entry.url || '',
      notes: entry.notes || '',
      category: entry.category || 'other',
      favorite: Boolean(entry.favorite),
      totpSecret: entry.totpSecret || '',
      totpIssuer: entry.totpIssuer || '',
      totpAccount: entry.totpAccount || '',
      type: entry.type || 'login',
      cardNumber: entry.cardNumber || '',
      cardExpiry: entry.cardExpiry || '',
      cardCvv: entry.cardCvv || '',
      cardPin: entry.cardPin || '',
      cardHolder: entry.cardHolder || '',
      cardColor: entry.cardColor ?? existing?.cardColor ?? '',
      cardBrand: entry.cardBrand ?? existing?.cardBrand ?? '',
      passportSeries: entry.passportSeries || '',
      passportNumber: entry.passportNumber || '',
      passportIdNumber: entry.passportIdNumber || '',
      passportIssuedBy: entry.passportIssuedBy || '',
      passportIssuedAt: entry.passportIssuedAt || '',
      passportValidUntil: entry.passportValidUntil || '',
      loyaltyBarcode: entry.loyaltyBarcode || '',
      icon: entry.icon ?? existing?.icon ?? '',
      iconColor: entry.iconColor ?? existing?.iconColor ?? '',
      photo: entry.photo ?? existing?.photo ?? '',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    }
    if (existing) {
      this.items = this.items.map((item) => (item.id === record.id ? record : item))
    } else {
      this.items = [...this.items, record]
    }
    await this.persist()
    return record
  }

  async remove(id) {
    this.items = this.items.filter((item) => item.id !== id)
    await this.persist()
  }

  async changeMasterPassword(current, next) {
    const meta = await readVaultMeta()
    if (!meta) throw new Error('Хранилище не найдено')
    const currentKey = await deriveKey(current, meta.salt)
    const items = await decryptJson(currentKey, { iv: meta.iv, data: meta.data })
    const salt = randomSalt()
    const key = await deriveKey(next, salt)
    const payload = await encryptJson(key, items)
    await writeVaultMeta({ salt, iv: payload.iv, data: payload.data, createdAt: meta.createdAt })
    this.key = key
    this.salt = salt
    this.items = items
    await this.persist()
  }

  async exportPlain() {
    return {
      app: 'zamok',
      version: 1,
      exportedAt: new Date().toISOString(),
      categories: CATEGORIES.map(({ id, label, color }) => ({ id, label, color })),
      items: this.list()
    }
  }

  async verifyPassword(masterPassword) {
    try {
      const meta = await readVaultMeta()
      if (!meta) return false
      const key = await deriveKey(masterPassword, meta.salt)
      await decryptJson(key, { iv: meta.iv, data: meta.data })
      return true
    } catch {
      return false
    }
  }

  async exportEncrypted(masterPassword) {
    const salt = randomSalt()
    const key = await deriveKey(masterPassword, salt)
    const payload = await encryptJson(key, await this.exportPlain())
    return {
      app: 'zamok',
      format: 'zmk',
      version: 1,
      kdf: { name: 'PBKDF2-SHA256', iterations: PBKDF2_ITERATIONS },
      salt,
      iv: payload.iv,
      data: payload.data
    }
  }

  async decryptBackup(file, masterPassword) {
    if (!file || file.format !== 'zmk' || !file.salt || !file.iv || !file.data) {
      throw new Error('Это не файл резервной копии Замка')
    }
    // The KDF cost is read from the file, so an attacker-supplied value could
    // stall the app (huge) or weaken the derivation (tiny).
    const iterations = Number(file.kdf?.iterations) || PBKDF2_ITERATIONS
    if (iterations < 100000 || iterations > 2000000) {
      throw new Error('Файл резервной копии повреждён')
    }
    const key = await deriveKey(masterPassword, file.salt, iterations)
    try {
      return await decryptJson(key, { iv: file.iv, data: file.data })
    } catch {
      throw new Error('Неверный мастер-пароль')
    }
  }

  async importPlain(data, mode = 'merge') {
    if (!this.key || !this.unlocked) throw new Error('Хранилище заблокировано — разблокируйте его заново')
    if (!data || !Array.isArray(data.items)) throw new Error('Некорректный файл')
    if (mode === 'replace') this.items = []
    const signatureOf = (item) =>
      [
        item.type || 'login',
        String(item.title || '').trim().toLowerCase(),
        String(item.username || '').trim().toLowerCase(),
        String(item.cardNumber || '').replace(/\D/g, ''),
        String(item.passportSeries || '').trim().toLowerCase() + String(item.passportNumber || '').trim().toLowerCase(),
        String(item.totpSecret || '').trim().toLowerCase(),
        String(item.notes || '').trim().toLowerCase().slice(0, 80)
      ].join('|')
    const known = new Set(this.items.map(signatureOf))
    let added = 0
    for (const item of data.items) {
      const signature = signatureOf(item)
      if (mode !== 'replace' && known.has(signature)) continue
      known.add(signature)
      this.items.push({
        // Never trust an id from the file: a copy of the same vault would
        // otherwise replace or collide with existing records.
        id: `id_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
        title: item.title || 'Без названия',
        username: item.username || '',
        password: item.password || '',
        url: item.url || '',
        notes: item.notes || '',
        category: item.category || 'other',
        favorite: Boolean(item.favorite),
        totpSecret: item.totpSecret || '',
        totpIssuer: item.totpIssuer || '',
        totpAccount: item.totpAccount || '',
        type: item.type || 'login',
        cardNumber: item.cardNumber || '',
        cardExpiry: item.cardExpiry || '',
        cardCvv: item.cardCvv || '',
        cardPin: item.cardPin || '',
        cardHolder: item.cardHolder || '',
        cardColor: item.cardColor || '',
        cardBrand: item.cardBrand || '',
        passportSeries: item.passportSeries || '',
        passportNumber: item.passportNumber || '',
        passportIdNumber: item.passportIdNumber || '',
        passportIssuedBy: item.passportIssuedBy || '',
        passportIssuedAt: item.passportIssuedAt || '',
        passportValidUntil: item.passportValidUntil || '',
        loyaltyBarcode: item.loyaltyBarcode || '',
        icon: item.icon || '',
        iconColor: item.iconColor || '',
        photo: item.photo || '',
        createdAt: item.createdAt ?? Date.now(),
        updatedAt: Date.now()
      })
      added += 1
    }

    // Restore the categories used by the imported records. Backups made before
    // categories were exported (or records carrying an unknown category id)
    // still get their categories created instead of silently losing the group.
    const fileCategories = (Array.isArray(data.categories) ? data.categories : []).filter(
      (category) =>
        category &&
        typeof category.id === 'string' &&
        category.id &&
        typeof category.label === 'string' &&
        category.label
    )
    const fileItems = Array.isArray(data.items) ? data.items : []
    const nextCategories = CATEGORIES.map((category) => ({ ...category }))
    const byId = new Map(nextCategories.map((category) => [category.id, category]))
    const presets = new Map(DEFAULT_CATEGORIES.map((category) => [category.id, category]))
    let categoriesChanged = false

    const applyCategory = (id, label, color) => {
      if (!id) return
      const existing = byId.get(id)
      if (!existing) {
        const created = { id, label: label || id, color: color || '#94a3b8' }
        byId.set(id, created)
        nextCategories.push(created)
        categoriesChanged = true
        return
      }
      // A locally renamed or recoloured category is the user's own choice and
      // wins over the file; an untouched preset is refreshed from the backup,
      // so a fresh install gets the same category names back.
      const preset = presets.get(id)
      const untouched = preset && preset.label === existing.label && preset.color === existing.color
      if (untouched && label && (existing.label !== label || existing.color !== (color || existing.color))) {
        existing.label = label
        if (color) existing.color = color
        categoriesChanged = true
      }
    }

    for (const category of fileCategories) {
      applyCategory(category.id, category.label, category.color)
    }
    for (const item of fileItems) {
      applyCategory(item?.category, item?.category, '')
    }
    if (categoriesChanged) {
      await writeCategories(nextCategories)
    }

    await this.persist()
    return added
  }
}

