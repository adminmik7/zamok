const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(bytes) {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  while (out.length % 8 !== 0) out += '='
  return out
}

export function base32Decode(input) {
  const clean = input.toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '')
  let bits = 0
  let value = 0
  const out = []
  for (const ch of clean) {
    const idx = B32.indexOf(ch)
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return new Uint8Array(out)
}

export function parseOtpUri(uri) {
  let url
  try {
    url = new URL(uri.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'otpauth:') return null
  if (!url.host.toUpperCase().startsWith('TOTP')) return null
  const secret = url.searchParams.get('secret') || ''
  if (!secret) return null
  const digits = Number(url.searchParams.get('digits') || 6)
  const period = Number(url.searchParams.get('period') || 30)
  const algorithm = (url.searchParams.get('algorithm') || 'SHA1').toUpperCase()
  const label = decodeURIComponent(url.pathname.replace(/^\//, ''))
  const [labelIssuer, labelAccount] = label.includes(':') ? label.split(':') : [label, '']
  return {
    secret: secret.replace(/\s/g, ''),
    issuer: url.searchParams.get('issuer') || labelIssuer || '',
    account: labelAccount || labelIssuer || '',
    digits: [6, 8].includes(digits) ? digits : 6,
    period: [15, 30, 60].includes(period) ? period : 30,
    algorithm: ['SHA1', 'SHA256', 'SHA512'].includes(algorithm) ? algorithm : 'SHA1'
  }
}

export function formatOtpCode(code, digits) {
  return String(code).padStart(digits, '0')
}

export function otpRemaining(period, now = Date.now()) {
  return period - (Math.floor(now / 1000) % period)
}

export function formatCountdown(seconds) {
  return String(seconds).padStart(2, '0')
}
