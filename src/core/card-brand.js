export const CARD_BRANDS = ['МИР', 'VISA', 'Mastercard', 'Amex', 'JCB', 'UnionPay', 'Discover']

const TITLE_PATTERNS = [
  [/(?<![\p{L}])мир(?![\p{L}])/iu, 'МИР'],
  [/visa/iu, 'VISA'],
  [/мастеркарт|мастеркард|mastercard/iu, 'Mastercard'],
  [/(?<![\p{L}])mc(?![\p{L}])/iu, 'Mastercard'],
  [/amex|american\s+express/iu, 'Amex'],
  [/(?<![\p{L}])jcb(?![\p{L}])/iu, 'JCB'],
  [/union\s?pay/iu, 'UnionPay'],
  [/discover/iu, 'Discover']
]

export function normalizeBrand(value) {
  const brand = String(value || '').trim()
  if (!brand || brand === 'КАРТА') return ''
  return CARD_BRANDS.find((known) => known.toLowerCase() === brand.toLowerCase()) || ''
}

export function brandFromNumber(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (/^220[0-4]/.test(digits)) return 'МИР'
  if (/^4/.test(digits)) return 'VISA'
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'Mastercard'
  if (/^3[47]/.test(digits)) return 'Amex'
  if (/^35/.test(digits)) return 'JCB'
  if (/^62/.test(digits)) return 'UnionPay'
  if (/^6/.test(digits)) return 'Discover'
  return 'КАРТА'
}

export function brandFromTitle(title) {
  const text = String(title || '')
  if (!text.trim()) return ''
  for (const [pattern, brand] of TITLE_PATTERNS) {
    if (pattern.test(text)) return brand
  }
  return ''
}

// The number decides the network, but plenty of cards carry a BIN nobody
// knows (mirrored test numbers, cards typed by hand). The network read over
// NFC wins, then the number, then the name of the card.
export function detectCardBrand(value, { title = '', brand = '' } = {}) {
  const explicit = normalizeBrand(brand)
  if (explicit) return explicit
  const fromNumber = brandFromNumber(value)
  if (fromNumber !== 'КАРТА') return fromNumber
  return brandFromTitle(title) || fromNumber
}
