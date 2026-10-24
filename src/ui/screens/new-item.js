import { el, icon, ICONS } from '../dom.js'

export const NEW_ITEM_TYPES = [
  {
    id: 'password',
    label: 'Пароль',
    description: 'Логин, пароль и сайт',
    icon: ICONS.globe,
    preset: { type: 'login' }
  },
  {
    id: 'card',
    label: 'Банковская карта',
    description: 'Номер, срок действия, CVV',
    icon: ICONS.card,
    preset: { type: 'card', category: 'finance', focus: 'cardNumber' }
  },
  {
    id: 'passport',
    label: 'Паспорт',
    description: 'Серия, номер, кем выдан',
    icon: ICONS.id,
    preset: {
      type: 'passport',
      category: 'personal',
      title: 'Паспорт'
    }
  },
  {
    id: 'note',
    label: 'Заметка',
    description: 'Произвольный текст',
    icon: ICONS.note,
    preset: { type: 'note', focus: 'notes' }
  },
  {
    id: 'loyalty',
    label: 'Скидочная карта',
    description: 'Магазин и штрихкод',
    icon: ICONS.percent,
    preset: { type: 'loyalty', focus: 'loyaltyBarcode' }
  }
]

export function newItemScreen({ onBack, onPick }) {
  const header = el('div', { class: 'flex items-center gap-3' }, [
    el('button', {
      class: 'rounded-xl p-2.5 text-ink-300 transition active:scale-90 hover:bg-ink-800',
      'aria-label': 'Назад',
      onclick: onBack
    }, [icon(ICONS.back, 'w-5 h-5')]),
    el('h1', { class: 'flex-1 text-lg font-semibold text-ink-50', text: 'Новая запись' })
  ])

  const options = NEW_ITEM_TYPES.map((type) =>
    el('button', {
      class:
        'flex w-full items-center justify-between gap-3 rounded-2xl border border-ink-800 bg-ink-900/70 p-4 text-left transition active:scale-[0.99] hover:border-ink-700 hover:bg-ink-900',
      onclick: () => onPick(type)
    }, [
      el('span', { class: 'min-w-0' }, [
        el('span', { class: 'block text-sm font-semibold text-ink-50', text: type.label }),
        el('span', { class: 'mt-0.5 block text-xs text-ink-500', text: type.description })
      ]),
      el('span', {
        class: 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white shadow-soft'
      }, [icon(type.icon, 'w-5 h-5')])
    ])
  )

  const root = el('div', { class: 'flex h-full flex-col bg-ink-950' }, [
    el('div', { class: 'border-b border-ink-800/80 bg-ink-950/90 px-4 py-3 backdrop-blur-xl' }, [header]),
    el('div', { class: 'flex-1 overflow-y-auto px-4 py-4 no-scrollbar' }, [
      el('div', { class: 'space-y-2' }, [
        el('p', { class: 'px-1 pb-1 text-sm text-ink-400', text: 'Что добавить?' }),
        ...options
      ])
    ]),
    el('div', { class: 'safe-bottom' })
  ])

  return { element: root }
}
