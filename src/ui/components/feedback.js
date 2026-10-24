import { el, icon, ICONS } from '../dom.js'
import { hapticError, hapticSuccess } from '../../platform/native.js'

let toastHost = null
const modalStack = []

export function closeTopModal() {
  const close = modalStack[modalStack.length - 1]
  if (!close) return false
  close()
  return true
}

export function closeAllModals() {
  while (modalStack.length) closeTopModal()
}

function host() {
  if (!toastHost) {
    toastHost = el('div', {
      class:
        'toast-safe pointer-events-none fixed inset-x-0 top-0 z-[90] flex flex-col items-center gap-2 px-4',
      id: 'toast-host'
    })
    document.body.append(toastHost)
  }
  return toastHost
}

export function toast(message, kind = 'info', duration = 2200, onClick = null) {
  const palette = {
    info: 'bg-ink-800/95 text-ink-100 border-ink-700',
    success: 'bg-ok-500/15 text-ok-400 border-ok-500/30',
    error: 'bg-danger-500/15 text-danger-400 border-danger-500/30'
  }
  const node = el('div', {
    class: `pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-2xl border px-4 py-3 text-sm font-medium shadow-lift backdrop-blur-xl animate-pop ${
      palette[kind] ?? palette.info
    }${onClick ? ' cursor-pointer active:scale-[0.98]' : ''}`
  })
  if (kind === 'success') node.append(icon(ICONS.check, 'w-4 h-4 shrink-0'))
  if (kind === 'error') node.append(icon(ICONS.warning, 'w-4 h-4 shrink-0'))
  node.append(el('span', { text: message }))
  host().append(node)
  if (kind === 'success') hapticSuccess()
  if (kind === 'error') hapticError()

  const dismiss = () => {
    if (!node.isConnected) return
    node.style.transition = 'opacity .2s ease, transform .2s ease'
    node.style.opacity = '0'
    node.style.transform = 'translateY(8px)'
    setTimeout(() => node.remove(), 220)
  }

  if (onClick) {
    node.setAttribute('role', 'button')
    node.setAttribute('tabindex', '0')
    node.addEventListener('click', () => {
      dismiss()
      onClick()
    })
  }
  if (duration > 0) setTimeout(dismiss, duration)
  return node
}

export function openModal({ title, subtitle, body, actions = [], dismissible = true, fullscreen = false, centered = false, onClose }) {
  const overlay = el('div', {
    class: fullscreen
      ? 'fixed inset-0 z-[80] flex bg-ink-950 animate-fade-in'
      : centered
        ? 'fixed inset-0 z-[80] flex items-center justify-center bg-ink-950/80 px-4 backdrop-blur-sm animate-fade-in'
        : 'fixed inset-0 z-[80] flex items-end justify-center bg-ink-950/80 backdrop-blur-sm animate-fade-in sm:items-center'
  })
  const panel = el('div', {
    class: fullscreen
      ? 'modal-fullscreen-safe flex h-full w-full flex-col bg-ink-950 animate-fade-in'
      : centered
        ? 'flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-ink-800 bg-ink-900 p-5 shadow-lift animate-pop'
        : 'modal-sheet-safe flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-ink-800 bg-ink-900 p-5 shadow-lift animate-sheet-in sm:rounded-3xl'
  })
  const close = () => {
    const index = modalStack.indexOf(close)
    if (index !== -1) modalStack.splice(index, 1)
    overlay.remove()
    if (!modalStack.length) document.body.style.overflow = ''
    onClose?.()
  }
  modalStack.push(close)
  panel.append(
    el('div', { class: 'mb-4 flex shrink-0 items-start justify-between gap-3' }, [
      el('div', {}, [
        el('h2', { class: 'text-lg font-semibold text-ink-50', text: title }),
        subtitle ? el('p', { class: 'mt-0.5 text-sm text-ink-400', text: subtitle }) : null
      ]),
      dismissible
        ? el('button', {
            class: 'rounded-xl p-2 text-ink-400 transition hover:bg-ink-800 hover:text-ink-100',
            onclick: close,
            'aria-label': 'Закрыть'
          }, [icon(ICONS.close, 'w-5 h-5')])
        : null
    ])
  )
  if (body) panel.append(el('div', { class: 'min-h-0 flex-1 overflow-y-auto no-scrollbar' }, [body]))
  if (actions.length) {
    panel.append(
      el('div', { class: 'mt-5 flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end' },
        actions.map((action) =>
          el('button', {
            class: `rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              action.danger
                ? 'bg-danger-500/15 text-danger-400 hover:bg-danger-500/25'
                : action.primary
                  ? 'bg-brand-500 text-white hover:bg-brand-400 shadow-soft'
                  : 'bg-ink-800 text-ink-200 hover:bg-ink-700'
            }`,
            onclick: (event) => {
              if (!action.onClick) {
                close()
                return
              }
              const result = action.onClick(event)
              if (result && typeof result.then === 'function') {
                result.then((value) => {
                  if (value !== false) close()
                })
                return
              }
              if (result !== false) close()
            },
            text: action.label
          })
        )
      )
    )
  }
  if (dismissible) {
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close()
    })
  }
  overlay.append(panel)
  document.body.append(overlay)
  document.body.style.overflow = 'hidden'
  return { overlay, panel, close }
}

export function confirmDialog({ title, message, confirmLabel = 'Подтвердить', danger = false }) {
  return new Promise((resolve) => {
    let settled = false
    const modal = openModal({
      title,
      body: el('p', { class: 'text-sm leading-relaxed text-ink-300', text: message }),
      dismissible: true,
      onClose: () => { settled = true; resolve(false) },
      actions: [
        { label: confirmLabel, danger, primary: !danger, onClick: () => { settled = true; resolve(true) } }
      ]
    })
    const observer = new MutationObserver(() => {
      if (!document.body.contains(modal.overlay) && !settled) {
        settled = true
        resolve(false)
        observer.disconnect()
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
  })
}

export function promptDialog({ title, label, value = '', placeholder = '', type = 'text', confirmLabel = 'Готово' }) {
  return new Promise((resolve) => {
    const input = el('input', { type, value, placeholder, class: 'w-full' })
    const modal = openModal({
      title,
      body: el('div', { class: 'space-y-2' }, [
        label ? el('label', { class: 'text-sm text-ink-300', text: label }) : null,
        input
      ]),
      onClose: () => resolve(null),
      actions: [
        { label: confirmLabel, primary: true, onClick: () => resolve(input.value) }
      ]
    })
    modal.overlay.addEventListener('click', (event) => {
      if (event.target === modal.overlay) resolve(null)
    })
    setTimeout(() => input.focus(), 120)
  })
}
