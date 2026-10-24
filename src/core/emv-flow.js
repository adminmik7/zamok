import {
  FALLBACK_AIDS,
  PPSE_AID,
  buildGetPan,
  buildGpo,
  buildReadRecord,
  buildSelect,
  detectBrand,
  parseGpo,
  parsePpse,
  parseRecord,
  parseSelect,
  parseTrack2
} from './emv.js'

const fail = (code, message) => Object.assign(new Error(message), { code })

const hasPan = (value) => String(value || '').replace(/\D/g, '').length >= 12

const applyRecord = (target, record) => {
  if (!target.pan && hasPan(record.pan)) target.pan = record.pan
  if (!target.expiry && record.expiry) target.expiry = record.expiry
  if (!target.holder && record.holder) target.holder = record.holder
  if (!target.country && record.country) target.country = record.country
}

const applyTrack = (target, track) => {
  const parsed = parseTrack2(track)
  if (!target.pan && hasPan(parsed.pan)) target.pan = parsed.pan
  if (!target.expiry && parsed.expiry) target.expiry = parsed.expiry
}

const scanRecords = function* () {
  for (let sfi = 1; sfi <= 10; sfi += 1) {
    for (let record = 1; record <= 3; record += 1) yield { sfi, record }
  }
}

export async function runEmvFlow(transport, { onLog } = {}) {
  const log = []
  const send = async (label, apdu) => {
    const answer = await transport.transceive(apdu)
    const entry = {
      label,
      apdu,
      response: String(answer?.response || '').toUpperCase(),
      sw: String(answer?.sw || '').toUpperCase()
    }
    log.push(entry)
    onLog?.(entry)
    return entry
  }

  const applications = []
  const ppse = await send('PPSE', buildSelect(PPSE_AID))
  if (ppse.sw === '9000' && ppse.response) applications.push(...parsePpse(ppse.response))
  for (const aid of FALLBACK_AIDS) {
    if (!applications.some((application) => application.aid === aid)) applications.push({ aid })
  }

  let selected = false
  for (const application of applications) {
    const select = await send(`SELECT ${application.aid}`, buildSelect(application.aid))
    if (select.sw !== '9000') continue
    selected = true
    const description = parseSelect(select.response)
    const gpo = await send('GPO', buildGpo(description.pdol))
    if (gpo.sw !== '9000') continue
    const options = parseGpo(gpo.response)
    const target = { pan: '', expiry: '', holder: '', country: '', cryptogram: options.cryptogram }
    applyRecord(target, { pan: options.pan })
    if (options.track2) applyTrack(target, options.track2)

    const records = options.records.length ? options.records : null
    const entries = records
      ? records.flatMap(({ sfi, first, last }) => {
          const list = []
          for (let record = first; record <= last; record += 1) list.push({ sfi, record })
          return list
        })
      : [...scanRecords()]

    for (const entry of entries) {
      if (target.pan && target.expiry && target.holder) break
      const read = await send(`READ ${entry.sfi}/${entry.record}`, buildReadRecord(entry.sfi, entry.record))
      if (read.sw !== '9000') continue
      applyRecord(target, parseRecord(read.response))
    }

    if (!hasPan(target.pan)) {
      const getPan = await send('GET PAN', buildGetPan(target.cryptogram))
      if (getPan.sw === '9000' && getPan.response) applyRecord(target, parseRecord(getPan.response))
    }

    if (!hasPan(target.pan)) continue

    return {
      pan: target.pan,
      expiry: target.expiry || '',
      holder: target.holder || '',
      brand: detectBrand(application.aid, target.pan),
      aid: application.aid,
      label: description.label || application.label || '',
      raw: log
    }
  }

  throw fail(
    selected ? 'no-pan' : 'no-application',
    selected ? 'Карта не дала прочитать номер' : 'Карта не поддерживает EMV'
  )
}
