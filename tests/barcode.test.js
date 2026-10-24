import { describe, expect, it } from 'vitest'

import {
  CODE128_PATTERNS,
  barcodeFor,
  ean13CheckDigit,
  ean8CheckDigit,
  isValidEan13,
  isValidEan8
} from '../src/core/barcode.js'

describe('check digits', () => {
  it('computes the EAN-13 check digit', () => {
    // The reference example from the EAN-13 specification.
    expect(ean13CheckDigit('400638133393')).toBe(1)
    expect(isValidEan13('4006381333931')).toBe(true)
    expect(isValidEan13('4006381333932')).toBe(false)
  })

  it('computes the EAN-8 check digit', () => {
    expect(ean8CheckDigit('9638507')).toBe(4)
    expect(isValidEan8('96385074')).toBe(true)
    expect(isValidEan8('96385075')).toBe(false)
  })
})

describe('the Code 128 table', () => {
  it('holds 107 unique patterns of 11 modules', () => {
    expect(CODE128_PATTERNS).toHaveLength(107)
    expect(new Set(CODE128_PATTERNS).size).toBe(107)

    CODE128_PATTERNS.forEach((pattern, index) => {
      const widths = pattern.split('').map(Number)
      const total = widths.reduce((sum, width) => sum + width, 0)
      if (index === 106) {
        expect(widths).toHaveLength(7)
        expect(total).toBe(13)
      } else {
        expect(widths).toHaveLength(6)
        expect(total).toBe(11)
      }
      widths.forEach((width) => expect(width).toBeGreaterThanOrEqual(1))
      widths.forEach((width) => expect(width).toBeLessThanOrEqual(4))
    })
  })
})

describe('the EAN-13 encoding', () => {
  const L = [
    '0001101', '0011001', '0010011', '0111101', '0100011',
    '0110001', '0101111', '0111011', '0110111', '0001011'
  ]
  const G = [
    '0100111', '0110011', '0011011', '0100001', '0011101',
    '0111001', '0000101', '0010001', '0001001', '0010111'
  ]
  const PARITY = [
    'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
    'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'
  ]

  // Decodes the generated pattern back into digits: the left half may use the
  // L or the G table, the first digit is encoded by the parity of that choice.
  const decode = (modules) => {
    const bits = modules.map((module) => (module ? '1' : '0')).join('')
    expect(bits.slice(0, 3)).toBe('101')
    expect(bits.slice(45, 50)).toBe('01010')
    expect(bits.slice(92, 95)).toBe('101')

    const parity = []
    const left = []
    for (let index = 0; index < 6; index += 1) {
      const chunk = bits.slice(3 + index * 7, 10 + index * 7)
      const inL = L.indexOf(chunk)
      const inG = G.indexOf(chunk)
      if (inL >= 0) {
        parity.push('L')
        left.push(inL)
      } else {
        parity.push('G')
        left.push(inG)
      }
    }
    const first = PARITY.indexOf(parity.join(''))
    expect(first).toBeGreaterThanOrEqual(0)

    const right = []
    for (let index = 0; index < 6; index += 1) {
      const chunk = bits.slice(50 + index * 7, 57 + index * 7)
      const flipped = chunk.split('').map((bit) => (bit === '1' ? '0' : '1')).join('')
      right.push(L.indexOf(flipped))
    }

    return `${first}${left.join('')}${right.join('')}`
  }

  it('round-trips the digits of a code', () => {
    for (const code of ['4006381333931', '5901234123457', '9780201379624', '2000000000008']) {
      const barcode = barcodeFor(code)
      expect(barcode.type).toBe('ean13')
      expect(decode(barcode.modules)).toBe(code)
    }
  })
})

describe('the Code 128 encoding', () => {
  // Reads the pattern back: every symbol is 11 modules wide (the stop symbol
  // is 13), so the widths can be looked up in the table again.
  const decode = (modules) => {
    const symbols = []
    let index = 0
    while (index < modules.length) {
      const isStop = modules.length - index === 13
      const size = isStop ? 13 : 11
      const widths = []
      let run = 0
      let previous = null
      for (const module of modules.slice(index, index + size)) {
        if (module === previous) {
          run += 1
        } else {
          if (previous !== null) widths.push(run)
          previous = module
          run = 1
        }
      }
      widths.push(run)
      symbols.push(widths.map((width) => String(width)).join(''))
      index += size
    }

    const values = symbols.map((widths) => CODE128_PATTERNS.indexOf(widths))
    expect(values.every((value) => value >= 0)).toBe(true)
    expect(values[0]).toBe(104)
    expect(values[values.length - 1]).toBe(106)

    const data = values.slice(1, -2)
    const checksum = values[values.length - 2]
    let expected = 104
    data.forEach((value, position) => {
      expected += value * (position + 1)
    })
    expect(checksum).toBe(expected % 103)

    return data.map((value) => String.fromCharCode(value + 32)).join('')
  }

  it('round-trips the text of a code', () => {
    for (const text of ['12', 'ABC-123', 'LOYALTY CARD 42', 'a1B2']) {
      const barcode = barcodeFor(text)
      expect(barcode.type).toBe('code128')
      expect(decode(barcode.modules)).toBe(text)
    }
  })
})

describe('barcodeFor', () => {  it('returns null for an empty value', () => {
    expect(barcodeFor('')).toBeNull()
    expect(barcodeFor('   ')).toBeNull()
    expect(barcodeFor(undefined)).toBeNull()
  })

  it('encodes a 13 digit code as EAN-13', () => {
    const barcode = barcodeFor('4006381333931')
    expect(barcode.type).toBe('ean13')
    expect(barcode.modules).toHaveLength(95)
    expect(barcode.valid).toBe(true)
    expect(barcode.warning).toBe('')
  })

  it('encodes an 8 digit code as EAN-8', () => {
    const barcode = barcodeFor('96385074')
    expect(barcode.type).toBe('ean8')
    expect(barcode.modules).toHaveLength(66)
    expect(barcode.valid).toBe(true)
  })

  it('warns when the EAN check digit does not match but still draws the code', () => {
    const barcode = barcodeFor('4006381333932')
    expect(barcode.valid).toBe(false)
    expect(barcode.warning).toContain('Контрольная цифра')
    expect(barcode.modules).toHaveLength(95)
  })

  it('falls back to Code 128 for other values', () => {
    const barcode = barcodeFor('ABC-123')
    expect(barcode.type).toBe('code128')
    // start + seven characters + checksum + stop (13 modules)
    expect(barcode.modules).toHaveLength(11 * 9 + 13)
  })

  it('builds a valid Code 128 pattern with a quiet zone free of stray bars', () => {
    const barcode = barcodeFor('12')
    expect(barcode.type).toBe('code128')
    // start, two digits, checksum, stop
    expect(barcode.modules).toHaveLength(11 * 4 + 13)
    expect(barcode.modules[0]).toBe(1)
  })
})
