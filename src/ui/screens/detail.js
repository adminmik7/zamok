import { el, icon, ICONS } from '../dom.js'
import { categoryOf } from './list.js'
import { CATEGORY_COLORS } from '../../core/store.js'
import { strengthMeter } from '../components/form.js'
import { looksWeak } from '../../core/generator.js'
import { generateTotp } from '../../core/otp.js'
import { formatCountdown } from '../../core/totp.js'
import { formatIsoDate } from '../../core/format.js'
import { copyToClipboard, clearClipboard, hapticLight } from '../../platform/native.js'
import { toast, openModal } from '../components/feedback.js'
import { photoBlock } from '../components/photo.js'

export const AVATAR_ICONS = [
  'globe', 'key', 'user', 'mail', 'lock', 'shield', 'card', 'id', 'wallet', 'bank',
  'note', 'tag', 'clock', 'calendar', 'star', 'music', 'game', 'home', 'cloud',
  'cart', 'phone', 'terminal', 'photo', 'fingerprint', 'info', 'ticket', 'percent', 'barcode'
]

// Brand marks are kept apart so the picker can group them under their own
// heading instead of burying Google/Yandex after two dozen generic glyphs.
export const SERVICE_ICONS = [
  'google', 'yandex', 'mailru', 'telegram', 'whatsapp', 'vk',
  'youtube', 'instagram', 'facebook', 'x', 'github', 'apple',
  'microsoft', 'discord', 'steam', 'spotify', 'sber', 'tiktok'
]

const ALL_AVATAR_ICONS = [...AVATAR_ICONS, ...SERVICE_ICONS]

export function defaultAvatarIcon(type) {
  if (type === 'otp') return 'clock'
  if (type === 'note') return 'note'
  if (type === 'loyalty') return 'percent'
  return 'globe'
}

export function openIconPicker({ iconName, color, onPreview, onConfirm, onCancel }) {
  let currentIcon = ALL_AVATAR_ICONS.includes(iconName) ? iconName : 'globe'
  let currentColor = color || CATEGORY_COLORS[7]
  let confirmed = false

  const preview = el('div', {
    class: 'mx-auto flex h-16 w-16 items-center justify-center rounded-full text-ink-950 transition'
  })

  const renderPreview = () => {
    preview.style.backgroundColor = currentColor
    preview.replaceChildren(icon(ICONS[currentIcon] ?? ICONS.globe, 'w-7 h-7'))
  }

  const publish = () => {
    renderPreview()
    onPreview?.({ icon: currentIcon, iconColor: currentColor })
  }

  const colorButtons = CATEGORY_COLORS.map((value) => {
    const button = el('button', {
      type: 'button',
      class: 'h-9 w-9 rounded-full border border-white/10 ring-2 ring-offset-2 ring-offset-ink-900 transition active:scale-95',
      style: { backgroundColor: value },
      'aria-label': `Цвет ${value}`
    })
    button.apply = () => {
      button.classList.toggle('ring-white', currentColor === value)
      button.classList.toggle('ring-transparent', currentColor !== value)
    }
    button.addEventListener('click', () => {
      currentColor = value
      for (const node of colorButtons) node.apply()
      publish()
    })
    return button
  })

  const makeIconButton = (name) => {
    const button = el('button', {
      type: 'button',
      class: 'flex h-10 items-center justify-center rounded-xl border transition active:scale-95',
      'aria-label': `Значок ${name}`
    })
    button.apply = () => {
      const selected = currentIcon === name
      button.className = `flex h-10 items-center justify-center rounded-xl border transition active:scale-95 ${
        selected
          ? 'border-white bg-ink-800 text-ink-50'
          : 'border-ink-800 bg-ink-950 text-ink-300 hover:border-ink-700 hover:text-ink-100'
      }`
      button.replaceChildren(icon(ICONS[name], 'w-5 h-5'))
    }
    button.addEventListener('click', () => {
      currentIcon = name
      for (const node of allIconButtons) node.apply()
      publish()
    })
    return button
  }

  const iconButtons = AVATAR_ICONS.map(makeIconButton)
  const serviceButtons = SERVICE_ICONS.map(makeIconButton)
  const allIconButtons = [...iconButtons, ...serviceButtons]

  for (const node of colorButtons) node.apply()
  for (const node of allIconButtons) node.apply()
  renderPreview()

  openModal({
    title: 'Иконка',
    subtitle: 'Выберите цвет и значок',
    onClose: () => {
      if (!confirmed) onCancel?.()
    },
    body: el('div', { class: 'space-y-4' }, [
      preview,
      el('div', { class: 'space-y-2' }, [
        el('span', { class: 'text-xs font-medium tracking-wide text-ink-400 uppercase', text: 'Цвет' }),
        el('div', { class: 'flex flex-wrap gap-2' }, colorButtons)
      ]),
      el('div', { class: 'space-y-2' }, [
        el('span', { class: 'text-xs font-medium tracking-wide text-ink-400 uppercase', text: 'Значок' }),
        el('div', { class: 'grid grid-cols-6 gap-2' }, iconButtons)
      ]),
      el('div', { class: 'space-y-2' }, [
        el('span', { class: 'text-xs font-medium tracking-wide text-ink-400 uppercase', text: 'Сервисы' }),
        el('div', { class: 'grid grid-cols-6 gap-2' }, serviceButtons)
      ])
    ]),
    actions: [
      {
        label: 'Готово',
        primary: true,
        onClick: () => {
          confirmed = true
          onConfirm?.({ icon: currentIcon, iconColor: currentColor })
        }
      }
    ]
  })
}

