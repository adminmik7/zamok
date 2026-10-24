import { el } from '../dom.js'
import { openModal } from './feedback.js'

export function photoBlock(photo) {
  if (!photo) return null
  return el('button', {
    type: 'button',
    class: 'block w-full overflow-hidden rounded-2xl border border-ink-800 transition active:scale-[0.99]',
    'aria-label': 'Открыть фото',
    onclick: () =>
      openModal({
        title: 'Фото',
        body: el('img', { src: photo, alt: 'Фото', class: 'max-h-[70vh] w-full rounded-xl object-contain' })
      })
  }, [el('img', { src: photo, alt: 'Фото', class: 'max-h-72 w-full object-cover' })])
}
