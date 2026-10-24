import { el, icon, ICONS } from '../dom.js'
import { CATEGORY_COLORS } from '../../core/store.js'
import { field } from '../components/form.js'
import { toast, openModal, closeTopModal } from '../components/feedback.js'

export function categoriesScreen({ categories, onBack, onAdd, onEdit, onDelete }) {
  const openEditor = (category = null) => {
    const nameField = field({
      label: 'Название',
      value: category?.label ?? '',
      placeholder: 'Например, Банки'
    })
    let color = category?.color ?? CATEGORY_COLORS[0]

    const swatches = CATEGORY_COLORS.map((value) => {
      const button = el('button', {
        type: 'button',
        class: 'h-9 w-9 rounded-full border border-white/10 ring-2 ring-offset-2 ring-offset-ink-900 transition active:scale-95',
        style: { backgroundColor: value },
        'aria-label': `Цвет ${value}`
      })
      const sync = () => {
        button.className = `h-9 w-9 rounded-full border border-white/10 ring-2 ring-offset-2 ring-offset-ink-900 transition active:scale-95 ${
          color === value ? 'ring-white' : 'ring-transparent'
        }`
      }
      button.addEventListener('click', () => {
        color = value
        for (const item of swatches) item.sync()
      })
      button.sync = sync
      sync()
      return button
    })

    openModal({
      title: category ? 'Изменить категорию' : 'Новая категория',
      body: el('div', { class: 'space-y-3' }, [
        nameField,
        el('div', { class: 'space-y-2' }, [
          el('span', { class: 'text-xs font-medium tracking-wide text-ink-400 uppercase', text: 'Цвет' }),
          el('div', { class: 'flex flex-wrap gap-2' }, swatches)
        ])
      ]),
      actions: [
        {
          label: 'Сохранить',
          primary: true,
          onClick: async () => {
            const label = nameField.input.value.trim()
            if (!label) {
              toast('Введите название', 'error')
              return false
            }
            await (category ? onEdit(category.id, { label, color }) : onAdd({ label, color }))
            closeTopModal()
          }
        }
      ]
    })
    setTimeout(() => nameField.input.focus(), 120)
  }

  const rows = categories.map((category) =>
    el('div', {
      class: 'flex items-center gap-3 rounded-2xl border border-ink-800 bg-ink-900/70 p-3'
    }, [
      el('span', { class: 'h-8 w-8 shrink-0 rounded-full', style: { backgroundColor: category.color } }),
      el('span', { class: 'min-w-0 flex-1 truncate text-sm font-semibold text-ink-100', text: category.label }),
      el('button', {
        class: 'rounded-xl p-2.5 text-ink-400 transition active:scale-90 hover:bg-ink-800 hover:text-ink-100',
        'aria-label': `Изменить ${category.label}`,
        onclick: () => openEditor(category)
      }, [icon(ICONS.edit, 'w-4.5 h-4.5')]),
      el('button', {
        class: 'rounded-xl p-2.5 text-danger-400 transition active:scale-90 hover:bg-danger-500/15',
        'aria-label': `Удалить ${category.label}`,
        onclick: () => onDelete(category)
      }, [icon(ICONS.trash, 'w-4.5 h-4.5')])
    ])
  )

  const addButton = el('button', {
    class:
      'flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-ink-700 py-3 text-sm font-semibold text-ink-300 transition active:scale-[0.98] hover:border-ink-600 hover:bg-ink-900',
    onclick: () => openEditor(null)
  }, [icon(ICONS.plus, 'w-4.5 h-4.5'), el('span', { text: 'Добавить категорию' })])

  const header = el('div', { class: 'flex items-center gap-3' }, [
    el('button', {
      class: 'rounded-xl p-2.5 text-ink-300 transition active:scale-90 hover:bg-ink-800',
      'aria-label': 'Назад',
      onclick: onBack
    }, [icon(ICONS.back, 'w-5 h-5')]),
    el('h1', { class: 'flex-1 text-lg font-semibold text-ink-50', text: 'Категории' })
  ])

  return {
    element: el('div', { class: 'flex h-full flex-col bg-ink-950' }, [
      el('div', { class: 'border-b border-ink-800/80 bg-ink-950/90 px-4 py-3 backdrop-blur-xl' }, [header]),
      el('div', { class: 'flex-1 overflow-y-auto px-4 py-4 no-scrollbar' }, [
        el('div', { class: 'space-y-2' }, [...rows, addButton])
      ]),
      el('div', { class: 'safe-bottom' })
    ])
  }
}
