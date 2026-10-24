import { el, icon, ICONS } from '../dom.js'
import { openModal, closeTopModal } from './feedback.js'
import { strengthOf } from '../../core/generator.js'
import { formatIsoDate } from '../../core/format.js'

export function field({ label, value = '', type = 'text', placeholder = '', hint = '', icon: iconPath, inputmode, autocomplete, reveal = false, action = null }) {
  const wrap = el('label', { class: 'block space-y-1.5' })
  if (label) {
    wrap.append(el('span', { class: 'text-xs font-medium uppercase tracking-wide text-ink-400', text: label }))
  }
  const row = el('div', { class: 'relative flex items-center' })
  if (iconPath) {
    row.append(icon(iconPath, 'pointer-events-none absolute left-3.5 w-4.5 h-4.5 text-ink-500'))
  }
  const input = el('input', {
    type,
    value,
    placeholder,
    inputmode,
    autocomplete,
    class: `w-full ${iconPath ? 'pl-11' : ''} ${reveal || action ? 'pr-12' : ''}`
  })
  row.append(input)
  if (reveal) {
    const eye = revealToggle()
    eye.classList.add('absolute', 'right-2', 'top-1/2', '-translate-y-1/2')
    row.append(eye)
  }
  if (action) {
    const button = el('button', {
      type: 'button',
      class:
        'absolute right-2 top-1/2 -translate-y-1/2 rounded-xl p-2.5 text-ink-400 transition active:scale-95 hover:bg-ink-800 hover:text-ink-100',
      'aria-label': action.label,
      onclick: (event) => {
        // The field is wrapped in a label: without this the click would also
        // focus the input and the scanner would open behind the keyboard.
        event.preventDefault()
        action.onClick?.()
      }
    }, [icon(action.icon, 'w-4.5 h-4.5')])
    row.append(button)
    wrap.actionButton = button
  }
  wrap.append(row)
  if (hint) wrap.append(el('p', { class: 'text-xs text-ink-500', text: hint }))
  wrap.input = input
  return wrap
}

export function dateField({ label, value = '' }) {
  const wrap = el('div', { class: 'block space-y-1.5' })
  if (label) {
    wrap.append(el('span', { class: 'text-xs font-medium uppercase tracking-wide text-ink-400', text: label }))
  }
  const hidden = el('input', { type: 'hidden', value })
  const current = el('span', {})
  const sync = () => {
    const formatted = formatIsoDate(hidden.value)
    current.textContent = formatted || 'Не указана'
    current.className = formatted
      ? 'truncate text-[15px] font-medium text-ink-50'
      : 'truncate text-[15px] font-medium text-ink-500'
  }
  const trigger = el('button', {
    type: 'button',
    class:
      'flex w-full items-center justify-between gap-3 rounded-xl border border-ink-800 bg-ink-900 px-3.5 py-2.5 text-left transition active:scale-[0.99] hover:border-ink-700 hover:bg-ink-800',
    onclick: () => openDatePicker({ title: label, value: hidden.value, onPick: (iso) => { hidden.value = iso; sync() } })
  }, [current, el('span', { class: 'text-ink-500' }, [icon(ICONS.calendar, 'w-4.5 h-4.5')])])
  sync()
  wrap.append(hidden, trigger)
  wrap.input = hidden
  return wrap
}

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