function row(label, value, { mono = false, action = null } = {}) {
  return el('div', { class: 'flex items-start justify-between gap-4 py-2.5' }, [
    el('span', { class: 'shrink-0 text-sm text-ink-400', text: label }),
    el('div', { class: 'min-w-0 flex-1 text-right' }, [
      el('span', {
        class: `break-all text-sm text-ink-100 ${mono ? 'font-mono' : ''}`,
        text: value || '—'
      }),
      action
    ])
  ])
}

function passportDetail({ item, onBack, onEdit }) {
  const category = categoryOf(item.category)

  const header = el('div', { class: 'flex items-center gap-3' }, [
    el('button', {
      class: 'rounded-xl p-2.5 text-ink-300 transition active:scale-90 hover:bg-ink-800',
      'aria-label': 'Назад',
      onclick: onBack
    }, [icon(ICONS.back, 'w-5 h-5')]),
    el('div', { class: 'min-w-0 flex-1' }, [
      el('h1', { class: 'truncate text-lg font-semibold text-ink-50', text: item.title || 'Паспорт' }),
      el('p', { class: 'truncate text-xs text-ink-500', text: category.label })
    ]),
    el('button', {
      class: 'rounded-xl p-2.5 text-ink-300 transition active:scale-90 hover:bg-ink-800',
      'aria-label': 'Изменить',
      onclick: onEdit
    }, [icon(ICONS.edit, 'w-5 h-5')])
  ])

  const divider = () => el('div', { class: 'h-px bg-ink-800' })

  const body = el('div', { class: 'space-y-4' }, [
    el('div', { class: 'rounded-2xl border border-ink-800 bg-ink-900/70 p-4' }, [
      row('Серия и номер', [item.passportSeries, item.passportNumber].filter(Boolean).join(' ')),
      divider(),
      row('Идентификационный номер', item.passportIdNumber, { mono: true }),
      divider(),
      row('Кем выдан', item.passportIssuedBy),
      divider(),
      row('Дата выдачи', formatIsoDate(item.passportIssuedAt)),
      divider(),
      row('Действителен до', formatIsoDate(item.passportValidUntil)),
      divider(),
      row('Категория', category.label),
      divider(),
      row('Обновлено', new Date(item.updatedAt).toLocaleString('ru-RU'))
    ]),
    item.notes
      ? el('div', { class: 'rounded-2xl border border-ink-800 bg-ink-900/70 p-4' }, [
          el('span', { class: 'text-xs font-medium uppercase tracking-wide text-ink-400', text: 'Заметки' }),
          el('p', { class: 'mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-200', text: item.notes })
        ])
      : null,
    photoBlock(item.photo)
  ])

  return el('div', { class: 'flex h-full flex-col bg-ink-950' }, [
    el('div', {
      class: 'sticky top-0 z-10 border-b border-ink-800/80 bg-ink-950/90 px-4 py-3 backdrop-blur-xl'
    }, [header]),
    el('div', { class: 'flex-1 overflow-y-auto px-4 py-4 no-scrollbar' }, [body]),
    el('div', { class: 'safe-bottom' })
  ])
}

