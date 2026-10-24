import { registerPlugin } from '@capacitor/core'
import { isNative } from './native.js'

const NfcCard = registerPlugin('NfcCard')

export async function nfcStatus() {
  if (!isNative()) return { available: false, enabled: false }
  try {
    const result = await NfcCard.isAvailable()
    return { available: Boolean(result?.available), enabled: Boolean(result?.enabled) }
  } catch {
    return { available: false, enabled: false }
  }
}

export async function startNfcRead(timeout = 25000) {
  await NfcCard.start({ timeout })
}

export async function nfcTransceive(data) {
  return NfcCard.transceive({ data })
}

export async function stopNfcRead() {
  if (!isNative()) return
  try {
    await NfcCard.stop()
  } catch {
    void 0
  }
}
