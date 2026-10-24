import { base32Decode, formatOtpCode, otpRemaining } from './totp.js'
import { counterToBytes, hmac } from './crypto.js'

const HASHES = { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA512: 'SHA-512' }

export async function generateTotp(secret, digits = 6, period = 30, algorithm = 'SHA1', timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 1000 / period)
  const keyBytes = base32Decode(secret)
  const hash = HASHES[algorithm] || 'SHA-1'
  const digest = await hmac(hash, keyBytes, counterToBytes(counter))
  const offset = digest[digest.length - 1] & 0x0f
  const bin =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff)
  const mod = 10 ** digits
  const code = (bin % mod).toString().padStart(digits, '0')
  return { code: formatOtpCode(code, digits), remaining: otpRemaining(period, timestamp), period }
}
