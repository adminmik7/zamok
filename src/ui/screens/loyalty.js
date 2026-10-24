import { el, icon, ICONS } from '../dom.js'
import { categoryOf, readableInk } from './list.js'
import { openIconPicker, defaultAvatarIcon } from './detail.js'
import { barcodeFor } from '../../core/barcode.js'
import { barcodeSvg } from '../components/barcode.js'
import { copyToClipboard, clearClipboard, hapticLight } from '../../platform/native.js'
import { toast } from '../components/feedback.js'
import { photoBlock } from '../components/photo.js'

const maskedBarcode = (value) => {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return ''
  return `${'•'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`
}

export function loyaltyDetailScreen({
  item,
  onBack,
  onEdit,
  onToggleFavorite,
  onAppearanceChange,
  clipboardClearMs = 30000
}) {
  const category = categoryOf(item.category)
  const barcode = barcodeFor(item.loyaltyBarcode)
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

  const copyBarcode = async () => {
    await copyToClipboard(item.loyaltyBarcode)
    hapticLight()
    toast('Штрихкод скопирован', 'success', 1400)
    scheduleClear()
  }

  const star = icon(ICONS.star, 'w-5 h-5')
  if (item.favorite) star.setAttribute('fill', 'currentColor')
  const favoriteBtn = el('button', {
    class: `rounded-xl p-2.5 transition active:scale-90 hover:bg-ink-800 ${
      item.favorite ? 'text-warn-400' : 'text-ink-400 hover:text-ink-100'
    }`,
    'aria-label': item.favorite ? 'Убрать из избранного' : 'В избранное',
    onclick: () => onToggleFavorite?.(item)
  }, [star])

  const header = el('div', { class: 'flex items-center gap-1' }, [
    el('button', {
      class: 'rounded-xl p-2.5 text-ink-300 transition active:scale-90 hover:bg-ink-800',
      'aria-label': 'Назад',
      onclick: onBack
    }, [icon(ICONS.back, 'w-5 h-5')]),
    el('div', { class: 'min-w-0 flex-1 px-1' }, [
      el('h1', { class: 'truncate text-lg font-semibold text-ink-50', text: item.title || 'Скидочная карта' }),
      el('p', { class: 'truncate text-xs text-ink-500', text: 'Скидочная карта' })
    ]),
    favoriteBtn,
    el('button', {
      class: 'rounded-xl p-2.5 text-ink-300 transition active:scale-90 hover:bg-ink-800',
      'aria-label': 'Изменить',
      onclick: onEdit
    }, [icon(ICONS.edit, 'w-5 h-5')])
  ])

  let avatarIconName = item.icon && ICONS[item.icon] ? item.icon : defaultAvatarIcon(item.type)
  let avatarColor = item.iconColor || category.color

  const avatarBadge = el('span', {
    class:
      'absolute -right-0.5 -bottom-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-ink-900 bg-ink-800 text-ink-300'
  }, [icon(ICONS.edit, 'w-3 h-3')])

  // A discount card is a card, so it is shown as one: a rectangle in the
  // chosen colour with the chosen icon, not a round avatar.
  const avatar = el('button', {
    type: 'button',
    class:
      'relative flex h-16 w-24 items-center justify-center overflow-hidden rounded-[6px] transition active:scale-95',
    'aria-label': 'Изменить иконку',
    style: { backgroundColor: avatarColor }
  })

  const paintAvatar = () => {
    avatar.style.backgroundColor = avatarColor
    avatar.replaceChildren(
      icon(ICONS[avatarIconName] ?? ICONS.ticket, `w-8 h-8 ${readableInk(avatarColor)}`),
      avatarBadge
    )
  }
  paintAvatar()

  avatar.addEventListener('click', () => {
    hapticLight()
    const startIcon = avatarIconName
    const startColor = avatarColor
    openIconPicker({
      iconName: startIcon,
      color: startColor,
      onPreview: (choice) => {
        avatarIconName = choice.icon
        avatarColor = choice.iconColor
        paintAvatar()
      },
      onConfirm: (choice) => { onAppearanceChange?.(choice) },
      onCancel: () => {
        avatarIconName = startIcon
        avatarColor = startColor
        paintAvatar()
      }
    })
  })

  const barcodeBlock = barcode
    ? el('div', { class: 'mt-4' }, [
        el('div', {
          class: 'rounded-[6px] bg-white p-3 text-black',
          'aria-label': 'Штрихкод'
        }, [barcodeSvg(item.loyaltyBarcode, { className: 'w-full' })]),
        barcode.warning
          ? el('p', { class: 'mt-2 text-center text-xs text-warn-400', text: barcode.warning })
          : null
      ])
    : el('p', { class: 'mt-3 text-sm text-ink-500', text: 'Штрихкод не задан' })

  const hero = el('div', { class: 'rounded-[6px] border border-ink-800 bg-ink-900/70 p-5 text-center' }, [
    el('div', { class: 'flex justify-center' }, [avatar]),
    el('h2', { class: 'mt-3 break-words text-xl font-semibold text-ink-50', text: item.title || 'Без названия' }),
    barcodeBlock
  ])

  const factRow = (label, value, action = null) =>
    el('div', { class: 'border-b border-ink-800/70 px-4 py-3 last:border-0' }, [
      el('p', { class: 'text-xs font-medium tracking-wide text-ink-500 uppercase', text: label }),
      el('div', { class: 'mt-1 flex items-end justify-between gap-3' }, [
        el('div', { class: 'min-w-0 flex-1 truncate text-sm text-ink-100' }, [value]),
        action
      ])
    ])

  const facts = el('div', { class: 'rounded-[6px] border border-ink-800 bg-ink-900/70' }, [
    factRow('Штрихкод', item.loyaltyBarcode || '—', item.loyaltyBarcode
      ? el('button', {
          class: 'rounded-lg p-1.5 text-ink-400 transition active:scale-90 hover:bg-ink-800 hover:text-ink-100',
          'aria-label': 'Скопировать штрихкод',
          onclick: copyBarcode
        }, [icon(ICONS.copy, 'w-4.5 h-4.5')])
      : null)
  ])

  const body = el('div', { class: 'space-y-4 pb-2' }, [
    hero,
    facts,
    item.notes
      ? el('div', { class: 'rounded-[6px] border border-ink-800 bg-ink-900/70 p-4' }, [
          el('span', { class: 'text-xs font-medium uppercase tracking-wide text-ink-400', text: 'Заметки' }),
          el('p', { class: 'mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-200', text: item.notes })
        ])
      : null,
    photoBlock(item.photo),
    el('p', {
      class: 'pt-1 text-center text-xs text-ink-500',
      text: `Изменено: ${new Date(item.updatedAt).toLocaleString('ru-RU')}`
    })
  ])

  const root = el('div', { class: 'flex h-full flex-col bg-ink-950' }, [
    el('div', {
      class:
        'sticky top-0 z-10 border-b border-ink-800/80 bg-ink-950/90 px-4 py-3 backdrop-blur-xl'
    }, [header]),
    el('div', { class: 'flex-1 overflow-y-auto px-4 py-4 no-scrollbar' }, [body]),
    el('div', { class: 'safe-bottom' })
  ])

  return { element: root }
}

export { maskedBarcode }
