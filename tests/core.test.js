import { describe, expect, it } from 'vitest'
import { decryptJson, deriveKey, encryptJson, fromBase64, randomSalt, toBase64, timingSafeEqual } from '../src/core/crypto.js'
import { generatePassword, generatePassphrase, estimateEntropy, looksWeak } from '../src/core/generator.js'
import { base32Decode, base32Encode, parseOtpUri } from '../src/core/totp.js'
import { generateTotp } from '../src/core/otp.js'
import { pluralRecords, formatIsoDate } from '../src/core/format.js'
import { matchesQuery } from '../src/core/search.js'

describe('format', () => {
  it('pluralizes the record count in Russian', () => {
    expect(pluralRecords(1)).toBe('1 запись')
    expect(pluralRecords(2)).toBe('2 записи')
    expect(pluralRecords(4)).toBe('4 записи')
    expect(pluralRecords(5)).toBe('5 записей')
    expect(pluralRecords(11)).toBe('11 записей')
    expect(pluralRecords(21)).toBe('21 запись')
    expect(pluralRecords(112)).toBe('112 записей')
    expect(pluralRecords(0)).toBe('0 записей')
  })
})

describe('crypto', () => {
  it('encrypts and decrypts json round trip', async () => {
    const salt = randomSalt()
    const key = await deriveKey('master-password', salt)
    const payload = { iv: '', data: '' }
    const encrypted = await encryptJson(key, { hello: 'мир', n: 42 })
    payload.iv = encrypted.iv
    payload.data = encrypted.data
    const decrypted = await decryptJson(key, payload)
    expect(decrypted).toEqual({ hello: 'мир', n: 42 })
  })

  it('produces different ciphertext for same input', async () => {
    const salt = randomSalt()
    const key = await deriveKey('master-password', salt)
    const a = await encryptJson(key, { v: 1 })
    const b = await encryptJson(key, { v: 1 })
    expect(a.data).not.toBe(b.data)
    expect(a.iv).not.toBe(b.iv)
  })

  it('fails to decrypt with wrong key', async () => {
    const salt = randomSalt()
    const key = await deriveKey('master-password', salt)
    const other = await deriveKey('wrong-password', salt)
    const encrypted = await encryptJson(key, { secret: true })
    await expect(decryptJson(other, encrypted)).rejects.toBeTruthy()
  })

  it('detects tampered ciphertext', async () => {
    const salt = randomSalt()
    const key = await deriveKey('master-password', salt)
    const encrypted = await encryptJson(key, { secret: true })
    const bytes = fromBase64(encrypted.data)
    bytes[0] ^= 0xff
    await expect(decryptJson(key, { iv: encrypted.iv, data: toBase64(bytes) })).rejects.toBeTruthy()
  })

  it('base64 encodes and decodes bytes', () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255])
    expect(Array.from(fromBase64(toBase64(bytes)))).toEqual(Array.from(bytes))
  })

  it('compares strings safely', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true)
    expect(timingSafeEqual('abc', 'abd')).toBe(false)
    expect(timingSafeEqual('abc', 'ab')).toBe(false)
  })
})

describe('generator', () => {
  it('generates password of requested length', () => {
    const value = generatePassword({ length: 24, lower: true, upper: true, digits: true, symbols: true })
    expect(value).toHaveLength(24)
  })

  it('respects character set flags', () => {
    const value = generatePassword({ length: 12, lower: true, upper: false, digits: true, symbols: false })
    expect(value).toMatch(/^[a-z0-9]+$/)
  })

  it('generates passphrase with words', () => {
    const value = generatePassphrase(4, '-')
    expect(value.split('-')).toHaveLength(4)
  })

  it('estimates entropy', () => {
    expect(estimateEntropy('')).toBe(0)
    expect(estimateEntropy('abcdefgh')).toBeGreaterThan(20)
  })

  it('detects weak passwords', () => {
    expect(looksWeak('password')).toBe(true)
    expect(looksWeak('aaaaaaaa')).toBe(true)
    expect(looksWeak('vR7#kQ2!zPm9$')).toBe(false)
  })
})

describe('totp', () => {
  it('encodes and decodes base32', () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5])
    expect(Array.from(base32Decode(base32Encode(bytes)))).toEqual(Array.from(bytes))
  })

  it('parses otpauth uri', () => {
    const parsed = parseOtpUri('otpauth://totp/Example:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example&digits=6&period=30')
    expect(parsed.secret).toBe('JBSWY3DPEHPK3PXP')
    expect(parsed.issuer).toBe('Example')
    expect(parsed.digits).toBe(6)
    expect(parsed.period).toBe(30)
  })

  it('returns null for invalid uri', () => {
    expect(parseOtpUri('https://example.com')).toBeNull()
  })

  it('generates stable rfc6238 code', async () => {
    const result = await generateTotp('JBSWY3DPEHPK3PXP', 6, 30, 'SHA1', 59000)
    expect(result.code).toHaveLength(6)
    expect(result.code).toMatch(/^\d+$/)
  })
})

describe('search', () => {
  const card = {
    title: 'Кактус',
    cardNumber: '5155 5555 5555 5555',
    cardHolder: 'ANDREI CHAIKO',
    cardExpiry: '12/23',
    category: 'other'
  }
  const login = { title: 'Яндекс Почта', username: 'user@ya.ru', url: 'mail.yandex.ru', notes: '' }

  it('matches title, login and site case-insensitively', () => {
    expect(matchesQuery(login, 'яндекс')).toBe(true)
    expect(matchesQuery(login, 'USER@YA')).toBe(true)
    expect(matchesQuery(login, 'yandex.ru')).toBe(true)
    expect(matchesQuery(login, 'zzz')).toBe(false)
  })

  it('matches card number digits with or without spaces', () => {
    expect(matchesQuery(card, '5555')).toBe(true)
    expect(matchesQuery(card, '5555 5555')).toBe(true)
    expect(matchesQuery(card, '1111')).toBe(false)
  })

  it('matches card holder and expiry', () => {
    expect(matchesQuery(card, 'chaiko')).toBe(true)
    expect(matchesQuery(card, '12/23')).toBe(true)
  })

  it('treats an empty query as a match', () => {
    expect(matchesQuery(login, '   ')).toBe(true)
  })

  it('matches a discount card by shop and barcode digits', () => {
    const loyalty = { title: 'Пятёрочка', type: 'loyalty', loyaltyBarcode: '4006381333931' }
    expect(matchesQuery(loyalty, 'пятёрочка')).toBe(true)
    expect(matchesQuery(loyalty, '33931')).toBe(true)
    expect(matchesQuery(loyalty, '4006 3813')).toBe(true)
    expect(matchesQuery(loyalty, '7777')).toBe(false)
  })
})

describe('formatIsoDate', () => {
  it('formats iso dates as dd.mm.yyyy', () => {
    expect(formatIsoDate('2020-05-01')).toBe('01.05.2020')
    expect(formatIsoDate('')).toBe('')
    expect(formatIsoDate('01.05.2020')).toBe('01.05.2020')
  })
})
