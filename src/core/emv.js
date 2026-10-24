import { brandFromNumber } from './card-brand.js'

const hexByte = (value) => value.toString(16).padStart(2, '0').toUpperCase()

const nibblesToText = (hex) => {
  let text = ''
  for (let index = 0; index < hex.length; index += 2) {
    const code = parseInt(hex.slice(index, index + 2), 16)
    if (!Number.isFinite(code) || code === 0) continue
    text += String.fromCharCode(code)
  }
  return text
}

const textToHex = (value) =>
  Array.from(value).map((char) => char.charCodeAt(0).toString(16).padStart(2, '0')).join('').toUpperCase()

const digitsFromBcd = (hex) => {
  let digits = ''
  for (const char of hex.toUpperCase()) {
    if (char === 'F') break
    if (/[0-9]/.test(char)) digits += char
  }
  return digits
}

export const PPSE_AID = '325041592E5359532E4444463031'

export const FALLBACK_AIDS = [
  'A0000000031010',
  'A0000000041010',
  'A0000006581010',
  'A0000000032010',
  'A0000000042010',
  'A0000000030020',
  'A0000000043060',
  'A0000000030000'
]

export function parseTlv(hex) {
  const value = String(hex || '').replace(/\s+/g, '').toUpperCase()
  const nodes = []
  let index = 0

  while (index + 4 <= value.length) {
    let tag = value.slice(index, index + 2)
    index += 2
    if ((parseInt(tag, 16) & 0x1f) === 0x1f) {
      while (index + 2 <= value.length) {
        const part = value.slice(index, index + 2)
        tag += part
        index += 2
        if (!(parseInt(part, 16) & 0x80)) break
      }
    }
    if (index + 2 > value.length) break
    const first = parseInt(value.slice(index, index + 2), 16)
    index += 2
    let length = first
    if (first === 0x81) {
      if (index + 2 > value.length) break
      length = parseInt(value.slice(index, index + 2), 16)
      index += 2
    } else if (first === 0x82) {
      if (index + 4 > value.length) break
      length = parseInt(value.slice(index, index + 4), 16)
      index += 4
    } else if (first > 0x7f) {
      break
    }
    if (index + length * 2 > value.length) break
    const body = value.slice(index, index + length * 2)
    index += length * 2
    const node = { tag, value: body }
    if ((parseInt(tag.slice(0, 2), 16) & 0x20) !== 0) node.children = parseTlv(body)
    nodes.push(node)
  }

  return nodes
}

export function findTag(nodes, tag) {
  if (!nodes) return null
  const list = Array.isArray(nodes) ? nodes : [nodes]
  for (const node of list) {
    if (node.tag === tag) return node
    const found = findTag(node.children, tag)
    if (found) return found
  }
  return null
}

export function tagValue(nodes, tag, fallback = '') {
  return findTag(nodes, tag)?.value ?? fallback
}

export function parsePdol(hex) {
  const value = String(hex || '').replace(/\s+/g, '').toUpperCase()
  const entries = []
  let index = 0
  while (index + 4 <= value.length) {
    let tag = value.slice(index, index + 2)
    index += 2
    if ((parseInt(tag, 16) & 0x1f) === 0x1f) {
      while (index + 2 <= value.length) {
        const part = value.slice(index, index + 2)
        tag += part
        index += 2
        if (!(parseInt(part, 16) & 0x80)) break
      }
    }
    if (index + 2 > value.length) break
    const length = parseInt(value.slice(index, index + 2), 16)
    index += 2
    entries.push({ tag, length })
  }
  return entries
}

const PDOL_DEFAULTS = {
  '9F66': 'F0000000',
  '9F02': '000000000100',
  '9F03': '000000000000',
  '9F1A': '0643',
  '95': '0000000000',
  '5F2A': '0643',
  '9A': '260101',
  '9C': '00',
  '9F37': '00000000',
  '9F35': '22',
  '9F36': '0000',
  '9F33': 'E0F8C8',
  '9F34': '1F0302',
  '9F40': 'F000F0A001',
  '9F09': '0096',
  '9F41': '00000000',
  '9F7A': '00',
  '9F39': '07',
  '9F1E': '3132333435363738'
}

export function buildPdolData(pdolHex) {
  return parsePdol(pdolHex)
    .map(({ tag, length }) => {
      const fallback = '0'.repeat(length * 2)
      const value = PDOL_DEFAULTS[tag] ?? fallback
      if (value.length === length * 2) return value
      if (value.length > length * 2) return value.slice(0, length * 2)
      return value.padEnd(length * 2, '0')
    })
    .join('')
}

export function buildSelect(aid) {
  const value = String(aid || '').replace(/\s+/g, '').toUpperCase()
  return `00A40400${hexByte(value.length / 2)}${value}00`
}

export function buildGpo(pdolHex = '') {
  const data = buildPdolData(pdolHex)
  const command = `83${hexByte(data.length / 2)}${data}`
  return `80A80000${hexByte(command.length / 2)}${command}00`
}

