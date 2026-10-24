// Barcode generation for loyalty cards.
//
// Everything here is pure data: the module returns the bar/space pattern
// (1 = bar, 0 = space) and the UI turns it into an SVG. Scanners need exact
// module sequences, so the tables below are the published encodings:
//   - EAN-13 / EAN-8 for numeric codes (what loyalty cards print),
//   - Code 128 for everything else (letters, shorter codes).

const EAN13_L = [
  '0001101', '0011001', '0010011', '0111101', '0100011',
  '0110001', '0101111', '0111011', '0110111', '0001011'
]
const EAN13_G = [
  '0100111', '0110011', '0011011', '0100001', '0011101',
  '0111001', '0000101', '0010001', '0001001', '0010111'
]
const EAN13_R = [
  '1110010', '1100110', '1101100', '1000010', '1011100',
  '1001110', '1010000', '1000100', '1001000', '1110100'
]
const EAN13_PARITY = [
  'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
  'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'
]

// Code 128 element widths (bar, space, bar, space, bar, space) per value.
export const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312',
  '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131',
  '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112',
  '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412',
  '211214', '211232', '2331112'
]

const START_B = 104
const STOP = 106

const digitsOf = (value) => String(value ?? '').replace(/\D/g, '')

const bitsToModules = (bits) => bits.split('').map((bit) => (bit === '1' ? 1 : 0))

export function ean13CheckDigit(first12) {
  const digits = digitsOf(first12).slice(0, 12)
  if (digits.length !== 12) return null
  let sum = 0
  for (let index = 0; index < 12; index += 1) {
    const weight = index % 2 === 0 ? 1 : 3
    sum += Number(digits[index]) * weight
  }
  return (10 - (sum % 10)) % 10
}

export function ean8CheckDigit(first7) {
  const digits = digitsOf(first7).slice(0, 7)
  if (digits.length !== 7) return null
  let sum = 0
  for (let index = 0; index < 7; index += 1) {
    const weight = index % 2 === 0 ? 3 : 1
    sum += Number(digits[index]) * weight
  }
  return (10 - (sum % 10)) % 10
}

export function isValidEan13(code) {
  const digits = digitsOf(code)
  if (digits.length !== 13) return false
  return ean13CheckDigit(digits.slice(0, 12)) === Number(digits[12])
}

export function isValidEan8(code) {
  const digits = digitsOf(code)
  if (digits.length !== 8) return false
  return ean8CheckDigit(digits.slice(0, 7)) === Number(digits[7])
}

function ean13Modules(code) {
  const digits = digitsOf(code)
  const parity = EAN13_PARITY[Number(digits[0])]
  let bits = '101'
  for (let index = 1; index <= 6; index += 1) {
    const digit = Number(digits[index])
    bits += parity[index - 1] === 'L' ? EAN13_L[digit] : EAN13_G[digit]
  }
  bits += '01010'
  for (let index = 7; index <= 12; index += 1) {
    bits += EAN13_R[Number(digits[index])]
  }
  bits += '101'
  return bitsToModules(bits)
}

function ean8Modules(code) {
  const digits = digitsOf(code)
  let bits = '101'
  for (let index = 0; index < 4; index += 1) {
    bits += EAN13_L[Number(digits[index])]
  }
  bits += '0000'
  for (let index = 4; index < 8; index += 1) {
    bits += EAN13_R[Number(digits[index])]
  }
  bits += '101'
  return bitsToModules(bits)
}

function code128Modules(text) {
  const values = [START_B]
  for (const character of text) {
    const value = character.charCodeAt(0) - 32
    if (value < 0 || value > 94) return null
    values.push(value)
  }
  let checksum = START_B
  for (let index = 1; index < values.length; index += 1) {
    checksum += values[index] * index
  }
  values.push(checksum % 103)
  values.push(STOP)

  const modules = []
  for (const value of values) {
    const widths = CODE128_PATTERNS[value]
    for (let element = 0; element < widths.length; element += 1) {
      const size = Number(widths[element])
      const isBar = element % 2 === 0
      for (let repeat = 0; repeat < size; repeat += 1) {
        modules.push(isBar ? 1 : 0)
      }
    }
  }
  return modules
}

// Returns the pattern for a stored barcode value, or null when there is
// nothing to draw. `warning` explains a code that will render but is not
// standards-compliant (for example a wrong EAN check digit).
export function barcodeFor(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return null

  const digits = digitsOf(raw)
  if (digits.length === 13 && digits === raw) {
    return {
      type: 'ean13',
      text: raw,
      modules: ean13Modules(raw),
      valid: isValidEan13(raw),
      warning: isValidEan13(raw) ? '' : 'Контрольная цифра не совпадает — на кассе может не считаться'
    }
  }

  if (digits.length === 8 && digits === raw) {
    return {
      type: 'ean8',
      text: raw,
      modules: ean8Modules(raw),
      valid: isValidEan8(raw),
      warning: isValidEan8(raw) ? '' : 'Контрольная цифра не совпадает — на кассе может не считаться'
    }
  }

  const modules = code128Modules(raw)
  if (!modules) return null
  return { type: 'code128', text: raw, modules, valid: true, warning: '' }
}
