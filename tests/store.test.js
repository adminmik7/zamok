import { describe, expect, it, beforeEach, vi } from 'vitest'
import { Vault, DEFAULT_SETTINGS, readSettings, writeSettings, removeVault, readCategories, writeCategories, DEFAULT_CATEGORIES, CATEGORIES, vaultMetaStatus } from '../src/core/store.js'

describe('store', () => {
  beforeEach(async () => {
    localStorage.clear()
    await removeVault()
  })

  it('creates vault and persists encrypted payload', async () => {
    const vault = new Vault()
    expect(await vault.exists()).toBe(false)
    await vault.create('master-password')
    expect(await vault.exists()).toBe(true)

    const raw =
      localStorage.getItem('zamok_vault_v1') ??
      localStorage.getItem('CapacitorStorage.zamok_vault_v1')
    expect(raw).toBeTruthy()
    expect(raw).not.toContain('master-password')
  })

  it('unlocks vault with correct password and rejects wrong one', async () => {
    const vault = new Vault()
    await vault.create('master-password')
    await vault.upsert({ title: 'Почта', username: 'a@b.c', password: 'secret' })

    const other = new Vault()
    await expect(other.unlock('wrong-password')).rejects.toBeTruthy()

    const fresh = new Vault()
    await fresh.unlock('master-password')
    expect(fresh.list()).toHaveLength(1)
    expect(fresh.list()[0].title).toBe('Почта')
    expect(fresh.list()[0].password).toBe('secret')
  })

  it('upserts, updates and removes entries', async () => {
    const vault = new Vault()
    await vault.create('master-password')
    const created = await vault.upsert({ title: 'Первая', password: 'p1' })
    expect(vault.list()).toHaveLength(1)

    await vault.upsert({ ...created, title: 'Изменённая' })
    expect(vault.list()).toHaveLength(1)
    expect(vault.list()[0].title).toBe('Изменённая')

    await vault.remove(created.id)
    expect(vault.list()).toHaveLength(0)
  })

  it('saves the vault once per batch of mutations', async () => {
    const setItem = vi.spyOn(window.localStorage, 'setItem')
    const vault = new Vault()
    await vault.create('master-password')
    setItem.mockClear()
    await vault.batch(async () => {
      await vault.upsert({ title: 'A' })
      await vault.upsert({ title: 'B' })
      await vault.upsert({ title: 'C' })
    })
    const writes = setItem.mock.calls.filter(([key]) => String(key).includes('zamok_vault_v1'))
    setItem.mockRestore()
    expect(writes).toHaveLength(1)

    const fresh = new Vault()
    await fresh.unlock('master-password')
    expect(fresh.list().map((item) => item.title).sort()).toEqual(['A', 'B', 'C'])
  })

  it('without batch every mutation saves the vault separately', async () => {
    const setItem = vi.spyOn(window.localStorage, 'setItem')
    const vault = new Vault()
    await vault.create('master-password')
    setItem.mockClear()
    await vault.upsert({ title: 'A' })
    await vault.upsert({ title: 'B' })
    const writes = setItem.mock.calls.filter(([key]) => String(key).includes('zamok_vault_v1'))
    setItem.mockRestore()
    expect(writes).toHaveLength(2)
  })

  it('persists bank card fields', async () => {
    const vault = new Vault()
    await vault.create('master-password')
    await vault.upsert({
      type: 'card',
      title: 'Банк',
      cardNumber: '4111111111111111',
      cardExpiry: '09/28',
      cardCvv: '123',
      cardPin: '4321',
      cardHolder: 'IVAN IVANOV'
    })

    const fresh = new Vault()
    await fresh.unlock('master-password')
    expect(fresh.list()[0]).toMatchObject({
      type: 'card',
      cardNumber: '4111111111111111',
      cardExpiry: '09/28',
      cardCvv: '123',
      cardPin: '4321',
      cardHolder: 'IVAN IVANOV'
    })
  })

  it('changes master password and keeps data readable', async () => {
    const vault = new Vault()
    await vault.create('old-password')
    await vault.upsert({ title: 'Запись', password: 'p' })
    await vault.changeMasterPassword('old-password', 'new-password')

    const fresh = new Vault()
    await fresh.unlock('new-password')
    expect(fresh.list()[0].title).toBe('Запись')
    await expect(fresh.unlock('old-password')).rejects.toBeTruthy()
  })

  it('exports and imports plain backup', async () => {
    const vault = new Vault()
    await vault.create('master-password')
    await vault.upsert({ title: 'Экспорт', username: 'u', password: 'p', icon: 'bank', iconColor: '#6366f1' })
    const backup = await vault.exportPlain()
    expect(backup.items).toHaveLength(1)

    const target = new Vault()
    await target.create('other-password')
    const added = await target.importPlain(backup, 'merge')
    expect(added).toBe(1)
    expect(target.list()[0].title).toBe('Экспорт')
    expect(target.list()[0]).toMatchObject({ icon: 'bank', iconColor: '#6366f1' })
  })

  it('exports categories and restores them on import', async () => {
    const custom = [{ id: 'banks', label: 'Банки', color: '#123456' }]
    await writeCategories(custom)

    const source = new Vault()
    await source.create('master-password')
    await source.upsert({ title: 'Вклад', category: 'banks', icon: 'bank', iconColor: '#22c55e' })
    const file = await source.exportEncrypted('file-password')
    expect((await source.decryptBackup(file, 'file-password')).categories).toEqual(custom)

    await writeCategories(DEFAULT_CATEGORIES.map((category) => ({ ...category })))
    const target = new Vault()
    await target.create('other-password')
    await target.importPlain(await source.decryptBackup(file, 'file-password'), 'merge')

    expect(CATEGORIES).toContainEqual(custom[0])
    expect(target.list()[0]).toMatchObject({ category: 'banks', icon: 'bank', iconColor: '#22c55e' })

    await writeCategories(DEFAULT_CATEGORIES.map((category) => ({ ...category })))
  })

  it('refreshes untouched preset categories from the backup', async () => {
    await writeCategories([{ id: 'work', label: 'Офис', color: '#ff0000' }, { id: 'personal', label: 'Личное', color: '#06b6d4' }])

    const source = new Vault()
    await source.create('master-password')
    const plain = await source.exportPlain()
    expect(plain.categories).toContainEqual({ id: 'work', label: 'Офис', color: '#ff0000' })

    await writeCategories(DEFAULT_CATEGORIES.map((category) => ({ ...category })))
    const target = new Vault()
    await target.create('other-password')
    await target.importPlain(plain, 'merge')

    expect(CATEGORIES.find((category) => category.id === 'work')).toEqual({ id: 'work', label: 'Офис', color: '#ff0000' })

    await writeCategories(DEFAULT_CATEGORIES.map((category) => ({ ...category })))
  })

  it('keeps a locally renamed category instead of overwriting it', async () => {
    await writeCategories(DEFAULT_CATEGORIES.map((category) => ({ ...category })))

    const source = new Vault()
    await source.create('master-password')
    const plain = await source.exportPlain()

    await writeCategories(CATEGORIES.map((category) =>
      category.id === 'work' ? { ...category, label: 'Моя работа' } : { ...category }
    ))
    const target = new Vault()
    await target.create('other-password')
    await target.importPlain(plain, 'merge')

    expect(CATEGORIES.find((category) => category.id === 'work').label).toBe('Моя работа')

    await writeCategories(DEFAULT_CATEGORIES.map((category) => ({ ...category })))
  })

  it('keeps the discount card barcode through a backup round trip', async () => {
    const source = new Vault()
    await source.create('master-password')
    await source.upsert({ type: 'loyalty', title: 'Пятёрочка', loyaltyBarcode: '4006381333931' })
    expect(source.list()[0].loyaltyBarcode).toBe('4006381333931')

    const file = await source.exportEncrypted('file-password')
    const plain = await source.decryptBackup(file, 'file-password')
    expect(plain.items[0].loyaltyBarcode).toBe('4006381333931')

    const target = new Vault()
    await target.create('other-password')
    await target.importPlain(plain, 'merge')
    expect(target.list()[0]).toMatchObject({ type: 'loyalty', loyaltyBarcode: '4006381333931' })
  })

  it('creates categories referenced by an imported record when the file has none', async () => {    await writeCategories(DEFAULT_CATEGORIES.map((category) => ({ ...category })))
    const target = new Vault()
    await target.create('master-password')
    await target.importPlain({ items: [{ title: 'Поездка', category: 'travel' }] }, 'merge')

    expect(CATEGORIES.some((category) => category.id === 'travel')).toBe(true)

    await writeCategories(DEFAULT_CATEGORIES.map((category) => ({ ...category })))
  })

  it('exports an encrypted zmk backup and decrypts it with the password', async () => {
    const vault = new Vault()
    await vault.create('master-password')
    await vault.upsert({ title: 'Секрет', username: 'u', password: 'p' })

    const file = await vault.exportEncrypted('file-password')
    expect(file.format).toBe('zmk')
    expect(file.data).toBeTruthy()
    expect(JSON.stringify(file)).not.toContain('Секрет')
    expect(JSON.stringify(file)).not.toContain('file-password')

    const plain = await vault.decryptBackup(file, 'file-password')
    expect(plain.items[0].title).toBe('Секрет')

    await expect(vault.decryptBackup(file, 'wrong-password')).rejects.toThrow('Неверный мастер-пароль')
    await expect(vault.decryptBackup({ format: 'json', items: [] }, 'x')).rejects.toThrow('не файл')
  })

  it('verifies the master password', async () => {
    const vault = new Vault()
    await vault.create('master-password')

    expect(await vault.verifyPassword('master-password')).toBe(true)
    expect(await vault.verifyPassword('wrong')).toBe(false)
  })

  it('skips duplicates on merge import', async () => {
    const vault = new Vault()
    await vault.create('master-password')
    await vault.upsert({ title: 'Дубль', username: 'u', password: 'p' })
    const backup = await vault.exportPlain()
    const added = await vault.importPlain(backup, 'merge')
    expect(added).toBe(0)
    expect(vault.list()).toHaveLength(1)
  })

  it('keeps distinct cards and passports that share a title on merge import', async () => {
    const source = new Vault()
    await source.create('master-password')
    await source.upsert({ title: 'Карта', type: 'card', cardNumber: '1111 1111 1111 1111' })
    await source.upsert({ title: 'Карта', type: 'card', cardNumber: '2222 2222 2222 2222' })
    await source.upsert({ title: 'Паспорт', type: 'passport', passportSeries: 'MP', passportNumber: '1111111' })
    await source.upsert({ title: 'Паспорт', type: 'passport', passportSeries: 'MP', passportNumber: '2222222' })

    const target = new Vault()
    await target.create('other-password')
    const added = await target.importPlain(await source.exportPlain(), 'merge')
    expect(added).toBe(4)
  })

  it('gives imported records fresh ids', async () => {
    const source = new Vault()
    await source.create('master-password')
    const original = await source.upsert({ title: 'Запись', username: 'u', password: 'p' })

    const target = new Vault()
    await target.create('other-password')
    await target.importPlain(await source.exportPlain(), 'merge')
    expect(target.list()[0].id).not.toBe(original.id)
  })

  it('rejects a backup whose KDF cost is out of range', async () => {
    const vault = new Vault()
    await vault.create('master-password')
    const file = await vault.exportEncrypted('master-password')
    await expect(vault.decryptBackup({ ...file, kdf: { iterations: 1000000000 } }, 'master-password'))
      .rejects.toThrow('повреждён')
  })

  it('tells a corrupted vault apart from a missing one', async () => {
    expect(await vaultMetaStatus()).toBe('missing')
    localStorage.setItem('zamok_vault_v1', '{not-json')
    expect(await vaultMetaStatus()).toBe('corrupt')
  })

  it('persists a custom icon and keeps it on later edits', async () => {
    const vault = new Vault()
    await vault.create('master-password')
    const created = await vault.upsert({ title: 'Почта', icon: 'mail', iconColor: '#22c55e' })
    await vault.upsert({ ...created, favorite: true })

    const fresh = new Vault()
    await fresh.unlock('master-password')
    expect(fresh.list()[0]).toMatchObject({ icon: 'mail', iconColor: '#22c55e', favorite: true })
  })

  it('refuses to persist or import while the vault is locked', async () => {
    const vault = new Vault()
    await vault.create('master-password')
    const backup = await vault.exportPlain()
    vault.lock()

    await expect(vault.persist()).rejects.toThrow('заблокировано')
    await expect(vault.importPlain(backup, 'merge')).rejects.toThrow('заблокировано')
  })

  it('persists a record photo', async () => {
    const vault = new Vault()
    await vault.create('master-password')
    await vault.upsert({ title: 'Документ', type: 'note', photo: 'data:image/png;base64,AAAA' })

    const fresh = new Vault()
    await fresh.unlock('master-password')
    expect(fresh.list()[0].photo).toBe('data:image/png;base64,AAAA')
  })

  it('persists custom categories and restores defaults when empty', async () => {
    const custom = [{ id: 'banks', label: 'Банки', color: '#123456' }]
    await writeCategories(custom)
    expect(CATEGORIES).toEqual(custom)
    expect(await readCategories()).toEqual(custom)

    localStorage.clear()
    const restored = await readCategories()
    expect(restored.length).toBeGreaterThan(1)
    expect(restored.map((category) => category.id)).toContain('other')
    await writeCategories(DEFAULT_CATEGORIES)
  })

  it('stores settings with defaults', async () => {
    const settings = await readSettings()
    expect(settings.autoLockMs).toBe(DEFAULT_SETTINGS.autoLockMs)
    expect(settings.secureScreen).toBe(true)
    await writeSettings({ ...settings, autoLockMs: 5000, secureScreen: false })
    const updated = await readSettings()
    expect(updated.autoLockMs).toBe(5000)
    expect(updated.secureScreen).toBe(false)
  })
})
