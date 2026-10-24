import { describe, expect, it, vi } from 'vitest'
import { brandFromNumber, brandFromTitle, detectCardBrand } from '../src/core/card-brand.js'
import { cardBrand, cardDetailScreen } from '../src/ui/screens/card.js'
import { itemCard } from '../src/ui/screens/list.js'

describe('card brand detection', () => {
  it('reads the network from the number', () => {
    expect(brandFromNumber('2200123456789012')).toBe('МИР')
    expect(brandFromNumber('4111111111111111')).toBe('VISA')
    expect(brandFromNumber('5555555555554444')).toBe('Mastercard')
    expect(brandFromNumber('9112388002862113')).toBe('КАРТА')
  })

  it('reads the network from the name when the number is unknown', () => {
    expect(brandFromTitle('Сбер Мир')).toBe('МИР')
    expect(brandFromTitle('Карта Тинькофф')).toBe('')
    expect(brandFromTitle('Visa Gold')).toBe('VISA')
    expect(brandFromTitle('Мастеркарт Премьер')).toBe('Mastercard')
  })

  it('prefers the network read over NFC', () => {
    expect(detectCardBrand('9112388002862113', { title: 'Сбер Мир', brand: 'МИР' })).toBe('МИР')
  })

  it('prefers the number over the name', () => {
    expect(detectCardBrand('4111111111111111', { title: 'Сбер Мир' })).toBe('VISA')
  })

  it('falls back to the name when the number tells nothing', () => {
    expect(detectCardBrand('9112388002862113', { title: 'Сбер Мир' })).toBe('МИР')
    expect(detectCardBrand('9112388002862113')).toBe('КАРТА')
  })

  it('exposes the same detection through the card screen helper', () => {
    expect(cardBrand('9112388002862113', 'Сбер Мир')).toBe('МИР')
  })
})

describe('card brand marks', () => {
  const item = {
    id: '1',
    title: 'Сбер Мир',
    type: 'card',
    cardNumber: '9112 3880 0286 2113',
    cardExpiry: '09/28',
    cardHolder: 'IVAN IVANOV',
    category: 'finance',
    updatedAt: Date.now()
  }

  it('shows the MIR mark when the number alone tells nothing', () => {
    const view = cardDetailScreen({ item, onBack: vi.fn(), onEdit: vi.fn() })
    document.body.append(view.element)

    expect(view.element.textContent).toContain('МИР')
    expect(view.element.textContent).not.toContain('КАРТА')
    view.element.remove()
  })

  it('keeps the card number on a single line', () => {
    const view = cardDetailScreen({ item, onBack: vi.fn(), onEdit: vi.fn() })
    document.body.append(view.element)

    const number = [...view.element.querySelectorAll('span')].find((node) =>
      node.textContent.includes('•••• •••• •••• 2113')
    )
    expect(number).toBeTruthy()
    expect(number.className).toContain('whitespace-nowrap')

    const eye = view.element.querySelector('button[aria-label="Показать"]')
    eye.click()

    const revealed = [...view.element.querySelectorAll('span')].find((node) =>
      node.textContent.includes('9112 3880 0286 2113')
    )
    expect(revealed).toBeTruthy()
    expect(revealed.className).toContain('whitespace-nowrap')
    view.element.remove()
  })

  it('pushes the reveal button to the right edge of the card', () => {
    const view = cardDetailScreen({ item, onBack: vi.fn(), onEdit: vi.fn() })
    document.body.append(view.element)

    const number = [...view.element.querySelectorAll('span')].find((node) =>
      node.textContent.includes('•••• •••• •••• 2113')
    )
    const row = number.parentElement
    expect(row.className).toContain('justify-between')

    const eye = row.querySelector('button[aria-label="Показать"]')
    expect(eye.className).toContain('shrink-0')
    expect(number.className).toContain('flex-1')
    view.element.remove()
  })

  it('shows the MIR mark in the list badge', () => {
    const card = itemCard(item, { onOpen: vi.fn(), onToggleFavorite: vi.fn() })

    expect(card.firstElementChild.textContent).toContain('МИР')
  })
})
