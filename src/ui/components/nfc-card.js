import { runEmvFlow } from '../../core/emv-flow.js'
import { nfcStatus, startNfcRead, nfcTransceive, stopNfcRead } from '../../platform/nfc.js'
import { el, icon, ICONS } from '../dom.js'
import { openModal } from './feedback.js'

const transport = { transceive: (data) => nfcTransceive(data) }

export function openNfcCardReader({ onResult, onClose } = {}) {
  let state = 'idle'
  let closed = false

  const status = el('p', { class: 'text-center text-sm text-ink-300', text: 'Проверяю NFC…' })

  const body = el('div', { class: 'space-y-4 py-2' }, [
    el('div', { class: 'flex justify-center text-brand-300' }, [icon(ICONS.nfc, 'w-10 h-10 animate-pulse')]),
    status
  ])

  const modal = openModal({
    title: 'Считать карту по NFC',
    body,
    actions: [
      { label: 'Повторить', onClick: () => { retry(); return false } },
      { label: 'Готово', primary: true }
    ],
    onClose: () => {
      closed = true
      state = 'closed'
      stopNfcRead()
      onClose?.()
    }
  })

  const retry = () => {
    if (state === 'waiting' || state === 'reading' || state === 'done') return
    state = 'idle'
    run()
  }

  const run = async () => {
    if (closed || state === 'closed') return
    state = 'checking'
    const info = await nfcStatus()
    if (closed) return
    if (!info.available) {
      state = 'error'
      status.textContent = 'Это устройство не поддерживает NFC'
      return
    }
    if (!info.enabled) {
      state = 'error'
      status.textContent = 'NFC выключен — включите его в настройках'
      return
    }
    status.textContent = 'Приложите карту к телефону'
    state = 'waiting'
    try {
      await startNfcRead(25000)
      if (closed) return
      state = 'reading'
      status.textContent = 'Читаю карту…'
      const result = await runEmvFlow(transport)
      await stopNfcRead()
      if (closed) return
      state = 'done'
      onResult?.(result)
      closed = true
      modal.close()
    } catch (error) {
      if (closed) return
      state = 'error'
      if (error?.code === 'cancelled' || error?.code === 'paused') {
        status.textContent = 'Считывание отменено'
        return
      }
      status.textContent = error?.message || 'Не удалось считать карту'
      stopNfcRead()
    }
  }

  run()

  return modal
}
