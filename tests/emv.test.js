import { describe, it, expect } from 'vitest'
import {
  PPSE_AID,
  buildGetPan,
  buildGpo,
  buildReadRecord,
  buildSelect,
  detectBrand,
  parseAfl,
  parseExpiry,
  parseGpo,
  parsePpse,
  parseRecord,
  parseSelect,
  parseTlv,
  parseTrack2
} from '../src/core/emv.js'
import { runEmvFlow } from '../src/core/emv-flow.js'

const PPSE = '6F20840E325041592E5359532E4444463031A50EBF0C0B61094F07A0000000031010'
const SELECT_VISA = '6F098407A0000000031010'
const GPO = '770A8202198094040C010200'

const hex = (text) => Array.from(text).map((char) => char.charCodeAt(0).toString(16).padStart(2, '0')).join('').toUpperCase()
const tlv = (tag, value) => tag + (value.length / 2).toString(16).toUpperCase().padStart(2, '0') + value
const PAN = '4111111111111111'
const RECORD_1 = tlv('70', tlv('5F20', hex('ANDR')) + tlv('5F24', '260131') + tlv('5A', PAN))
const RECORD_EXPIRY_ONLY = tlv('70', tlv('5F24', '260131'))
const RECORD_PAN_ONLY = tlv('70', tlv('5A', PAN) + tlv('5F20', hex('ANDR')))

const fakeTransport = (table) => ({
  calls: [],
  async transceive(apdu) {
    this.calls.push(apdu)
    const answer = table[apdu]
    if (!answer) throw Object.assign(new Error('no answer'), { code: 'tag-lost' })
    return answer
  }
})

describe('EMV TLV', () => {
  it('parses nested and multi-byte length tags', () => {
    const nodes = parseTlv('700E5A08411111111111111182021980')
    expect(nodes).toHaveLength(1)
    expect(nodes[0].tag).toBe('70')
    expect(nodes[0].children.map((node) => node.tag)).toEqual(['5A', '82'])
  })

  it('reads PPSE applications', () => {
    const apps = parsePpse(PPSE)
    expect(apps).toHaveLength(1)
    expect(apps[0].aid).toBe('A0000000031010')
  })

  it('reads PDOL from SELECT response', () => {
    const description = parseSelect('6F178407A0000000031010A50C9F38099F66049F02069F3704')
    expect(description.pdol).toBe('9F66049F02069F3704')
    expect(description.label).toBe('')
  })
})

describe('EMV commands', () => {
  it('builds SELECT with the aid length', () => {
    expect(buildSelect(PPSE_AID)).toBe(`00A404000E${PPSE_AID}00`)
    expect(buildReadRecord(1, 1)).toBe('00B2010C00')
    expect(buildGetPan('')).toBe('80A800000600000000800200')
  })

  it('pads PDOL values to the requested length', () => {
    const gpo = buildGpo('9F66049F02069F3704')
    expect(gpo).toBe(`80A8000010830EF00000000000000001000000000000`)
  })
})

describe('EMV records', () => {
  it('reads holder, expiry and pan from one record', () => {
    const record = parseRecord(RECORD_1)
    expect(record.pan).toBe('4111111111111111')
    expect(record.expiry).toBe('01/26')
    expect(record.holder).toBe('ANDR')
  })

  it('parses track2 with separator', () => {
    const track = parseTrack2('4111111111111111D26012011234567890F')
    expect(track.pan).toBe('4111111111111111')
    expect(track.expiry).toBe('01/26')
  })

  it('reads the holder from track 1 when tag 5F20 is absent', () => {
    const track1 = `B${PAN}^IVANOV/IVAN^2601101123456789`
    const record = parseRecord(tlv('70', tlv('56', hex(track1)) + tlv('5F24', '260131')))
    expect(record.pan).toBe(PAN)
    expect(record.holder).toBe('IVANOV IVAN')
  })

  it('parses expiry and brand', () => {
    expect(parseExpiry('2601')).toBe('01/26')
    expect(detectBrand('A0000000031010', '4111111111111111')).toBe('VISA')
    expect(detectBrand('A0000006581010', '2200123456789012')).toBe('МИР')
  })

  it('parses AFL entries', () => {
    expect(parseAfl('0C010200')).toEqual([{ sfi: 1, first: 1, last: 2 }])
  })

  it('parses GPO response', () => {
    const options = parseGpo(GPO)
    expect(options.aip).toBe('1980')
    expect(options.records).toEqual([{ sfi: 1, first: 1, last: 2 }])
  })
})

describe('EMV flow', () => {
  it('returns card data through PPSE and AFL records', async () => {
    const transport = fakeTransport({
      [buildSelect(PPSE_AID)]: { response: PPSE, sw: '9000' },
      [buildSelect('A0000000031010')]: { response: SELECT_VISA, sw: '9000' },
      [buildGpo('')]: { response: GPO, sw: '9000' },
      [buildReadRecord(1, 1)]: { response: RECORD_1, sw: '9000' },
      [buildReadRecord(1, 2)]: { response: '', sw: '6A83' }
    })
    const log = []
    const result = await runEmvFlow(transport, { onLog: (entry) => log.push(entry) })

    expect(result.pan).toBe('4111111111111111')
    expect(result.expiry).toBe('01/26')
    expect(result.holder).toBe('ANDR')
    expect(result.brand).toBe('VISA')
    expect(log[0].label).toBe('PPSE')
    expect(log.at(-1).label).toBe('READ 1/1')
  })

  it('falls back to GET PAN when records hide the number', async () => {
    const transport = fakeTransport({
      [buildSelect(PPSE_AID)]: { response: PPSE, sw: '9000' },
      [buildSelect('A0000000031010')]: { response: SELECT_VISA, sw: '9000' },
      [buildGpo('')]: { response: GPO, sw: '9000' },
      [buildReadRecord(1, 1)]: { response: RECORD_EXPIRY_ONLY, sw: '9000' },
      [buildReadRecord(1, 2)]: { response: '', sw: '6A83' },
      [buildGetPan('')]: { response: RECORD_PAN_ONLY, sw: '9000' }
    })
    const result = await runEmvFlow(transport)
    expect(result.pan).toBe('4111111111111111')
    expect(result.expiry).toBe('01/26')
  })

  it('reports a card without EMV application', async () => {
    const transport = { async transceive() { return { response: '', sw: '6A82' } } }
    await expect(runEmvFlow(transport)).rejects.toMatchObject({ code: 'no-application' })
  })
})
