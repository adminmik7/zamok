import { el, icon, ICONS } from '../dom.js'
import { toast, openModal } from '../components/feedback.js'
import { strengthMeter } from '../components/form.js'
import { estimateEntropy, generatePassphrase, generatePassword } from '../../core/generator.js'
import { copyToClipboard } from '../../platform/native.js'

function createGenerator() {
  const state = {
    mode: 'password',
    length: 16,
    lower: true,
    upper: true,
    digits: true,
    symbols: true,
    excludeSimilar: false,
    words: 4,
    separator: '-',
    capitalize: false
  }

  const output = el('div', {
    class:
      'rounded-2xl border border-ink-800 bg-ink-950 px-4 py-5 text-center font-mono text-lg break-all text-ink-50 select-all'
  })
  const meter = el('div')
  const entropyHint = el('p', { class: 'text-center text-xs text-ink-500' })
  const modes = el('div', { class: 'grid grid-cols-2 gap-2' })
  const lengthWrap = el('div', { class: 'space-y-2' })
  const options = el('div', { class: 'space-y-1' })

  const render = () => {
    const value =
      state.mode === 'password'
        ? generatePassword(state)
        : generatePassphrase(state.words, state.separator, state.capitalize)
    output.textContent = value
    meter.replaceChildren(strengthMeter(value))
    entropyHint.textContent = `Энтропия ≈ ${estimateEntropy(value)} бит`
  }

  const toggle = (label, key, hint = '') => {
    const wrap = el('label', { class: 'flex items-center justify-between gap-3 py-1.5' })
    const text = el('div', {}, [
      el('span', { class: 'text-sm text-ink-200', text: label }),
      hint ? el('span', { class: 'block text-xs text-ink-500', text: hint }) : null
    ])
    const input = el('input', { type: 'checkbox', class: 'peer sr-only' })
    input.checked = state[key]
    const track = el('div', {
      class:
        'relative h-6 w-11 shrink-0 rounded-full bg-ink-700 transition peer-checked:bg-brand-500 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-400/60'
    })
    track.append(
      el('div', { class: 'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5' })
    )
    input.addEventListener('change', () => {
      state[key] = input.checked
      render()
    })
    wrap.append(text, el('div', { class: 'relative' }, [input, track]))
    return wrap
  }



  const syncModes = () => {
    for (const button of modes.querySelectorAll('button')) {
      const active = button.dataset.mode === state.mode
      button.className = `rounded-xl px-3 py-2 text-sm font-semibold transition ${
        active ? 'bg-brand-500 text-white shadow-soft' : 'bg-ink-800 text-ink-300 hover:bg-ink-700'
      }`
    }
  }

  const syncLength = () => {
    const isPassword = state.mode === 'password'
    lengthWrap.replaceChildren(
      el('div', { class: 'flex items-center justify-between text-sm' }, [
        el('span', { class: 'text-ink-300', text: isPassword ? 'Длина' : 'Слов' }),
        el('span', { class: 'font-semibold text-ink-50', text: String(isPassword ? state.length : state.words) })
      ])
    )
    const range = el('input', {
      type: 'range',
      min: isPassword ? 6 : 3,
      max: isPassword ? 64 : 8,
      value: isPassword ? state.length : state.words,
      class: 'w-full accent-brand-500'
    })
    range.addEventListener('input', () => {
      if (isPassword) state.length = Number(range.value)
      else state.words = Number(range.value)
      syncLength()
      render()
    })
    lengthWrap.append(range)
  }

  const syncOptions = () => {
    const children = []
    if (state.mode === 'password') {
      children.push(
        toggle('Строчные', 'lower'),
        toggle('Прописные', 'upper'),
        toggle('Цифры', 'digits'),
        toggle('Спецсимволы', 'symbols'),
        toggle('Исключить похожие', 'excludeSimilar', 'I l 1 O 0 o')
      )
    } else {
      children.push(
        toggle('С заглавной', 'capitalize'),
        el('div', { class: 'flex items-center justify-between gap-3 py-1.5' }, [
          el('span', { class: 'text-sm text-ink-200', text: 'Разделитель' }),
          el('input', {
            type: 'text',
            value: state.separator,
            maxlength: 3,
            class: 'w-20 text-center',
            oninput: (event) => {
              state.separator = event.target.value
              render()
            }
          })
        ])
      )
    }
    options.replaceChildren(...children)
  }

  const modeButton = (id, label) =>
    el('button', {
      class: 'rounded-xl px-3 py-2 text-sm font-semibold transition',
      text: label,
      dataset: { mode: id },
      onclick: () => {
        state.mode = id
        syncModes()
        syncLength()
        syncOptions()
        render()
      }
    })

  modes.append(modeButton('password', 'Пароль'), modeButton('passphrase', 'Слова'))

  const body = el('div', { class: 'space-y-4' }, [
    modes,
    el('div', { class: 'space-y-3' }, [output, meter, entropyHint]),
    lengthWrap,
    options,
    el('div', { class: 'grid grid-cols-2 gap-2' }, [
      el('button', {
        class: 'flex items-center justify-center gap-2 rounded-xl bg-ink-800 py-2.5 text-sm font-semibold text-ink-200 transition active:scale-95 hover:bg-ink-700',
        onclick: () => {
          render()
          toast('Обновлено', 'success', 1200)
        }
      }, [icon(ICONS.refresh, 'w-4 h-4'), el('span', { text: 'Обновить' })]),
      el('button', {
        class: 'flex items-center justify-center gap-2 rounded-xl bg-ink-800 py-2.5 text-sm font-semibold text-ink-200 transition active:scale-95 hover:bg-ink-700',
        onclick: async () => {
          await copyToClipboard(output.textContent)
          toast('Скопировано', 'success', 1400)
        }
      }, [icon(ICONS.copy, 'w-4 h-4'), el('span', { text: 'Копировать' })])
    ])
  ])

  syncModes()
  syncLength()
  syncOptions()
  render()

  return {
    element: body,
    value: () => output.textContent
  }
}

export function openGenerator(onPick) {
  const generator = createGenerator()
  openModal({
    title: 'Генератор',
    subtitle: 'Надёжные пароли и парольные фразы',
    body: generator.element,
    actions: [
      { label: 'Использовать', primary: true, onClick: () => onPick(generator.value()) }
    ]
  })
}
