import { randomBytes } from './crypto.js'

const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const DIGITS = '0123456789'
const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.?/\\|~<>'
const SIMILAR = 'Il1O0oB8S5Z2G6'

export const PRESETS = {
  pin: { length: 6, lower: false, upper: false, digits: true, symbols: false },
  simple: { length: 12, lower: true, upper: true, digits: true, symbols: false },
  strong: { length: 16, lower: true, upper: true, digits: true, symbols: true },
  pincode: { length: 8, lower: false, upper: false, digits: true, symbols: false }
}

function poolFor(options) {
  let pool = ''
  if (options.lower) pool += LOWER
  if (options.upper) pool += UPPER
  if (options.digits) pool += DIGITS
  if (options.symbols) pool += SYMBOLS
  return pool
}

function pick(pool, excludeSimilar) {
  const source = excludeSimilar ? pool.split('').filter((ch) => !SIMILAR.includes(ch)) : pool.split('')
  if (!source.length) return ''
  return source[randomBytes(1)[0] % source.length]
}

export function generatePassword(options = {}) {
  const opts = {
    length: options.length ?? 16,
    lower: options.lower ?? true,
    upper: options.upper ?? true,
    digits: options.digits ?? true,
    symbols: options.symbols ?? true,
    excludeSimilar: options.excludeSimilar ?? false
  }
  const pool = poolFor(opts)
  if (!pool) return ''
  const chars = []
  if (opts.lower) chars.push(pick(LOWER, opts.excludeSimilar))
  if (opts.upper) chars.push(pick(UPPER, opts.excludeSimilar))
  if (opts.digits) chars.push(pick(DIGITS, opts.excludeSimilar))
  if (opts.symbols) chars.push(pick(SYMBOLS, opts.excludeSimilar))
  while (chars.length < opts.length) chars.push(pick(pool, opts.excludeSimilar))
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomBytes(1)[0] % (i + 1)
    const tmp = chars[i]
    chars[i] = chars[j]
    chars[j] = tmp
  }
  return chars.join('')
}

export function generatePin(length = 6) {
  return generatePassword(PRESETS.pincode && length ? { ...PRESETS.pincode, length } : PRESETS.pincode)
}

export const WORDS = [
  'atlas', 'birch', 'cobalt', 'delta', 'ember', 'fable', 'gamma', 'harbor', 'indigo', 'juniper',
  'krypton', 'lumen', 'marble', 'nimbus', 'onyx', 'pixel', 'quartz', 'raven', 'sable', 'tundra',
  'umbra', 'vertex', 'willow', 'xenon', 'yonder', 'zephyr', 'aurora', 'basalt', 'coral', 'dune',
  'echo', 'fjord', 'glacier', 'hollow', 'ivory', 'jade', 'kelp', 'lotus', 'moss', 'neon',
  'orbit', 'pearl', 'quill', 'reef', 'silt', 'terra', 'ultra', 'vivid', 'wheat', 'xylem'
]

export function generatePassphrase(words = 4, separator = '-', capitalize = false) {
  const list = []
  for (let i = 0; i < words; i += 1) {
    const word = WORDS[randomBytes(1)[0] % WORDS.length]
    list.push(capitalize ? word[0].toUpperCase() + word.slice(1) : word)
  }
  return list.join(separator)
}

export function estimateEntropy(value) {
  if (!value) return 0
  let pool = 0
  if (/[a-z]/.test(value)) pool += 26
  if (/[A-Z]/.test(value)) pool += 26
  if (/[0-9]/.test(value)) pool += 10
  if (/[^a-zA-Z0-9]/.test(value)) pool += 33
  return Math.round(value.length * Math.log2(pool || 1))
}

export function strengthOf(value) {
  const entropy = estimateEntropy(value)
  if (!value) return { score: 0, label: 'Пусто', entropy, color: 'bg-ink-700' }
  if (entropy < 28) return { score: 1, label: 'Слабый', entropy, color: 'bg-danger-500' }
  if (entropy < 40) return { score: 2, label: 'Средний', entropy, color: 'bg-warn-500' }
  if (entropy < 60) return { score: 3, label: 'Хороший', entropy, color: 'bg-accent-500' }
  if (entropy < 80) return { score: 4, label: 'Надёжный', entropy, color: 'bg-brand-400' }
  return { score: 5, label: 'Отличный', entropy, color: 'bg-ok-500' }
}

const COMMON = [
  'password', '123456', 'qwerty', 'admin', 'letmein', 'welcome', 'iloveyou', 'monkey',
  'dragon', '111111', 'abc123', 'master', 'sunshine', 'princess', 'football', 'secret'
]

export function looksWeak(value) {
  const lower = value.toLowerCase()
  return COMMON.some((word) => lower.includes(word)) || /^(.)\1+$/.test(value)
}
