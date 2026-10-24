const subtle = globalThis.crypto?.subtle

if (!subtle) {
  console.error('Web Crypto API is not available in this context')
}

export const PBKDF2_ITERATIONS = 600000
const KEY_LENGTH = 256
const SALT_BYTES = 16
const IV_BYTES = 12

const te = new TextEncoder()
const td = new TextDecoder()

export function toBase64(bytes) {
  let bin = ''
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  for (let i = 0; i < arr.length; i += 1) bin += String.fromCharCode(arr[i])
  return btoa(bin)
}

export function fromBase64(value) {
  const bin = atob(value)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i)
  return arr
}

export function toHex(bytes) {
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function randomBytes(length) {
  const arr = new Uint8Array(length)
  globalThis.crypto.getRandomValues(arr)
  return arr
}

export function randomSalt() {
  return toBase64(randomBytes(SALT_BYTES))
}

export async function deriveKey(masterPassword, saltB64, iterations = PBKDF2_ITERATIONS) {
  const base = await subtle.importKey('raw', te.encode(masterPassword), 'PBKDF2', false, ['deriveKey'])
  return subtle.deriveKey(
    { name: 'PBKDF2', salt: fromBase64(saltB64), iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function encryptJson(key, data) {
  const iv = randomBytes(IV_BYTES)
  const plain = te.encode(JSON.stringify(data))
  const cipher = await subtle.encrypt({ name: 'AES-GCM', iv }, key, plain)
  return { iv: toBase64(iv), data: toBase64(cipher) }
}

export async function decryptJson(key, payload) {
  const plain = await subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(payload.iv) },
    key,
    fromBase64(payload.data)
  )
  return JSON.parse(td.decode(plain))
}

export async function encryptString(key, text) {
  const iv = randomBytes(IV_BYTES)
  const cipher = await subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(text))
  return `${toBase64(iv)}.${toBase64(cipher)}`
}

export async function decryptString(key, text) {
  const [ivB64, dataB64] = text.split('.')
  const plain = await subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(ivB64) }, key, fromBase64(dataB64))
  return td.decode(plain)
}

export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export function isWebCryptoAvailable() {
  return Boolean(subtle)
}

export async function hmac(algorithm, keyBytes, dataBytes) {
  const key = await subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: algorithm },
    false,
    ['sign']
  )
  return new Uint8Array(await subtle.sign('HMAC', key, dataBytes))
}

export function counterToBytes(counter) {
  const arr = new Uint8Array(8)
  let c = counter
  for (let i = 7; i >= 0; i -= 1) {
    arr[i] = c & 0xff
    c = Math.floor(c / 256)
  }
  return arr
}