export function parseAfl(aflHex) {
  const value = String(aflHex || '').replace(/\s+/g, '').toUpperCase()
  const records = []
  for (let index = 0; index + 8 <= value.length; index += 8) {
    const entry = parseInt(value.slice(index, index + 2), 16)
    const sfi = entry >> 3
    const first = parseInt(value.slice(index + 2, index + 4), 16)
    const last = parseInt(value.slice(index + 4, index + 6), 16)
    if (sfi > 0 && last >= first) records.push({ sfi, first, last })
  }
  return records
}

export function parseGpo(hex) {
  const nodes = parseTlv(hex)
  const root = findTag(nodes, '77')
  let aip = ''
  let afl = ''
  if (root) {
    aip = tagValue(root.children, '82')
    afl = tagValue(root.children, '94')
  } else {
    const template = findTag(nodes, '80')
    if (template) {
      aip = template.value.slice(0, 4)
      afl = template.value.slice(4)
    }
  }
  const track2 = findTag(nodes, '57')?.value ?? ''
  return {
    aip,
    afl,
    records: parseAfl(afl),
    pan: findTag(nodes, '5A')?.value ?? '',
    track2,
    cryptogram: tagValue(nodes, '9F26')
  }
}

export function parseExpiry(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length < 4) return ''
  return `${digits.slice(2, 4)}/${digits.slice(0, 2)}`
}

export function parseTrack2(hex) {
  const value = String(hex || '').replace(/\s+/g, '').toUpperCase()
  const ordered = []
  for (const char of value) {
    if (char === 'F') break
    ordered.push(char === 'D' ? 'D' : char)
  }
  const joined = ordered.join('')
  const split = joined.indexOf('D')
  if (split === -1) return { pan: digitsFromBcd(joined), expiry: '' }
  return {
    pan: digitsFromBcd(joined.slice(0, split)),
    expiry: parseExpiry(digitsFromBcd(joined.slice(split + 1, split + 5)))
  }
}

export function parseTrack1(hex) {
  const text = nibblesToText(hex).replace(/\0/g, '').trim()
  const parts = text.split('^')
  if (parts.length < 2) return { pan: '', holder: '' }
  return {
    pan: parts[0].replace(/^B/, '').replace(/\D/g, ''),
    holder: parts[1].replace(/\//g, ' ').trim()
  }
}

export function parseRecord(hex) {
  const nodes = parseTlv(hex)
  const root = findTag(nodes, '70') ?? nodes
  const track2Node = findTag(root, '57')
  const track2 = track2Node ? parseTrack2(track2Node.value) : { pan: '', expiry: '' }
  const track1Node = findTag(root, '56')
  const track1 = track1Node ? parseTrack1(track1Node.value) : { pan: '', holder: '' }
  const panHex = tagValue(root, '5A')
  const holderHex = tagValue(root, '5F20')
  return {
    pan: panHex ? digitsFromBcd(panHex) : track2.pan || track1.pan,
    expiry: parseExpiry(tagValue(root, '5F24')) || track2.expiry,
    holder: (holderHex ? nibblesToText(holderHex).trim() : '') || track1.holder,
    country: tagValue(root, '5F28') || tagValue(root, '5F2D'),
    track2: track2Node?.value ?? ''
  }
}

export function parsePpse(hex) {
  const root = findTag(parseTlv(hex), '6F')
  if (!root) return []
  const applications = []
  const walk = (nodes) => {
    for (const node of nodes ?? []) {
      if (node.tag === '61') {
        const aid = tagValue(node.children, '4F')
        if (aid) {
          applications.push({
            aid,
            label: nibblesToText(tagValue(node.children, '50')),
            priority: tagValue(node.children, '87')
          })
        }
      }
      walk(node.children)
    }
  }
  walk(root.children)
  if (applications.length) return applications
  const aid = tagValue(root.children, '4F')
  return aid ? [{ aid, label: nibblesToText(tagValue(root.children, '50')) }] : []
}

export function parseSelect(hex) {
  const root = findTag(parseTlv(hex), '6F') ?? parseTlv(hex)
  return {
    label: nibblesToText(tagValue(root.children ?? root, '50')),
    pdol: tagValue(root.children ?? root, '9F38'),
    aid: tagValue(root.children ?? root, '84')
  }
}

export function buildReadRecord(sfi, record) {
  return `00B2${hexByte(record)}${hexByte((sfi << 3) | 4)}00`
}

export function buildGetPan(cryptogram = '') {
  const value = String(cryptogram || '').replace(/\s+/g, '').toUpperCase()
  const data = `000000${hexByte(value.length / 2)}8002${value}`
  return `80A80000${hexByte(data.length / 2)}${data}00`
}

export function detectBrand(aid = '', pan = '') {
  const application = String(aid).toUpperCase()
  if (application.startsWith('A000000003')) return 'VISA'
  if (application.startsWith('A000000004')) return 'Mastercard'
  if (application.startsWith('A000000658')) return 'МИР'
  if (application.startsWith('A000000025')) return 'Amex'
  if (application.startsWith('A000000065')) return 'JCB'
  if (application.startsWith('A000000333')) return 'UnionPay'
  if (application.startsWith('A000000152')) return 'Discover'
  return brandFromNumber(pan)
}

export { hexByte, nibblesToText, textToHex }
