import { el, icon, ICONS } from '../dom.js'
import { CATEGORIES } from '../../core/store.js'
import { maskedCardNumber, cardBrand, cardGradient } from './card.js'

export function categoryOf(id) {
  return CATEGORIES.find((item) => item.id === id) ?? CATEGORIES[CATEGORIES.length - 1]
}

function initialOf(title) {
  return (title || '?').trim().charAt(0).toUpperCase() || '?'
}

// A compact payment-card badge: brand marks are far easier to recognise in a
// list than a gradient circle with the first letter of the title.
function cardBadgeMark(number, title = '', brand = '') {
  const network = cardBrand(number, title, brand)
  switch (network) {
    case 'VISA':
      return el('span', { class: 'text-[11px] font-black italic tracking-tight text-white', text: 'VISA' })
    case 'Mastercard':
      return el('span', { class: 'flex items-center' }, [
        el('span', { class: 'h-4 w-4 rounded-full bg-[#eb001b]' }),
        el('span', { class: '-ml-1.5 h-4 w-4 rounded-full bg-[#f79e1b]' })
      ])
    case 'МИР':
      return el('span', { class: 'text-[10px] font-black italic tracking-wide text-white', text: 'МИР' })
    case 'Amex':
      return el('span', { class: 'text-[9px] font-black tracking-tight text-white', text: 'AMEX' })
    case 'JCB':
      return el('span', { class: 'text-[10px] font-black italic tracking-tight text-white', text: 'JCB' })
    case 'UnionPay':
      return el('span', { class: 'text-[8px] font-bold tracking-tight text-white', text: 'UnionPay' })
    case 'Discover':
      return el('span', { class: 'text-[8px] font-black tracking-tight text-white', text: 'DISCOVER' })
    default:
      return icon(ICONS.card, 'w-5 h-5 text-white/90')
  }
}

function cardBadge(number, color, title = '', brand = '') {
  return el('div', {
    class: 'flex h-9 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[5px]',
    style: { background: cardGradient(color) }
  }, [cardBadgeMark(number, title, brand)])
}

// Picks a readable ink for an arbitrary background colour: light badges get
// a dark glyph, dark ones a light glyph.
export function readableInk(color) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(color || '').trim())
  if (!match) return 'text-white/90'
  const value = parseInt(match[1], 16)
  const red = (value >> 16) & 255
  const green = (value >> 8) & 255
  const blue = value & 255
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255
  return luminance > 0.62 ? 'text-ink-950' : 'text-white/90'
}

// A discount card looks like a card, not like a letter in a circle: the same
// compact badge, but with the icon and the colour picked for the record.
function loyaltyBadge(item, category) {
  const background = item.iconColor || category.color
  const glyph = item.icon && ICONS[item.icon] ? ICONS[item.icon] : ICONS.percent
  return el('div', {
    class: 'flex h-9 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[5px]',
    style: { background }
  }, [icon(glyph, `w-5 h-5 ${readableInk(background)}`)])
}

export function itemCard(item, { onOpen, onToggleFavorite }) {
  const category = categoryOf(item.category)
  const isCard = item.type === 'card'
  const isLoyalty = item.type === 'loyalty'
  const avatarGlyph = item.icon && ICONS[item.icon] ? icon(ICONS[item.icon], 'w-5 h-5') : initialOf(item.title)
  const avatar = isCard
    ? cardBadge(item.cardNumber, item.cardColor, item.title, item.cardBrand)
    : isLoyalty
      ? loyaltyBadge(item, category)
      : el('div', {
          class: 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-bold text-ink-950',
          style: { background: item.iconColor || category.color }
        }, [avatarGlyph])

  const titleRow = el('div', { class: 'flex items-center gap-1.5' }, [
    el('span', { class: 'truncate text-[15px] font-semibold text-ink-50', text: item.title || 'Без названия' })
  ])

  const subtitleText =
    item.type === 'card'
      ? item.cardNumber
        ? maskedCardNumber(item.cardNumber)
        : 'Банковская карта'
      : item.type === 'loyalty'
        ? item.loyaltyBarcode
          ? `•••• ${String(item.loyaltyBarcode).replace(/\D/g, '').slice(-4)}`
          : 'Скидочная карта'
        : item.type === 'passport'
          ? [item.passportSeries, item.passportNumber].filter(Boolean).join(' ') || 'Паспорт'
          : item.type === 'note'
            ? 'Заметка'
            : item.username || item.url || 'Нет логина'
  const subtitle = el('p', { class: 'truncate text-xs text-ink-400', text: subtitleText })

  const star = icon(ICONS.star, 'w-4.5 h-4.5')
  if (item.favorite) star.setAttribute('fill', 'currentColor')

  const favBtn = el('button', {
    class: `rounded-xl p-2.5 transition active:scale-90 hover:bg-ink-800 ${
      item.favorite ? 'text-warn-400' : 'text-ink-500 hover:text-ink-200'
    }`,
    'aria-label': item.favorite ? 'Убрать из избранного' : 'В избранное',
    onclick: (event) => {
      event.stopPropagation()
      onToggleFavorite(item)
    }
  }, [star])

  return el('button', {
    class:
      'flex w-full items-center gap-3 rounded-[6px] border border-ink-800 bg-ink-900/70 p-3 text-left transition active:scale-[0.99] hover:border-ink-700 hover:bg-ink-900',
    onclick: () => onOpen(item)
  }, [
    avatar,
    el('div', { class: 'min-w-0 flex-1' }, [titleRow, subtitle]),
    el('div', { class: 'flex items-center gap-0.5' }, [favBtn])
  ])
}

export function emptyState({ title, description, actionLabel, onAction }) {
  return el('div', { class: 'flex flex-col items-center gap-4 px-6 py-16 text-center' }, [
    el('div', {
      class:
        'flex h-16 w-16 items-center justify-center rounded-3xl bg-ink-900 text-ink-500 ring-1 ring-ink-800'
    }, [icon(ICONS.key, 'w-7 h-7')]),
    el('div', { class: 'space-y-1.5' }, [
      el('p', { class: 'text-base font-semibold text-ink-100', text: title }),
      el('p', { class: 'text-sm leading-relaxed text-ink-500', text: description })
    ]),
    actionLabel
      ? el('button', {
          class: 'rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition active:scale-95 hover:bg-brand-400',
          text: actionLabel,
          onclick: onAction
        })
      : null
  ])
}
