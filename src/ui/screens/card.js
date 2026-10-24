import { el, icon, ICONS } from '../dom.js'
import { detectCardBrand } from '../../core/card-brand.js'
import { copyToClipboard, clearClipboard, hapticLight } from '../../platform/native.js'
import { toast, openModal, closeTopModal } from '../components/feedback.js'
import { photoBlock } from '../components/photo.js'

const digitsOf = (value) => String(value || '').replace(/\D/g, '')
const groupDigits = (digits) => digits.replace(/(.{4})/g, '$1 ').trim()

export function formatCardNumber(value) {
  const digits = digitsOf(value)
  return digits ? groupDigits(digits) : ''
}

export function maskedCardNumber(value) {
  const digits = digitsOf(value)
  if (!digits) return '•••• •••• •••• ••••'
  return groupDigits('•'.repeat(Math.max(0, digits.length - 4)) + digits.slice(-4))
}

export function cardBrand(value, title = '', brand = '') {
  return detectCardBrand(value, { title, brand })
}

function brandLogo(value, title = '', brand = '') {
  const network = cardBrand(value, title, brand)
  switch (network) {
    case 'VISA':
      return el('span', { class: 'text-lg font-black italic tracking-tight text-white', text: 'VISA' })
    case 'Mastercard':
      return el('span', { class: 'flex items-center' }, [
        el('span', { class: 'h-6 w-6 rounded-full bg-[#eb001b]' }),
        el('span', { class: '-ml-2.5 h-6 w-6 rounded-full bg-[#f79e1b]' })
      ])
    case 'МИР':
      return el('span', { class: 'text-lg font-black tracking-tight text-white italic', text: 'МИР' })
    case 'Amex':
      return el('span', { class: 'text-sm font-black tracking-tight text-white', text: 'AMEX' })
    case 'JCB':
      return el('span', { class: 'text-base font-black tracking-tight text-white italic', text: 'JCB' })
    case 'UnionPay':
      return el('span', { class: 'text-sm font-bold tracking-tight text-white', text: 'UnionPay' })
    case 'Discover':
      return el('span', { class: 'text-[11px] font-black tracking-tight text-white', text: 'DISCOVER' })
    default:
      return el('span', { class: 'text-white/90' }, [icon(ICONS.card, 'w-7 h-7')])
  }
}