function toIso(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function openDatePicker({ title, value, onPick }) {
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const start = parsed ? new Date(Number(parsed[1]), Number(parsed[2]) - 1, Number(parsed[3])) : new Date()
  let cursor = { year: start.getFullYear(), month: start.getMonth() }
  let selected = parsed ? value : ''
  const today = toIso(new Date())

  const titleNode = el('div', { class: 'text-center text-sm font-semibold text-ink-100' })
  const grid = el('div', { class: 'mt-2 grid grid-cols-7 gap-1' })
  const step = (delta) => {
    const next = new Date(cursor.year, cursor.month + delta, 1)
    cursor = { year: next.getFullYear(), month: next.getMonth() }
    render()
  }
  const render = () => {
    titleNode.textContent = `${MONTHS[cursor.month]} ${cursor.year}`
    grid.replaceChildren()
    const offset = (new Date(cursor.year, cursor.month, 1).getDay() + 6) % 7
    const days = new Date(cursor.year, cursor.month + 1, 0).getDate()
    for (let i = 0; i < offset; i += 1) grid.append(el('span'))
    for (let day = 1; day <= days; day += 1) {
      const iso = toIso(new Date(cursor.year, cursor.month, day))
      const isSelected = iso === selected
      const isToday = iso === today
      grid.append(el('button', {
        type: 'button',
        class: `flex h-9 items-center justify-center rounded-lg text-sm transition active:scale-90 ${
          isSelected
            ? 'bg-brand-500 font-semibold text-white'
            : isToday
              ? 'border border-brand-500/40 text-brand-200'
              : 'text-ink-200 hover:bg-ink-800'
        }`,
        text: String(day),
        onclick: () => {
          selected = iso
          onPick(iso)
          closeTopModal()
        }
      }))
    }
  }

  const body = el('div', {}, [
    el('div', { class: 'flex items-center justify-between' }, [
      el('button', {
        type: 'button',
        class: 'rounded-lg p-2 text-ink-300 transition active:scale-90 hover:bg-ink-800',
        'aria-label': 'Предыдущий месяц',
        onclick: () => step(-1)
      }, [icon(ICONS.back, 'w-4 h-4')]),
      titleNode,
      el('button', {
        type: 'button',
        class: 'rounded-lg p-2 text-ink-300 transition active:scale-90 hover:bg-ink-800',
        'aria-label': 'Следующий месяц',
        onclick: () => step(1)
      }, [icon(ICONS.back, 'w-4 h-4 rotate-180')])
    ]),
    el('div', { class: 'mt-2 grid grid-cols-7 gap-1 text-center text-[11px] uppercase tracking-wide text-ink-500' },
      WEEKDAYS.map((weekday) => el('span', { text: weekday }))),
    grid
  ])

  openModal({
    title: title || 'Дата',
    body,
    actions: [
      { label: 'Очистить', onClick: () => { onPick(''); return true } },
      { label: 'Сегодня', primary: true, onClick: () => { onPick(today); return true } }
    ]
  })
  render()
}

export function textareaField({ label, value = '', placeholder = '', rows = 4 }) {
  const wrap = el('label', { class: 'block space-y-1.5' })
  if (label) {
    wrap.append(el('span', { class: 'text-xs font-medium uppercase tracking-wide text-ink-400', text: label }))
  }
  const area = el('textarea', { placeholder, rows, class: 'w-full resize-none' })
  area.value = value
  wrap.append(area)
  wrap.input = area
  return wrap
}

export function selectField({ label, value = '', options = [], onChange }) {
  const wrap = el('div', { class: 'block space-y-1.5' })
  if (label) {
    wrap.append(el('span', { class: 'text-xs font-medium uppercase tracking-wide text-ink-400', text: label }))
  }

  const hidden = el('input', { type: 'hidden', value })
  const current = el('span', { class: 'truncate text-[15px] font-medium text-ink-50' })
  const state = { value: value || options[0]?.value || '' }

  const sync = () => {
    const found = options.find((option) => option.value === state.value) ?? options[0]
    current.textContent = found?.label ?? ''
    hidden.value = state.value
  }

  const trigger = el('button', {
    type: 'button',
    class:
      'flex w-full items-center justify-between gap-3 rounded-xl border border-ink-800 bg-ink-900 px-3.5 py-2.5 text-left transition active:scale-[0.99] hover:border-ink-700 hover:bg-ink-800'
  }, [current, el('span', { class: 'text-ink-500' }, [icon(ICONS.chevronDown, 'w-4 h-4')])])

  trigger.addEventListener('click', () => {
    const body = el('div', { class: 'overflow-hidden rounded-2xl border border-ink-800' },
      options.map((option, index) => {
        const selected = option.value === state.value
        return el('button', {
          type: 'button',
          class: `flex w-full items-center justify-between gap-3 bg-ink-900/70 px-4 py-3.5 text-left text-[15px] transition active:bg-ink-800 hover:bg-ink-800 ${
            index ? 'border-t border-ink-800' : ''
          }`,
          onclick: () => {
            state.value = option.value
            sync()
            onChange?.(option.value)
            closeTopModal()
          }
        }, [
          el('span', { class: selected ? 'font-semibold text-ink-50' : 'text-ink-200', text: option.label }),
          el('span', {
            class: `flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
              selected ? 'border-brand-400' : 'border-ink-600'
            }`
          }, [selected ? el('span', { class: 'h-2.5 w-2.5 rounded-full bg-brand-400' }) : null])
        ])
      })
    )
    openModal({ title: label || 'Выберите значение', body })
  })

  sync()
  wrap.append(trigger, hidden)
  wrap.input = hidden
  return wrap
}

export function switchField({ label, description = '', checked = false, onChange }) {
  let on = Boolean(checked)
  const text = el('div', { class: 'min-w-0' }, [
    el('p', { class: 'text-sm font-medium text-ink-100', text: label }),
    description ? el('p', { class: 'mt-0.5 text-xs text-ink-500', text: description }) : null
  ])
  const knob = el('div', { class: 'absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform' })
  const track = el('div', { class: 'relative h-7 w-12 shrink-0 rounded-full transition' }, [knob])
  const sync = () => {
    track.className = `relative h-7 w-12 shrink-0 rounded-full transition ${on ? 'bg-brand-500' : 'bg-ink-700'}`
    knob.className = `absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
      on ? 'translate-x-5' : ''
    }`
  }
  const button = el('button', {
    type: 'button',
    class: 'flex w-full cursor-pointer items-center justify-between gap-4 py-1 text-left',
    onclick: () => {
      on = !on
      button.setAttribute('aria-checked', String(on))
      sync()
      onChange?.(on)
    }
  }, [text, track])
  button.setAttribute('role', 'switch')
  button.setAttribute('aria-checked', String(on))
  button.setAttribute('aria-label', label)
  sync()
  return button
}

export function strengthMeter(value) {
  const info = strengthOf(value)
  const bars = el('div', { class: 'flex gap-1' })
  for (let i = 0; i < 5; i += 1) {
    bars.append(
      el('div', {
        class: `h-1.5 flex-1 rounded-full transition-colors ${
          i < info.score ? info.color : 'bg-ink-700'
        }`
      })
    )
  }
  return el('div', { class: 'space-y-1.5' }, [
    el('div', { class: 'flex items-center justify-between text-xs' }, [
      el('span', { class: 'text-ink-400', text: 'Надёжность' }),
      el('span', { class: `font-semibold ${info.score >= 3 ? 'text-ok-400' : info.score >= 2 ? 'text-warn-400' : 'text-danger-400'}`, text: info.label })
    ]),
    bars,
    el('p', { class: 'text-xs text-ink-500', text: `Энтропия ≈ ${info.entropy} бит` })
  ])
}

export function revealToggle(getValue) {
  let revealed = false
  const button = el('button', {
    type: 'button',
    class: 'rounded-xl p-2.5 text-ink-400 transition active:scale-95 hover:bg-ink-800 hover:text-ink-100',
    'aria-label': 'Показать пароль'
  })
  const sync = () => {
    button.setAttribute('aria-label', revealed ? 'Скрыть пароль' : 'Показать пароль')
    button.replaceChildren(icon(revealed ? ICONS.eyeOff : ICONS.eye, 'w-5 h-5'))
  }
  sync()
  button.addEventListener('click', () => {
    revealed = !revealed
    sync()
    const input = button.parentElement?.querySelector('input')
    if (input) input.type = revealed ? 'text' : 'password'
  })
  button.revealed = () => revealed
  return button
}
