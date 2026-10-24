import { el, icon, ICONS } from '../dom.js'

export function transferScreen({ mode = 'export', onBack, onFile, onServer }) {
  const isExport = mode === 'export'
  const title = isExport ? 'Экспорт' : 'Импорт'

  const row = ({ iconPath, label, description, onClick }) =>
    el('button', {
      class:
        'flex w-full items-center gap-3 rounded-[6px] border border-ink-800 bg-ink-900/70 p-4 text-left transition active:scale-[0.99] hover:border-ink-700 hover:bg-ink-900',
      onclick: onClick
    }, [
      el('span', { class: 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-brand-300' }, [
        icon(iconPath, 'w-5 h-5')
      ]),
      el('span', { class: 'min-w-0 flex-1' }, [
        el('span', { class: 'block text-sm font-semibold text-ink-100', text: label }),
        el('span', { class: 'mt-0.5 block text-xs text-ink-500', text: description })
      ]),
      el('span', { class: 'text-ink-600' }, [icon(ICONS.back, 'w-4 h-4 rotate-180')])
    ])

  const header = el('div', { class: 'flex items-center gap-3' }, [
    el('button', {
      class: 'rounded-xl p-2.5 text-ink-300 transition active:scale-90 hover:bg-ink-800',
      'aria-label': 'Назад',
      onclick: onBack
    }, [icon(ICONS.back, 'w-5 h-5')]),
    el('h1', { class: 'flex-1 text-lg font-semibold text-ink-50', text: title })
  ])

  const body = el('div', { class: 'space-y-3' }, [
    row({
      iconPath: isExport ? ICONS.download : ICONS.upload,
      label: isExport ? 'В файл' : 'Из файла',
      description: isExport ? 'Зашифрованный .zmk в память телефона' : 'Выбрать копию .zmk с телефона',
      onClick: onFile
    }),
    row({
      iconPath: ICONS.cloud,
      label: isExport ? 'На сервер' : 'С сервера',
      description: isExport ? 'GitHub, папка .backup' : 'Выбрать копию из .backup на GitHub',
      onClick: onServer
    }),
    el('p', { class: 'px-2 pt-1 text-xs leading-relaxed text-ink-600' }, [
      el('span', {
        text: isExport
          ? 'Ваша копия зашифрована мастер-паролем, и никто не сможет получить к ней доступ.'
          : 'Подходят зашифрованные копии Замка .zmk. После выбора файла приложение попросит мастер-пароль.'
      })
    ])
  ])

  const root = el('div', { class: 'flex h-full flex-col bg-ink-950' }, [
    el('div', { class: 'border-b border-ink-800/80 bg-ink-950/90 px-4 py-3 backdrop-blur-xl' }, [header]),
    el('div', { class: 'flex-1 overflow-y-auto px-4 py-4 no-scrollbar' }, [body]),
    el('div', { class: 'safe-bottom' })
  ])

  return { element: root }
}