export const CARD_COLORS = [
  { id: 'blue', label: 'Синий', gradient: 'linear-gradient(135deg, #60a5fa 0%, #2563eb 55%, #1d4ed8 100%)' },
  { id: 'graphite', label: 'Графит', gradient: 'linear-gradient(135deg, #6b7280 0%, #374151 55%, #111827 100%)' },
  { id: 'violet', label: 'Фиолетовый', gradient: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 55%, #4c1d95 100%)' },
  { id: 'emerald', label: 'Изумрудный', gradient: 'linear-gradient(135deg, #34d399 0%, #059669 55%, #065f46 100%)' },
  { id: 'sunset', label: 'Оранжевый', gradient: 'linear-gradient(135deg, #fb923c 0%, #ea580c 55%, #9a3412 100%)' },
  { id: 'rose', label: 'Розовый', gradient: 'linear-gradient(135deg, #fb7185 0%, #e11d48 55%, #881337 100%)' },
  { id: 'gold', label: 'Золотой', gradient: 'linear-gradient(135deg, #fcd34d 0%, #d97706 55%, #78350f 100%)' },
  { id: 'ice', label: 'Ледяной', gradient: 'linear-gradient(135deg, #a5f3fc 0%, #0891b2 55%, #164e63 100%)' },
  { id: 'cobalt', label: 'Кобальт', gradient: 'linear-gradient(135deg, #6366f1 0%, #4338ca 55%, #1e1b4b 100%)' },
  { id: 'turquoise', label: 'Бирюзовый', gradient: 'linear-gradient(135deg, #5eead4 0%, #14b8a6 55%, #115e59 100%)' },
  { id: 'lime', label: 'Лаймовый', gradient: 'linear-gradient(135deg, #bef264 0%, #84cc16 55%, #3f6212 100%)' },
  { id: 'fuchsia', label: 'Фуксия', gradient: 'linear-gradient(135deg, #f0abfc 0%, #d946ef 55%, #86198f 100%)' },
  { id: 'brown', label: 'Коричневый', gradient: 'linear-gradient(135deg, #d6a06a 0%, #a16207 55%, #5b3a1a 100%)' },
  { id: 'ruby', label: 'Рубиновый', gradient: 'linear-gradient(135deg, #f87171 0%, #dc2626 55%, #450a0a 100%)' }
]

export function cardGradient(id) {
  return (CARD_COLORS.find((color) => color.id === id) ?? CARD_COLORS[0]).gradient
}

export function openCardColorPicker({ current, onSelect }) {
  const body = el('div', { class: 'grid grid-cols-2 gap-3' },
    CARD_COLORS.map((color) =>
      el('button', {
        class: 'flex h-20 flex-col justify-between rounded-2xl p-3 text-left text-sm font-semibold text-white shadow-soft transition active:scale-[0.98]',
        style: { background: color.gradient },
        'aria-label': color.label,
        onclick: async () => {
          await onSelect?.(color.id)
          closeTopModal()
        }
      }, [
        el('span', { text: color.label }),
        current === color.id ? el('span', { class: 'self-end' }, [icon(ICONS.check, 'w-5 h-5')]) : null
      ])
    )
  )

  openModal({ title: 'Цвет карты', subtitle: 'Выберите оформление', body })
}

export function formatExpiry(value) {
  const digits = digitsOf(value).slice(0, 4)
  if (digits.length <= 2) return digits
  if (digits.length === 3) return `0${digits[0]}/${digits.slice(1)}`
  return `${digits.slice(0, 2)}/${digits.slice(2)}`
}

const maskedSecret = (value) => (value ? '•'.repeat(Math.min(Math.max(String(value).length, 3), 8)) : '—')

export function cardDetailScreen({ item, onBack, onEdit, onColorChange, clipboardClearMs = 30000 }) {
  let clearTimer = null

  const scheduleClear = () => {
    if (clearTimer) clearTimeout(clearTimer)
    if (clipboardClearMs > 0) {
      clearTimer = setTimeout(async () => {
        await clearClipboard()
        toast('Буфер обмена очищен', 'info', 1600)
      }, clipboardClearMs)
    }
  }

  const copy = async (value, message) => {
    if (!String(value || '').trim()) return
    await copyToClipboard(String(value))
    hapticLight()
    toast(message, 'success', 1400)
    scheduleClear()
  }

  const revealButton = (onClick, { light = false } = {}) =>
    el('button', {
      class: `shrink-0 rounded-lg p-1.5 transition active:scale-90 ${light ? 'text-white/80 hover:text-white' : 'text-ink-400 hover:bg-ink-800 hover:text-ink-100'}`,
      'aria-label': 'Показать',
      onclick: onClick
    })

  const numberNodes = []
  const numberEyes = []
  let numberRevealed = false
  const syncNumber = () => {
    const text = numberRevealed ? formatCardNumber(item.cardNumber) : maskedCardNumber(item.cardNumber)
    for (const node of numberNodes) node.textContent = text
    for (const button of numberEyes) {
      button.replaceChildren(icon(numberRevealed ? ICONS.eyeOff : ICONS.eye, 'w-5 h-5'))
    }
  }
  const numberEye = (options) => {
    const button = revealButton((event) => {
      event.stopPropagation()
      numberRevealed = !numberRevealed
      syncNumber()
    }, options)
    numberEyes.push(button)
    return button
  }

  let cvvRevealed = false
  let pinRevealed = false
  const cvvValue = el('span', { class: 'font-mono text-base text-ink-50' })
  const pinValue = el('span', { class: 'font-mono text-base text-ink-50' })
  const cvvEye = revealButton(() => {
    cvvRevealed = !cvvRevealed
    syncSecrets()
  })
  const pinEye = revealButton(() => {
    pinRevealed = !pinRevealed
    syncSecrets()
  })
  const syncSecrets = () => {
    cvvValue.textContent = item.cardCvv ? (cvvRevealed ? item.cardCvv : maskedSecret(item.cardCvv)) : '—'
    pinValue.textContent = item.cardPin ? (pinRevealed ? item.cardPin : maskedSecret(item.cardPin)) : '—'
    // The eye icon has to exist from the start: an empty button is narrower than
    // the copy button, which used to shift the copy icons out of one column.
    cvvEye.replaceChildren(icon(cvvRevealed ? ICONS.eyeOff : ICONS.eye, 'w-5 h-5'))
    pinEye.replaceChildren(icon(pinRevealed ? ICONS.eyeOff : ICONS.eye, 'w-5 h-5'))
  }

  const cardNumberText = el('span', {
    class: 'min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[clamp(13px,4.6vw,17px)] leading-tight tracking-[0.06em] text-white'
  })
  numberNodes.push(cardNumberText)

  const chip = el('div', {
    class: 'relative mt-4 h-7 w-10 overflow-hidden rounded-md bg-gradient-to-br from-amber-200 via-amber-300 to-amber-500 ring-1 ring-amber-700/40'
  }, [
    el('div', { class: 'absolute inset-x-1.5 top-1/2 h-px bg-amber-800/40' }),
    el('div', { class: 'absolute inset-y-1.5 left-1/2 w-px bg-amber-800/40' })
  ])

  const card = el('div', {
    class: 'cursor-pointer overflow-hidden rounded-[6px] p-5 shadow-lift',
    style: { background: cardGradient(item.cardColor) },
    onclick: () => openCardColorPicker({
      current: item.cardColor || 'blue',
      onSelect: (color) => onColorChange?.(color)
    })
  }, [
    el('div', { class: 'flex items-start justify-between gap-3' }, [
      el('span', { class: 'truncate text-base font-semibold text-white', text: item.title || 'Банковская карта' }),
      // The whole card opens the colour picker, so the logo is just a mark now.
      el('span', { class: 'shrink-0' }, [brandLogo(item.cardNumber, item.title, item.cardBrand)])
    ]),
    chip,
    el('div', { class: 'mt-6 flex min-w-0 items-center justify-between gap-3' }, [cardNumberText, numberEye({ light: true })]),
    el('div', { class: 'mt-5 flex items-end justify-between gap-3' }, [
      el('div', { class: 'min-w-0' }, [
        el('p', { class: 'text-[10px] font-semibold tracking-wide text-white/60 uppercase', text: 'Владелец' }),
        el('p', { class: 'mt-0.5 truncate text-sm font-medium text-white uppercase', text: item.cardHolder || '—' })
      ]),
      el('div', { class: 'shrink-0 text-right' }, [
        el('p', { class: 'text-[10px] font-semibold tracking-wide text-white/60 uppercase', text: 'Срок действия' }),
        el('p', { class: 'mt-0.5 font-mono text-sm text-white', text: formatExpiry(item.cardExpiry) || '—' })
      ])
    ])
  ])

  const dataRow = (label, valueNode, actions = []) => {
    const actionGroup = el('div', { class: 'flex shrink-0 items-center gap-0.5' }, actions)
    // Rows without an eye get an invisible eye-sized slot, so the copy icon
    // stays in the same column (the eye is the left icon of the pair).
    if (actions.length === 1) actionGroup.prepend(el('span', { class: 'h-8 w-8 shrink-0' }))
    return el('div', { class: 'flex items-end justify-between gap-3 border-b border-ink-800/70 py-3.5' }, [
      el('div', { class: 'min-w-0' }, [
        el('p', { class: 'text-xs font-medium tracking-wide text-ink-500 uppercase', text: label }),
        el('div', { class: 'mt-1 break-all' }, [valueNode])
      ]),
      actionGroup
    ])
  }

  const copyButton = (value, message) =>
    el('button', {
      class: 'rounded-lg p-1.5 text-ink-400 transition active:scale-90 hover:bg-ink-800 hover:text-ink-100',
      'aria-label': `Скопировать: ${message}`,
      onclick: () => copy(value, message)
    }, [icon(ICONS.copy, 'w-5 h-5')])

  const numberRowValue = el('span', { class: 'font-mono text-base text-ink-50' })
  numberNodes.push(numberRowValue)

  const numberRow = dataRow('Номер', numberRowValue, [
    numberEye(),
    copyButton(formatCardNumber(item.cardNumber), 'Номер карты скопирован')
  ])

  const expiryRow = dataRow(
    'Срок действия',
    el('span', { class: 'font-mono text-base text-ink-50', text: formatExpiry(item.cardExpiry) || '—' }),
    [copyButton(formatExpiry(item.cardExpiry), 'Срок действия скопирован')]
  )

  const holderRow = dataRow(
    'Владелец',
    el('span', { class: 'text-base text-ink-50', text: (item.cardHolder || '—').toUpperCase() }),
    [copyButton(item.cardHolder, 'Владелец скопирован')]
  )

  const cvvRow = dataRow('CVV', cvvValue, [
    cvvEye,
    copyButton(item.cardCvv, 'CVV скопирован')
  ])

  const pinRow = dataRow('PIN', pinValue, [
    pinEye,
    copyButton(item.cardPin, 'PIN скопирован')
  ])

  const header = el('div', { class: 'flex items-center gap-3' }, [
    el('button', {
      class: 'rounded-xl p-2.5 text-ink-300 transition active:scale-90 hover:bg-ink-800',
      'aria-label': 'Назад',
      onclick: onBack
    }, [icon(ICONS.back, 'w-5 h-5')]),
    el('div', { class: 'min-w-0 flex-1' }, [
      el('h1', { class: 'truncate text-lg font-semibold text-ink-50', text: item.title || 'Банковская карта' }),
      el('p', { class: 'truncate text-xs text-ink-500', text: cardBrand(item.cardNumber, item.title, item.cardBrand) })
    ]),
    el('button', {
      class: 'rounded-xl p-2.5 text-ink-300 transition active:scale-90 hover:bg-ink-800',
      'aria-label': 'Изменить',
      onclick: onEdit
    }, [icon(ICONS.edit, 'w-5 h-5')])
  ])

  const body = el('div', { class: 'space-y-4 pb-2' }, [
    card,
    el('div', { class: 'rounded-[6px] border border-ink-800 bg-ink-900/70 px-4' }, [
      numberRow, expiryRow, holderRow, cvvRow, pinRow
    ]),
    item.notes
      ? el('div', { class: 'rounded-2xl border border-ink-800 bg-ink-900/70 p-4' }, [
          el('span', { class: 'text-xs font-medium tracking-wide text-ink-400 uppercase', text: 'Заметки' }),
          el('p', { class: 'mt-2 text-sm leading-relaxed break-words whitespace-pre-wrap text-ink-200', text: item.notes })
        ])
      : null,
    photoBlock(item.photo),
    el('p', { class: 'pt-1 text-center text-xs text-ink-500', text: `Изменено: ${new Date(item.updatedAt).toLocaleString('ru-RU')}` })
  ])

  syncNumber()
  syncSecrets()

  const root = el('div', { class: 'flex h-full flex-col bg-ink-950' }, [
    el('div', {
      class: 'sticky top-0 z-10 border-b border-ink-800/80 bg-ink-950/90 px-4 py-3 backdrop-blur-xl'
    }, [header]),
    el('div', { class: 'flex-1 overflow-y-auto px-4 py-4 no-scrollbar' }, [body]),
    el('div', { class: 'safe-bottom' })
  ])

  return { element: root }
}
