import { el, icon, ICONS } from '../dom.js'
import { switchField, selectField } from '../components/form.js'
import { openModal, confirmDialog, toast } from '../components/feedback.js'
import { copyToClipboard, hapticLight } from '../../platform/native.js'

export function settingsScreen({ settings, onBack, onChange, onChangeMaster, onExport, onImport, onManageToken, serverProfile = '', onDeleteVault, onManageCategories, biometricsAvailable, appVersion = '', update = null, onCheckUpdate, onDownloadUpdate, onOpenRelease }) {
  const autoLockField = selectField({
    label: 'Автоблокировка',
    value: String(settings.autoLockMs),
    options: [
      { value: '0', label: 'Никогда' },
      { value: '30000', label: '30 секунд' },
      { value: '60000', label: '1 минута' },
      { value: '300000', label: '5 минут' },
      { value: '900000', label: '15 минут' }
    ],
    onChange: (value) => onChange({ autoLockMs: Number(value) })
  })

  const clipboardField = selectField({
    label: 'Очистка буфера обмена',
    value: String(settings.clipboardClearMs),
    options: [
      { value: '0', label: 'Никогда' },
      { value: '15000', label: '15 секунд' },
      { value: '30000', label: '30 секунд' },
      { value: '60000', label: '1 минута' }
    ],
    onChange: (value) => onChange({ clipboardClearMs: Number(value) })
  })

  const biometricsField = switchField({
    label: 'Вход по биометрии',
    description: biometricsAvailable
      ? 'Разблокировка отпечатком или PIN'
      : 'Устройство не поддерживает биометрию',
    checked: settings.biometrics && biometricsAvailable,
    onChange: (value) => onChange({ biometrics: value })
  })

  const secureScreenField = switchField({
    label: 'Защита экрана',
    description: 'Скрывает приложение в недавних и запрещает скриншоты',
    checked: settings.secureScreen !== false,
    onChange: (value) => onChange({ secureScreen: value })
  })

  const section = (title, children) =>
    el('div', { class: 'rounded-[6px] border border-ink-800 bg-ink-900/70 p-4' }, [
      el('p', { class: 'mb-3 text-xs font-medium uppercase tracking-wide text-ink-500', text: title }),
      el('div', { class: 'space-y-3' }, children)
    ])

  const actionRow = ({ iconPath, title, description, onClick }) =>
    el('button', {
      class:
        'flex w-full items-center gap-3 rounded-[6px] border border-ink-800 bg-ink-900/60 p-3 text-left transition active:scale-[0.99] hover:border-ink-700 hover:bg-ink-900',
      onclick: onClick
    }, [
      el('span', { class: 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-brand-300' }, [
        icon(iconPath, 'w-4.5 h-4.5')
      ]),
      el('span', { class: 'min-w-0 flex-1' }, [
        el('span', { class: 'block text-sm font-semibold text-ink-100', text: title }),
        el('span', { class: 'mt-0.5 block text-xs text-ink-500', text: description })
      ]),
      el('span', { class: 'text-ink-600' }, [icon(ICONS.back, 'w-4 h-4 rotate-180')])
    ])

  const version = appVersion || '1.0'

  const updateStatusText = el('p', { class: 'text-sm text-ink-400' })
  const updateCheckButton = el('button', {
    class:
      'w-full rounded-xl bg-ink-800 py-2.5 text-sm font-semibold text-ink-200 transition active:scale-[0.98] hover:bg-ink-700',
    text: 'Проверить обновления',
    onclick: () => runUpdateCheck()
  })
  const updateDownloadButton = el('button', {
    class:
      'hidden w-full rounded-xl bg-brand-500 py-2.5 text-sm font-semibold text-white shadow-soft transition active:scale-[0.98] hover:bg-brand-400',
    text: 'Скачать обновление',
    onclick: () => runUpdateDownload()
  })
  const updateReleaseButton = el('button', {
    class: 'w-full text-center text-xs text-ink-500 underline-offset-2 transition hover:text-ink-300 hover:underline',
    text: 'Открыть страницу релиза',
    onclick: () => onOpenRelease?.()
  })

  let updateRelease = null

  const setUpdateStatus = (status, release = null, error = null) => {
    updateRelease = release
    const labels = {
      idle: 'Установленная версия: ' + version,
      checking: 'Проверяем наличие обновлений…',
      current: 'Обновлений нет',
      available: `Новая версия ${release?.version ?? ''}`,
      error: error ? `Не удалось проверить обновления: ${error}` : 'Не удалось проверить обновления'
    }
    const colors = {
      idle: 'text-ink-400',
      checking: 'text-ink-400',
      current: 'text-ok-400',
      available: 'text-brand-300',
      error: 'text-danger-400'
    }
    updateStatusText.textContent = labels[status] ?? labels.idle
    updateStatusText.className = `text-sm ${colors[status] ?? colors.idle}`
    updateCheckButton.textContent = status === 'checking' ? 'Проверяем…' : 'Проверить обновления'
    updateCheckButton.disabled = status === 'checking'
    updateCheckButton.classList.toggle('opacity-60', status === 'checking')
    updateCheckButton.classList.toggle('hidden', status === 'available')
    updateDownloadButton.classList.toggle('hidden', status !== 'available')
  }

  const applyUpdateState = (next) => {
    if (!next) {
      setUpdateStatus('idle')
      return
    }
    if (next.status === 'checking') {
      setUpdateStatus('checking')
      return
    }
    if (next.status === 'available' && next.release) {
      setUpdateStatus('available', next.release)
      return
    }
    if (next.status === 'current') {
      setUpdateStatus('current')
      return
    }
    if (next.status === 'error') {
      setUpdateStatus('error', null, next.error)
      return
    }
    setUpdateStatus('idle')
  }

  const runUpdateCheck = async () => {
    if (!onCheckUpdate) return
    setUpdateStatus('checking')
    const result = await onCheckUpdate()
    if (!result) {
      setUpdateStatus('error', null, 'нет связи')
      return
    }
    if (result.error) {
      setUpdateStatus('error', null, result.error)
      return
    }
    if (result.available) {
      setUpdateStatus('available', result.release)
      return
    }
    setUpdateStatus('current')
  }

  const runUpdateDownload = async () => {
    if (!onDownloadUpdate || !updateRelease) return
    updateDownloadButton.disabled = true
    updateDownloadButton.textContent = 'Скачиваем…'
    try {
      await onDownloadUpdate(updateRelease)
    } finally {
      updateDownloadButton.disabled = false
      updateDownloadButton.textContent = 'Скачать обновление'
    }
  }

  setUpdateStatus('idle')
  applyUpdateState(update)

  const body = el('div', { class: 'space-y-4' }, [
    section('Безопасность', [
      autoLockField,
      clipboardField,
      biometricsField,
      secureScreenField
    ]),
    section('Категории', [
      actionRow({
        iconPath: ICONS.tag,
        title: 'Настройка категорий',
        description: 'Добавить, изменить или удалить',
        onClick: onManageCategories
      })
    ]),
    section('Данные', [
      actionRow({
        iconPath: ICONS.download,
        title: 'Экспорт',
        description: 'В файл или на сервер',
        onClick: onExport
      }),
      actionRow({
        iconPath: ICONS.upload,
        title: 'Импорт',
        description: 'Из файла или с сервера',
        onClick: onImport
      }),
      actionRow({
        iconPath: ICONS.key,
        title: 'GitHub-токен',
        description: 'Доступ к копиям в .backup',
        onClick: onManageToken
      }),
      actionRow({
        iconPath: ICONS.copy,
        title: 'Профиль',
        description: serverProfile || 'Определится при первой копии на сервер',
        onClick: async () => {
          if (!serverProfile) return
          await copyToClipboard(serverProfile)
          hapticLight()
          toast('Id профиля скопирован', 'info', 1800)
        }
      })
    ]),
    section('Обновление', [
      updateStatusText,
      updateCheckButton,
      updateDownloadButton,
      updateReleaseButton
    ]),
    section('Опасная зона', [
      el('button', {
        class: 'w-full rounded-xl bg-danger-500/15 py-2.5 text-sm font-semibold text-danger-400 transition active:scale-[0.98] hover:bg-danger-500/25',
        text: 'Сменить мастер-пароль',
        onclick: onChangeMaster
      }),
      el('button', {
        class: 'w-full rounded-xl bg-danger-500/15 py-2.5 text-sm font-semibold text-danger-400 transition active:scale-[0.98] hover:bg-danger-500/25',
        text: 'Удалить хранилище',
        onclick: onDeleteVault
      })
    ]),
    el('p', { class: 'px-2 text-center text-xs leading-relaxed text-ink-600' }, [
      el('span', { class: 'block font-semibold text-ink-400', text: `Zamok ${version}` }),
      el('span', {
        class: 'block text-ink-600',
        text: 'Данные шифруются AES-GCM 256, ключ выводится PBKDF2-SHA256'
      })
    ])
  ])

  const header = el('div', { class: 'flex items-center gap-3' }, [
    el('button', {
      class: 'rounded-xl p-2.5 text-ink-300 transition active:scale-90 hover:bg-ink-800',
      'aria-label': 'Назад',
      onclick: onBack
    }, [icon(ICONS.back, 'w-5 h-5')]),
    el('h1', { class: 'flex-1 text-lg font-semibold text-ink-50', text: 'Настройки' })
  ])

  const root = el('div', { class: 'flex h-full flex-col bg-ink-950' }, [
    el('div', { class: 'border-b border-ink-800/80 bg-ink-950/90 px-4 py-3 backdrop-blur-xl' }, [header]),
    el('div', { class: 'flex-1 overflow-y-auto px-4 py-4 no-scrollbar' }, [body]),
    el('div', { class: 'safe-bottom' })
  ])

  return {
    element: root,
    // Lets the app refresh the update block in place, without re-rendering
    // the whole screen.
    setUpdate: applyUpdateState
  }
}

export function changeMasterDialog({ onSubmit }) {
  const current = el('input', { type: 'password', placeholder: 'Текущий мастер-пароль', class: 'w-full' })
  const next = el('input', { type: 'password', placeholder: 'Новый мастер-пароль', class: 'w-full' })
  const confirm = el('input', { type: 'password', placeholder: 'Повторите новый пароль', class: 'w-full' })
  const error = el('p', { class: 'hidden text-sm text-danger-400' })

  const modal = openModal({
    title: 'Смена мастер-пароля',
    subtitle: 'Все данные будут перешифрованы новым ключом',
    body: el('div', { class: 'space-y-3' }, [current, next, confirm, error]),
    actions: [
      {
        label: 'Сменить',
        primary: true,
        onClick: async () => {
          const fail = (message) => {
            error.textContent = message
            error.classList.remove('hidden')
            return false
          }
          if (!current.value) return fail('Введите текущий пароль')
          if (next.value.length < 8) return fail('Новый пароль — минимум 8 символов')
          if (next.value !== confirm.value) return fail('Новые пароли не совпадают')
          const ok = await onSubmit(current.value, next.value)
          if (!ok) return fail('Текущий пароль неверен')
          return true
        }
      }
    ]
  })
  return modal
}
