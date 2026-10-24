import { el, icon, ICONS } from '../dom.js'
import { toast } from '../components/feedback.js'
import { revealToggle } from '../components/form.js'
import { hapticLight } from '../../platform/native.js'

export function unlockScreen({ mode, onSubmit, onBiometric, onReset, biometricsReady }) {
  if (mode === 'corrupt') {
    const root = el('div', {
      class: 'flex h-full flex-col items-center justify-center gap-6 overflow-y-auto bg-ink-950 px-6 py-10 no-scrollbar'
    }, [
      el('div', { class: 'w-full max-w-sm space-y-5 text-center' }, [
        el('div', {
          class: 'mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-danger-500/15 text-danger-400'
        }, [icon(ICONS.warning, 'w-9 h-9')]),
        el('div', { class: 'space-y-2' }, [
          el('h1', { class: 'text-xl font-semibold text-ink-50', text: 'Хранилище повреждено' }),
          el('p', {
            class: 'text-sm leading-relaxed text-ink-400',
            text: 'Файл хранилища не читается, поэтому записи нельзя расшифровать. Создание нового хранилища сотрёт повреждённые данные.'
          })
        ]),
        el('button', {
          class: 'w-full rounded-2xl bg-danger-500/15 py-3 text-sm font-semibold text-danger-400 transition active:scale-[0.98] hover:bg-danger-500/25',
          text: 'Начать заново',
          onclick: () => onReset?.()
        })
      ])
    ])
    return { element: root, focus: () => {} }
  }

  const isCreate = mode === 'create'
  const password = el('input', {
    type: 'password',
    placeholder: isCreate ? 'Придумайте мастер-пароль' : 'Мастер-пароль',
    autocomplete: isCreate ? 'new-password' : 'current-password',
    class: 'w-full px-12 text-center text-lg tracking-wide'
  })
  const confirm = el('input', {
    type: 'password',
    placeholder: 'Повторите мастер-пароль',
    autocomplete: 'new-password',
    class: 'w-full px-12 text-center text-lg tracking-wide'
  })
  const withReveal = (input) => {
    const eye = revealToggle()
    eye.classList.add('absolute', 'right-2', 'top-1/2', '-translate-y-1/2')
    return el('div', { class: 'relative flex items-center' }, [input, eye])
  }
  const error = el('p', { class: 'hidden text-center text-sm text-danger-400' })
  const submit = el('button', {
    class:
      'flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 py-3.5 text-base font-semibold text-white shadow-soft transition active:scale-[0.98] hover:bg-brand-400'
  }, [
    icon(isCreate ? ICONS.shield : ICONS.lock, 'w-5 h-5'),
    el('span', { text: isCreate ? 'Создать хранилище' : 'Разблокировать' })
  ])

  const showError = (message) => {
    error.textContent = message
    error.classList.remove('hidden')
  }

  const doSubmit = async () => {
    if (submit.disabled) return
    error.classList.add('hidden')
    const value = password.value
    if (!value) {
      showError('Введите мастер-пароль')
      return
    }
    if (isCreate) {
      if (value.length < 8) {
        showError('Минимум 8 символов')
        return
      }
      if (value !== confirm.value) {
        showError('Пароли не совпадают')
        return
      }
    }
    submit.disabled = true
    submit.classList.add('opacity-60')
    const ok = await onSubmit(value)
    if (!ok) {
      submit.disabled = false
      submit.classList.remove('opacity-60')
    }
  }

  submit.addEventListener('click', doSubmit)
  password.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') doSubmit()
  })
  confirm.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') doSubmit()
  })

  const card = el('div', { class: 'w-full max-w-sm space-y-6' }, [
    el('div', { class: 'flex flex-col items-center gap-3 text-center' }, [
      el('img', {
        src: './logo.png',
        alt: 'Zamok',
        class: 'h-20 w-20 drop-shadow-xl'
      }),
      el('h1', { class: 'text-2xl font-semibold tracking-tight text-ink-50' }, [
        el('span', { class: 'text-gradient', text: 'Zamok' })
      ]),
      el('p', {
        class: 'text-sm text-ink-400',
        text: isCreate
          ? 'Создайте мастер-пароль — он шифрует хранилище и не может быть восстановлен'
          : 'Введите мастер-пароль для доступа к хранилищу'
      })
    ]),
    el('div', { class: 'space-y-3' }, [
      withReveal(password),
      isCreate ? withReveal(confirm) : null,
      error,
      submit
    ]),
    biometricsReady
      ? el('button', {
          class:
            'flex w-full items-center justify-center gap-2 rounded-2xl border border-ink-800 bg-ink-900/60 py-3 text-sm font-semibold text-ink-200 transition active:scale-[0.98] hover:bg-ink-800',
          onclick: async () => {
            await onBiometric()
          }
        }, [icon(ICONS.fingerprint, 'w-5 h-5'), el('span', { text: 'Войти по биометрии' })])
      : null
  ])

  const root = el('div', {
    class:
      'flex h-full flex-col items-center justify-center gap-6 overflow-y-auto bg-ink-950 px-6 py-10 no-scrollbar'
  }, [card])

  return { element: root, focus: () => {} }
}