export function detailScreen({ item, onBack, onEdit, onToggleFavorite, onOpenUrl, onAppearanceChange, clipboardClearMs = 30000 }) {
  if (item.type === 'passport') {
    return { element: passportDetail({ item, onBack, onEdit }) }
  }
  const category = categoryOf(item.category)
  const typeLabel = item.type === 'otp' ? 'Одноразовый пароль' : item.type === 'note' ? 'Заметка' : 'Пароль'
  let revealed = false
  let clearTimer = null

  const passwordValue = el('span', { class: 'break-all font-mono text-base tracking-wide text-ink-50', text: '••••••••••' })
  const strength = el('div')

  const revealBtn = el('button', {
    class: 'rounded-xl p-2 text-ink-400 transition active:scale-90 hover:bg-ink-800 hover:text-ink-100',
    'aria-label': 'Показать пароль'
  })

  const syncReveal = () => {
    revealBtn.replaceChildren(icon(revealed ? ICONS.eyeOff : ICONS.eye, 'w-4.5 h-4.5'))
    passwordValue.textContent = revealed ? item.password : '••••••••••'
  }

  const scheduleClear = () => {
    if (clearTimer) clearTimeout(clearTimer)
    if (clipboardClearMs > 0) {
      clearTimer = setTimeout(async () => {
        await clearClipboard()
        toast('Буфер обмена очищен', 'info', 1600)
      }, clipboardClearMs)
    }
  }

  const copyPassword = async () => {
    await copyToClipboard(item.password)
    hapticLight()
    toast('Пароль скопирован', 'success', 1400)
    scheduleClear()
  }

  revealBtn.addEventListener('click', () => {
    revealed = !revealed
    syncReveal()
  })
  syncReveal()

  if (item.password) strength.replaceChildren(strengthMeter(item.password))

  const weakWarning =
    item.password && looksWeak(item.password)
      ? el('div', {
          class:
            'flex items-start gap-2 rounded-[6px] border border-warn-500/30 bg-warn-500/10 p-3 text-sm text-warn-400'
        }, [icon(ICONS.warning, 'w-4.5 h-4.5 shrink-0'), el('span', { text: 'Пароль выглядит слабым — стоит заменить его' })])
      : null


  const totpBlock = item.totpSecret
    ? el('div', { class: 'rounded-[6px] border border-brand-500/25 bg-brand-500/5 p-4' }, [
        el('div', { class: 'flex items-center justify-between' }, [
          el('span', { class: 'text-xs font-medium uppercase tracking-wide text-brand-300', text: 'Одноразовый код' }),
          el('span', { class: 'text-xs text-ink-500', text: item.totpIssuer || 'TOTP' })
        ]),
        el('div', { class: 'mt-2 flex items-center justify-between gap-3' }, [
          el('span', { class: 'font-mono text-2xl tracking-[0.3em] text-ink-50', text: '—' }),
          el('span', { class: 'font-mono text-sm text-ink-400', text: '00s' })
        ]),
        el('div', { class: 'mt-2 h-1 overflow-hidden rounded-full bg-ink-800' }, [
          el('div', { class: 'h-full w-full bg-brand-500 transition-[width] duration-300' })
        ])
      ])
    : null

  const updateTotp = async () => {
    if (!item.totpSecret || !totpBlock) return
    try {
      const result = await generateTotp(item.totpSecret)
      const codeNode = totpBlock.querySelector('.font-mono.text-2xl')
      const timeNode = totpBlock.querySelector('.font-mono.text-sm')
      const bar = totpBlock.querySelector('.h-full')
      codeNode.textContent = result.code
      timeNode.textContent = `${formatCountdown(result.remaining)}s`
      bar.style.width = `${(result.remaining / result.period) * 100}%`
    } catch {
      void 0
    }
  }

  if (totpBlock) {
    updateTotp()
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
      el('h1', { class: 'truncate text-lg font-semibold text-ink-50', text: item.title || 'Без названия' }),
      el('p', { class: 'truncate text-xs text-ink-500', text: typeLabel })
    ]),
    favoriteBtn,
    el('button', {
      class: 'rounded-xl p-2.5 text-ink-300 transition active:scale-90 hover:bg-ink-800',
      'aria-label': 'Изменить',
      onclick: onEdit
    }, [icon(ICONS.edit, 'w-5 h-5')])
  ])

  // Rows read label over value, like the reference layout.
  const fieldRow = (label, valueNode, action = null) =>
    el('div', { class: 'border-b border-ink-800/70 px-4 py-3 last:border-0' }, [
      el('p', { class: 'text-xs font-medium tracking-wide text-ink-500 uppercase', text: label }),
      el('div', { class: 'mt-1 flex items-end justify-between gap-3' }, [
        el('div', { class: 'min-w-0 flex-1 truncate text-sm text-ink-100' }, [valueNode]),
        action
      ])
    ])

  let avatarIconName = item.icon && ICONS[item.icon] ? item.icon : defaultAvatarIcon(item.type)
  let avatarColor = item.iconColor || category.color

  const avatarBadge = el('span', {
    class:
      'absolute -right-0.5 -bottom-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-ink-900 bg-ink-800 text-ink-300'
  }, [icon(ICONS.edit, 'w-3 h-3')])

  const avatar = el('button', {
    type: 'button',
    class: 'relative flex h-16 w-16 items-center justify-center rounded-full text-ink-950 transition active:scale-95',
    'aria-label': 'Изменить иконку',
    style: { backgroundColor: avatarColor }
  })

  const paintAvatar = () => {
    avatar.style.backgroundColor = avatarColor
    avatar.replaceChildren(icon(ICONS[avatarIconName] ?? ICONS.globe, 'w-7 h-7'), avatarBadge)
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

  const hero = el('div', { class: 'rounded-[6px] border border-ink-800 bg-ink-900/70 p-5 text-center' }, [
    el('div', { class: 'flex justify-center' }, [avatar]),
    el('h1', { class: 'mt-3 break-words text-xl font-semibold text-ink-50', text: item.title || 'Без названия' }),
    item.username
      ? el('p', { class: 'mt-1 break-all text-sm text-ink-400', text: item.username })
      : null
  ])

  const copyAction = (value, message) =>
    el('button', {
      class: 'rounded-lg p-1.5 text-ink-400 transition active:scale-90 hover:bg-ink-800 hover:text-ink-100',
      'aria-label': `Скопировать: ${message}`,
      onclick: async () => {
        await copyToClipboard(value)
        toast(message, 'success', 1400)
      }
    }, [icon(ICONS.copy, 'w-5 h-5')])

  const passwordRow = item.password
    ? el('div', { class: 'border-b border-ink-800/70 px-4 py-3 last:border-0' }, [
        el('p', { class: 'text-xs font-medium tracking-wide text-ink-500 uppercase', text: 'Пароль' }),
        el('div', { class: 'mt-1 flex items-end justify-between gap-3' }, [
          el('div', { class: 'min-w-0 flex-1 truncate' }, [passwordValue]),
          el('div', { class: 'flex shrink-0 items-center gap-0.5' }, [
            revealBtn,
            el('button', {
              class: 'rounded-xl p-2 text-ink-400 transition active:scale-90 hover:bg-ink-800 hover:text-ink-100',
              'aria-label': 'Скопировать пароль',
              onclick: copyPassword
            }, [icon(ICONS.copy, 'w-4.5 h-4.5')])
          ])
        ]),
        el('div', { class: 'mt-3' }, [strength])
      ])
    : null

  const factRows = [
    item.username
      ? fieldRow('Логин', item.username, copyAction(item.username, 'Логин скопирован'))
      : null,
    passwordRow,
    item.url
      ? fieldRow('Сайт', item.url, el('button', {
          class: 'shrink-0 text-xs font-semibold text-brand-300 hover:text-brand-200',
          text: 'Открыть',
          onclick: () => onOpenUrl(item.url)
        }))
      : null,
    item.totpIssuer ? fieldRow('Издатель', item.totpIssuer) : null
  ].filter(Boolean)

  const facts = factRows.length
    ? el('div', { class: 'rounded-[6px] border border-ink-800 bg-ink-900/70' }, factRows)
    : null

  const body = el('div', { class: 'space-y-4 pb-2' }, [
    hero,
    weakWarning,
    totpBlock,
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

  if (totpBlock) {
    // The interval dies with the screen: without this it kept generating codes
    // and holding the item (password, TOTP secret) in memory after navigation
    // and after the vault was locked.
    const timer = setInterval(() => {
      if (!root.isConnected) {
        clearInterval(timer)
        return
      }
      updateTotp()
    }, 1000)
  }

  return { element: root }
}
