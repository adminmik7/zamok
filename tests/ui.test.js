const nfcReaderMock = vi.hoisted(() => vi.fn())
vi.mock('../src/ui/components/nfc-card.js', () => ({ openNfcCardReader: nfcReaderMock }))

import { describe, expect, it, vi } from 'vitest'
import { switchField, selectField, field } from '../src/ui/components/form.js'
import { closeTopModal, openModal, toast } from '../src/ui/components/feedback.js'
import { settingsScreen } from '../src/ui/screens/settings.js'
import { transferScreen } from '../src/ui/screens/transfer.js'
import { newItemScreen } from '../src/ui/screens/new-item.js'
import { categoriesScreen } from '../src/ui/screens/categories.js'
import { dateField } from '../src/ui/components/form.js'
import { editorScreen } from '../src/ui/screens/editor.js'
import { cardDetailScreen, cardBrand, maskedCardNumber, formatExpiry } from '../src/ui/screens/card.js'
import { detailScreen, openIconPicker, SERVICE_ICONS } from '../src/ui/screens/detail.js'
import { ICONS } from '../src/ui/dom.js'
import { loyaltyDetailScreen } from '../src/ui/screens/loyalty.js'
import { unlockScreen } from '../src/ui/screens/unlock.js'
import { itemCard } from '../src/ui/screens/list.js'
import { DEFAULT_SETTINGS } from '../src/core/store.js'

describe('toast', () => {
  it('keeps a persistent toast until it is tapped, then runs the action', () => {
    vi.useFakeTimers()
    const action = vi.fn()
    const node = toast('Доступна версия 1.11.2', 'info', 0, action)
    document.body.append(node)

    vi.advanceTimersByTime(60 * 1000)

    expect(node.isConnected).toBe(true)
    expect(node.getAttribute('role')).toBe('button')

    node.click()

    expect(action).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(500)
    expect(node.isConnected).toBe(false)
    vi.useRealTimers()
    node.remove()
  })

  it('hides a regular toast on its own', () => {
    vi.useFakeTimers()
    const node = toast('Запись сохранена', 'info', 1500)
    document.body.append(node)

    vi.advanceTimersByTime(2000)
    expect(node.isConnected).toBe(false)
    vi.useRealTimers()
  })
})

describe('switchField', () => {
  it('toggles when the row is tapped', () => {
    const onChange = vi.fn()
    const field = switchField({ label: 'Вход по биометрии', description: 'Отпечаток', onChange })
    document.body.append(field)

    expect(field.getAttribute('aria-checked')).toBe('false')

    field.click()

    expect(field.getAttribute('aria-checked')).toBe('true')
    expect(field.querySelector('.translate-x-5')).not.toBeNull()
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(true)
    field.remove()
  })

  it('starts on and flips once per tap', () => {
    const onChange = vi.fn()
    const field = switchField({ label: 'Защита экрана', description: 'Скрывает', checked: true, onChange })
    document.body.append(field)

    expect(field.getAttribute('aria-checked')).toBe('true')

    field.querySelector('p').click()

    expect(field.getAttribute('aria-checked')).toBe('false')
    expect(onChange).toHaveBeenCalledTimes(1)

    field.querySelector('p').click()

    expect(field.getAttribute('aria-checked')).toBe('true')
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenLastCalledWith(true)
    field.remove()
  })
})

describe('selectField', () => {
  it('opens a styled picker and updates the value', () => {
    const onChange = vi.fn()
    const field = selectField({
      label: 'Категория',
      value: 'a',
      options: [
        { value: 'a', label: 'Работа' },
        { value: 'b', label: 'Финансы' }
      ],
      onChange
    })
    document.body.append(field)

    field.querySelector('button').click()
    const option = [...document.body.querySelectorAll('button')].find((node) => node.textContent === 'Финансы')
    option.click()

    expect(onChange).toHaveBeenCalledWith('b')
    expect(field.input.value).toBe('b')
    expect(document.body.textContent).not.toContain('Выберите значение')
    field.remove()
  })
})

describe('back navigation', () => {
  it('closes the most recently opened modal first', () => {
    const first = openModal({ title: 'first' })
    const second = openModal({ title: 'second' })

    expect(closeTopModal()).toBe(true)
    expect(document.body.contains(second.overlay)).toBe(false)
    expect(document.body.contains(first.overlay)).toBe(true)

    expect(closeTopModal()).toBe(true)
    expect(closeTopModal()).toBe(false)
  })

  it('keeps modal actions above the gesture bar', () => {
    const modal = openModal({ title: 'Иконка', actions: [{ label: 'Готово', primary: true }] })
    expect(modal.panel.className).toContain('modal-sheet-safe')
    modal.close()
  })

  it('scrolls only the body and keeps the action button visible', () => {
    const body = document.createElement('div')
    body.textContent = 'содержимое'
    const modal = openModal({ title: 'Иконка', body, actions: [{ label: 'Готово', primary: true }] })
    const scroller = modal.panel.querySelector('.overflow-y-auto')
    expect(scroller?.textContent).toBe('содержимое')
    expect(scroller?.textContent).not.toContain('Готово')
    modal.close()
  })

  it('centers a dialog vertically when asked', () => {
    const modal = openModal({ title: 'Обновление', centered: true })
    expect(modal.overlay.className).toContain('flex items-center')
    expect(modal.panel.className).not.toContain('modal-sheet-safe')
    modal.close()
  })

  it('draws a plain cross on the modal close button', () => {
    const modal = openModal({ title: 'Обновление' })
    const closeButton = modal.panel.querySelector('[aria-label="Закрыть"]')
    const path = closeButton?.querySelector('path')?.getAttribute('d')
    expect(path).toBe('M6 6l12 12M18 6L6 18')
    modal.close()
  })

  it('turns screen protection off from the settings switch', () => {
    const onChange = vi.fn()
    const view = settingsScreen({
      settings: { ...DEFAULT_SETTINGS, secureScreen: true },
      onBack: vi.fn(),
      onChange,
      onChangeMaster: vi.fn(),
      onExport: vi.fn(),
      onImport: vi.fn(),
      onDeleteVault: vi.fn(),
      biometricsAvailable: true
    })

    document.body.append(view.element)
    const row = [...view.element.querySelectorAll('button')].find((node) =>
      node.textContent.includes('Защита экрана')
    )
    row.click()

    expect(onChange).toHaveBeenCalledWith({ secureScreen: false })

    view.element.remove()
  })

  it('settings header back button calls onBack', () => {    const onBack = vi.fn()
    const view = settingsScreen({
      settings: DEFAULT_SETTINGS,
      onBack,
      onChange: vi.fn(),
      onChangeMaster: vi.fn(),
      onExport: vi.fn(),
      onImport: vi.fn(),
      onDeleteVault: vi.fn(),
      biometricsAvailable: true
    })

    view.element.querySelector('[aria-label="Назад"]').click()

    expect(onBack).toHaveBeenCalledOnce()
  })
})

describe('new item flow', () => {
  it('offers record types and reports the picked one', () => {
    const onPick = vi.fn()
    const view = newItemScreen({ onBack: vi.fn(), onPick })

    const buttons = [...view.element.querySelectorAll('button')]
    buttons.find((node) => node.textContent.includes('Банковская карта')).click()
    expect(onPick.mock.calls[0][0]).toMatchObject({ id: 'card', label: 'Банковская карта' })

    buttons.find((node) => node.textContent.includes('Заметка')).click()
    expect(onPick.mock.calls[1][0]).toMatchObject({ id: 'note' })

    expect(view.element.textContent).not.toContain('Одноразовый пароль')

    view.element.remove()
  })

  it('offers a discount card type', () => {
    const onPick = vi.fn()
    const view = newItemScreen({ onBack: vi.fn(), onPick })

    const button = [...view.element.querySelectorAll('button')].find((node) =>
      node.textContent.includes('Скидочная карта')
    )
    button.click()

    expect(onPick.mock.calls[0][0]).toMatchObject({ id: 'loyalty', label: 'Скидочная карта' })
    expect(onPick.mock.calls[0][0].preset).toMatchObject({ type: 'loyalty' })
    view.element.remove()
  })

  it('shows only the shop and barcode fields for a discount card', () => {
    const view = editorScreen({ preset: { type: 'loyalty' }, onCancel: vi.fn(), onSave: vi.fn() })

    expect(view.element.textContent).toContain('Магазин или программа')
    expect(view.element.textContent).toContain('Штрихкод')
    expect(view.element.textContent).not.toContain('Логин или email')
    expect(view.element.textContent).not.toContain('Пароль')
    expect(view.element.textContent).not.toContain('CVV')

    view.element.remove()
  })

  it('saves the discount card barcode and keeps it numeric', async () => {
    const onSave = vi.fn()
    const view = editorScreen({ preset: { type: 'loyalty' }, onCancel: vi.fn(), onSave })
    document.body.append(view.element)

    const barcodeField = [...view.element.querySelectorAll('label')]
      .find((node) => node.textContent.startsWith('Штрихкод'))
      .querySelector('input')
    barcodeField.value = '40063813339a1'
    barcodeField.dispatchEvent(new Event('input'))
    expect(barcodeField.value).toBe('40063813339A1')

    const saveButton = [...view.element.querySelectorAll('button')].find((node) => node.textContent === 'Сохранить')
    saveButton.click()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(onSave.mock.calls[0][0].loyaltyBarcode).toBe('40063813339A1')
    view.element.remove()
  })

  it('opens the camera scanner from the barcode field', async () => {
    const view = editorScreen({ preset: { type: 'loyalty' }, onCancel: vi.fn(), onSave: vi.fn() })
    document.body.append(view.element)

    const scanButton = view.element.querySelector('[aria-label="Сканировать штрихкод"]')
    expect(scanButton).toBeTruthy()
    scanButton.click()

    await vi.waitFor(() => expect(document.body.textContent).toContain('Сканировать штрихкод'))
    expect(document.querySelector('.modal-fullscreen-safe')).toBeTruthy()
    // No camera in the test environment: the scanner has to say so instead of
    // failing silently.
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Камера недоступна')
    )

    closeTopModal()
    view.element.remove()
  })

  it('draws the barcode on the discount card screen', () => {
    const view = loyaltyDetailScreen({
      item: {
        id: '1',
        type: 'loyalty',
        title: 'Пятёрочка',
        loyaltyBarcode: '4006381333931',
        category: 'other',
        favorite: false,
        updatedAt: Date.now()
      },
      onBack: vi.fn(),
      onEdit: vi.fn(),
      onToggleFavorite: vi.fn(),
      onAppearanceChange: vi.fn()
    })
    document.body.append(view.element)

    expect(view.element.textContent).toContain('Пятёрочка')
    expect(view.element.textContent).toContain('Скидочная карта')
    expect(view.element.textContent).toContain('4006381333931')
    expect(view.element.querySelector('svg[aria-label^="Штрихкод"]')).toBeTruthy()
    expect(view.element.textContent).not.toContain('Категория')

    // The icon sits on a card-shaped badge, not on a round avatar.
    const badge = view.element.querySelector('[aria-label="Изменить иконку"]')
    expect(badge.className).toContain('w-24')
    expect(badge.className).toContain('rounded-[6px]')
    expect(badge.className).not.toContain('rounded-full')

    // The digits under the barcode were removed: the code is shown only as a
    // picture, the copy button stays in the facts block.
    const copyButtons = [...view.element.querySelectorAll('button[aria-label="Скопировать штрихкод"]')]
    expect(copyButtons).toHaveLength(1)

    view.element.remove()
  })

  it('offers title, note, category and photo for a note', () => {
    const view = editorScreen({ preset: { type: 'note' }, onCancel: vi.fn(), onSave: vi.fn() })
    document.body.append(view.element)

    expect(view.element.textContent).toContain('Название')
    expect(view.element.textContent).toContain('Заметки')
    expect(view.element.textContent).toContain('Добавить фото')
    expect(view.element.textContent).toContain('Категория')
    expect(view.element.textContent).not.toContain('Логин или email')
    expect(view.element.textContent).not.toContain('Сайт')

    const trigger = [...view.element.querySelectorAll('button')].find((node) =>
      node.textContent.includes('Общее')
    )
    expect(trigger).toBeTruthy()
    trigger.click()
    const option = [...document.querySelectorAll('button')].find(
      (node) => node.textContent.trim() === 'Финансы'
    )
    expect(option).toBeTruthy()
    option.click()
    expect(view.element.querySelector('input[type="hidden"]').value).toBe('finance')

    view.element.remove()
  })

  it('editor applies the selected type preset', () => {
    const view = editorScreen({
      preset: { category: 'personal', notes: 'Серия и номер:', focus: 'notes' },
      onCancel: vi.fn(),
      onSave: vi.fn()
    })
    document.body.append(view.element)

    expect(view.element.querySelector('textarea').value).toBe('Серия и номер:')
    expect(view.element.querySelector('input[type="hidden"]').value).toBe('personal')

    view.focus()
    expect(document.activeElement).toBe(view.element.querySelector('textarea'))
    view.element.remove()
  })

  it('offers deletion in the editor only for saved records', () => {
    const onDelete = vi.fn()
    const fresh = editorScreen({ preset: { type: 'login' }, onCancel: vi.fn(), onSave: vi.fn(), onDelete })
    expect(fresh.element.textContent).not.toContain('Удалить запись')

    const existing = editorScreen({
      item: { id: 'id_1', title: 'Запись', type: 'login' },
      onCancel: vi.fn(),
      onSave: vi.fn(),
      onDelete
    })
    document.body.append(existing.element)
    const button = [...existing.element.querySelectorAll('button')].find((node) => node.textContent === 'Удалить запись')
    expect(button).toBeTruthy()
    button.click()
    expect(onDelete).toHaveBeenCalled()
    existing.element.remove()
  })

  it('editor of a new record starts without unsaved changes', () => {
    const view = editorScreen({ preset: { type: 'login' }, onCancel: vi.fn(), onSave: vi.fn() })
    expect(view.isDirty()).toBe(false)
  })

  it('typing in the editor marks it as having unsaved changes', () => {
    const view = editorScreen({ preset: { type: 'login' }, onCancel: vi.fn(), onSave: vi.fn() })
    const title = [...view.element.querySelectorAll('input')].find((node) => node.placeholder === 'Например, Яндекс Почта')
    title.value = 'Черновик'
    expect(view.isDirty()).toBe(true)
  })

  it('favorite toggle marks a saved record as having unsaved changes', () => {
    const view = editorScreen({
      item: { id: 'id_1', title: 'Запись', type: 'login', username: 'u', password: 'p' },
      onCancel: vi.fn(),
      onSave: vi.fn()
    })
    expect(view.isDirty()).toBe(false)
    const button = [...view.element.querySelectorAll('button')].find((node) => node.textContent === 'Добавить в избранное')
    button.click()
    expect(view.isDirty()).toBe(true)
  })

  it('shows only the password fields for login records', () => {
    const view = editorScreen({ preset: { type: 'login' }, onCancel: vi.fn(), onSave: vi.fn() })

    expect(view.element.textContent).toContain('Логин или email')
    expect(view.element.textContent).toContain('Пароль')
    expect(view.element.textContent).not.toContain('Сайт')
    expect(view.element.textContent).not.toContain('TOTP-секрет')
  })

  it('shows TOTP fields for one-time password records', () => {
    const view = editorScreen({ preset: { type: 'otp' }, onCancel: vi.fn(), onSave: vi.fn() })

    expect(view.element.textContent).toContain('TOTP-секрет')
    expect(view.element.textContent).toContain('Издатель TOTP')
    expect(view.element.textContent).not.toContain('Логин или email')
  })

  it('keeps hidden url and totp values when saving a login record', async () => {
    const onSave = vi.fn()
    const view = editorScreen({
      item: {
        id: '1', type: 'login', title: 'Сайт', username: 'u', password: 'p',
        url: 'example.com', totpSecret: 'ABC', totpIssuer: 'Iss', category: 'other', favorite: false
      },
      onCancel: vi.fn(),
      onSave
    })
    document.body.append(view.element)

    const saveButton = [...view.element.querySelectorAll('button')].find((node) => node.textContent === 'Сохранить')
    saveButton.click()
    await new Promise((resolve) => setTimeout(resolve, 0))

    const payload = onSave.mock.calls[0][0]
    expect(payload.url).toBe('example.com')
    expect(payload.totpSecret).toBe('ABC')
    view.element.remove()
  })

  it('shows passport fields for passport records', () => {
    const view = editorScreen({ preset: { type: 'passport' }, onCancel: vi.fn(), onSave: vi.fn() })

    expect(view.element.textContent).toContain('Идентификационный номер')
    expect(view.element.textContent).toContain('Кем выдан')
    expect(view.element.textContent).toContain('Дата выдачи')
    expect(view.element.textContent).toContain('Действителен до')
    expect(view.element.textContent).not.toContain('Логин или email')
    expect(view.element.textContent).not.toContain('CVV')
  })

  it('saves passport fields', async () => {
    const onSave = vi.fn()
    const view = editorScreen({ preset: { type: 'passport', title: 'Паспорт' }, onCancel: vi.fn(), onSave })
    document.body.append(view.element)

    const byLabel = (label) =>
      [...view.element.querySelectorAll('label')].find((node) => node.textContent.startsWith(label)).querySelector('input')

    byLabel('Серия').value = 'mp'
    byLabel('Серия').dispatchEvent(new Event('input'))
    byLabel('Номер').value = '1234567'
    byLabel('Идентификационный номер').value = '1234567a123pb4'
    byLabel('Идентификационный номер').dispatchEvent(new Event('input'))
    byLabel('Кем выдан').value = 'РОВД района'
    const byDateLabel = (label) =>
      [...view.element.querySelectorAll('div.block')]
        .find((node) => node.textContent.startsWith(label))
        .querySelector('input[type="hidden"]')
    byDateLabel('Дата выдачи').value = '2020-05-01'
    byDateLabel('Действителен до').value = '2030-05-01'

    const saveButton = [...view.element.querySelectorAll('button')].find((node) => node.textContent === 'Сохранить')
    saveButton.click()
    await new Promise((resolve) => setTimeout(resolve, 0))

    const payload = onSave.mock.calls[0][0]
    expect(payload.passportSeries).toBe('MP')
    expect(payload.passportNumber).toBe('1234567')
    expect(payload.passportIdNumber).toBe('1234567A123PB4')
    expect(payload.passportIssuedBy).toBe('РОВД района')
    expect(payload.passportIssuedAt).toBe('2020-05-01')
    expect(payload.passportValidUntil).toBe('2030-05-01')
    view.element.remove()
  })

  it('toggles the favorite button between states', () => {
    const view = editorScreen({ onCancel: vi.fn(), onSave: vi.fn() })
    document.body.append(view.element)

    const button = [...view.element.querySelectorAll('button')].find((node) =>
      node.textContent.includes('Добавить в избранное')
    )
    button.click()

    expect(button.textContent).toContain('В избранном')
    expect(button.className).toContain('text-warn-400')
    view.element.remove()
  })

  it('offers NFC card reading in the card editor', () => {
    const view = editorScreen({
      preset: { type: 'card', cardNumber: '5155555555555555' },
      onCancel: vi.fn(),
      onSave: vi.fn()
    })

    const nfcButton = view.element.querySelector('[aria-label="Считать карту по NFC"]')
    expect(nfcButton).toBeTruthy()
    expect(nfcButton.querySelector('svg')).toBeTruthy()
  })

  it('fills card fields from an NFC read', () => {
    nfcReaderMock.mockClear()
    const view = editorScreen({
      preset: { type: 'card' },
      onCancel: vi.fn(),
      onSave: vi.fn()
    })
    document.body.append(view.element)

    view.element.querySelector('[aria-label="Считать карту по NFC"]').click()
    expect(nfcReaderMock).toHaveBeenCalledTimes(1)

    const reader = nfcReaderMock.mock.calls[0][0]
    reader.onResult({ pan: '4111111111111111', expiry: '01/26', holder: 'IVAN IVANOV', brand: 'VISA' })

    const numberInput = view.element.querySelector('input[placeholder="0000 0000 0000 0000"]')
    expect(numberInput.value).toBe('4111 1111 1111 1111')
    const expiryInput = view.element.querySelector('input[placeholder="хх/хх"]')
    expect(expiryInput.value).toBe('01/26')
    const holderLabel = [...view.element.querySelectorAll('label')].find((label) => label.textContent.startsWith('Владелец'))
    expect(holderLabel.querySelector('input').value).toBe('IVAN IVANOV')

    view.element.remove()
  })

  it('formats card number and owner in the card editor', () => {
    const view = editorScreen({
      preset: { type: 'card', cardNumber: '5155555555555555', cardHolder: 'andrei chaiko' },
      onCancel: vi.fn(),
      onSave: vi.fn()
    })
    document.body.append(view.element)

    const numberInput = view.element.querySelector('input[placeholder="0000 0000 0000 0000"]')
    expect(numberInput.value).toBe('5155 5555 5555 5555')

    numberInput.value = '411115'
    numberInput.dispatchEvent(new Event('input'))
    expect(numberInput.value).toBe('4111 15')

    const holderLabel = [...view.element.querySelectorAll('label')].find((label) => label.textContent.startsWith('Владелец'))
    const holderInput = holderLabel.querySelector('input')
    expect(holderInput.value).toBe('ANDREI CHAIKO')

    holderInput.value = 'Иван petrov'
    holderInput.dispatchEvent(new Event('input'))
    expect(holderInput.value).toBe('PETROV')

    view.element.remove()
  })

  it('reveals the password field with an eye button', () => {
    const view = editorScreen({
      preset: { title: 'Google', username: 'galya_ah@mail.ru', password: 'secret-pass' },
      onCancel: vi.fn(),
      onSave: vi.fn()
    })
    document.body.append(view.element)

    const wrapper = [...view.element.querySelectorAll('label')].find((node) => node.textContent.startsWith('Пароль'))
    const input = wrapper.querySelector('input')
    expect(input.type).toBe('password')

    wrapper.querySelector('button[aria-label="Показать пароль"]').click()
    expect(input.type).toBe('text')
    wrapper.querySelector('button[aria-label="Скрыть пароль"]').click()
    expect(input.type).toBe('password')

    view.element.remove()
  })

  it('formats the card expiry and reveals CVV and PIN', () => {
    const view = editorScreen({
      preset: { type: 'card', cardExpiry: '1223', cardCvv: '123', cardPin: '4321' },
      onCancel: vi.fn(),
      onSave: vi.fn()
    })
    document.body.append(view.element)

    const expiry = view.element.querySelector('input[placeholder="хх/хх"]')
    expect(expiry.value).toBe('12/23')
    expiry.value = '0930'
    expiry.dispatchEvent(new Event('input'))
    expect(expiry.value).toBe('09/30')

    for (const label of ['CVV', 'PIN']) {
      const wrapper = [...view.element.querySelectorAll('label')].find((node) => node.textContent.startsWith(label))
      const input = wrapper.querySelector('input')
      const eye = wrapper.querySelector('button[aria-label="Показать пароль"]')
      expect(input.type).toBe('password')
      eye.click()
      expect(input.type).toBe('text')
      eye.click()
      expect(input.type).toBe('password')
    }

    view.element.remove()
  })
})

describe('list item', () => {
  it('fills the star for favorite records', () => {
    const item = {
      id: '1', title: 'Кактус', type: 'card', favorite: true, category: 'other',
      cardNumber: '5155 5555 5555 5555', updatedAt: Date.now()
    }
    const card = itemCard(item, { onOpen: vi.fn(), onCopy: vi.fn(), onToggleFavorite: vi.fn() })

    expect(card.querySelector('svg[fill="currentColor"]')).toBeTruthy()
  })

  it('shows a custom icon and colour instead of the initial', () => {
    const item = {
      id: '2', title: 'Почта', type: 'login', category: 'other',
      icon: 'mail', iconColor: '#22c55e', updatedAt: Date.now()
    }
    const card = itemCard(item, { onOpen: vi.fn(), onToggleFavorite: vi.fn() })
    const avatar = card.firstElementChild

    expect(avatar.querySelector('svg')).toBeTruthy()
    expect(avatar.textContent).not.toContain('П')
    expect(avatar.style.backgroundColor).toBeTruthy()
  })

  it('masks the barcode of a discount card in the list', () => {
    const card = itemCard(
      { id: '3', title: 'Пятёрочка', type: 'loyalty', loyaltyBarcode: '4006381333931', category: 'other', updatedAt: Date.now() },
      { onOpen: vi.fn(), onToggleFavorite: vi.fn() }
    )

    expect(card.textContent).toContain('•••• 3931')
    expect(card.textContent).not.toContain('4006381333931')
  })

  it('labels a note record instead of promising a login', () => {
    const card = itemCard(
      { id: '5', title: 'Токен', type: 'note', note: 'секрет', category: 'other', updatedAt: Date.now() },
      { onOpen: vi.fn(), onToggleFavorite: vi.fn() }
    )

    expect(card.textContent).toContain('Заметка')
    expect(card.textContent).not.toContain('Нет логина')
  })

  it('shows a discount card as a card badge with the discount mark', () => {
    const card = itemCard(
      {
        id: '4', title: 'Кактус', type: 'loyalty', loyaltyBarcode: '54490000214805',
        iconColor: '#22c55e', category: 'other', updatedAt: Date.now()
      },
      { onOpen: vi.fn(), onToggleFavorite: vi.fn() }
    )
    const badge = card.firstElementChild

    expect(badge.className).toContain('rounded-[5px]')
    expect(badge.className).toContain('w-12')
    expect(badge.style.background).toContain('#22c55e')
    expect(badge.querySelector('svg')).toBeTruthy()
    expect(badge.textContent).toBe('')
  })

  it('applies the chosen icon and colour to the discount card badge', () => {
    const card = itemCard(
      {
        id: '5', title: 'Кактус', type: 'loyalty', loyaltyBarcode: '54490000214805',
        icon: 'ticket', iconColor: '#facc15', category: 'other', updatedAt: Date.now()
      },
      { onOpen: vi.fn(), onToggleFavorite: vi.fn() }
    )
    const badge = card.firstElementChild

    expect(badge.style.background).toContain('#facc15')
    // The ticket glyph has its own path, the percent mark is a different one.
    const paths = [...badge.querySelectorAll('path')].map((node) => node.getAttribute('d'))
    expect(paths.length).toBeGreaterThan(0)
    expect(paths.join(' ')).not.toBe(
      [...ICONS.percent.split('M').slice(1)].map((part) => `M${part}`).join(' ')
    )
  })
})

describe('login detail screen', () => {
  const item = {
    id: 'l1',
    type: 'login',
    title: 'Пут Почта',
    username: 'galakoshka235@gmail.com',
    password: 'secret-pass',
    category: 'social',
    favorite: false,
    notes: '',
    updatedAt: Date.now()
  }

  it('shows the hero card, masked password and favourite toggle', () => {
    const onToggleFavorite = vi.fn()
    const view = detailScreen({
      item,
      onBack: vi.fn(),
      onEdit: vi.fn(),
      onToggleFavorite,
      onOpenUrl: vi.fn()
    })
    document.body.append(view.element)

    expect(view.element.textContent).toContain('Пут Почта')
    expect(view.element.textContent).toContain('galakoshka235@gmail.com')
    expect(view.element.textContent).toContain('••••••••••')
    expect(view.element.textContent).not.toContain('secret-pass')

    const fav = view.element.querySelector('button[aria-label="В избранное"]')
    expect(fav).toBeTruthy()
    fav.click()
    expect(onToggleFavorite).toHaveBeenCalled()

    view.element.querySelector('button[aria-label="Показать пароль"]').click()
    expect(view.element.textContent).toContain('secret-pass')
    view.element.remove()
  })

  it('keeps a brand icon picked for the record instead of resetting to the globe', () => {
    const view = detailScreen({
      item: { ...item, icon: 'google', iconColor: '#ef4444' },
      onBack: vi.fn(),
      onEdit: vi.fn(),
      onOpenUrl: vi.fn()
    })

    const avatar = view.element.querySelector('button[aria-label="Изменить иконку"]')
    const paths = [...avatar.querySelectorAll('path')].map((node) => node.getAttribute('d')).join(' ')
    expect(paths).toContain('M12.48 10.92')
    expect(paths).not.toBe([...ICONS.globe.split('M').slice(1)].map((part) => `M${part}`).join(' '))
  })

  it('shows the update time as a muted footer and no category chip', () => {
    const view = detailScreen({
      item: { ...item, category: 'other' },
      onBack: vi.fn(),
      onEdit: vi.fn(),
      onOpenUrl: vi.fn()
    })
    document.body.append(view.element)

    expect(view.element.textContent).toContain('Изменено:')
    expect(view.element.textContent).not.toContain('Обновлено')
    expect(view.element.textContent).not.toContain('Общее')
    view.element.remove()
  })

  it('shows the record title in the header', () => {
    const view = detailScreen({ item, onBack: vi.fn(), onEdit: vi.fn(), onOpenUrl: vi.fn() })
    const header = view.element.firstElementChild

    expect(header.querySelector('h1').textContent).toBe(item.title)
    expect(header.querySelector('p').textContent).toBe('Пароль')
  })

  it('applies icon and colour to the preview and saves them only on confirm', () => {
    const onAppearanceChange = vi.fn()
    const view = detailScreen({
      item,
      onBack: vi.fn(),
      onEdit: vi.fn(),
      onOpenUrl: vi.fn(),
      onAppearanceChange
    })
    document.body.append(view.element)

    view.element.querySelector('button[aria-label="Изменить иконку"]').click()
    document.querySelector('button[aria-label="Значок mail"]').click()
    document.querySelector('button[aria-label="Цвет #22c55e"]').click()
    expect(onAppearanceChange).not.toHaveBeenCalled()

    const done = [...document.querySelectorAll('button')].find((node) => node.textContent.trim() === 'Готово')
    done.click()
    expect(onAppearanceChange).toHaveBeenLastCalledWith({ icon: 'mail', iconColor: '#22c55e' })
    expect(document.querySelector('button[aria-label="Значок mail"]')).toBeNull()
    view.element.remove()
  })

  it('rolls the preview back when the picker is closed without confirming', () => {
    const onAppearanceChange = vi.fn()
    const view = detailScreen({
      item,
      onBack: vi.fn(),
      onEdit: vi.fn(),
      onOpenUrl: vi.fn(),
      onAppearanceChange
    })
    document.body.append(view.element)

    const avatar = view.element.querySelector('button[aria-label="Изменить иконку"]')
    const before = avatar.querySelector('svg path').getAttribute('d')
    avatar.click()
    document.querySelector('button[aria-label="Значок mail"]').click()
    document.querySelector('button[aria-label="Цвет #22c55e"]').click()

    document.querySelector('button[aria-label="Закрыть"]').click()
    expect(onAppearanceChange).not.toHaveBeenCalled()
    expect(avatar.querySelector('svg path').getAttribute('d')).toBe(before)
    expect(avatar.style.backgroundColor).not.toBe('rgb(34, 197, 94)')
    view.element.remove()
  })

  it('groups brand icons for services in the picker', () => {
    openIconPicker({ iconName: 'globe', color: '#22c55e', onPreview: vi.fn() })
    const services = [...document.querySelectorAll('button[aria-label^="Значок "]')].filter((node) =>
      SERVICE_ICONS.some((name) => node.getAttribute('aria-label') === `Значок ${name}`)
    )
    expect(services).toHaveLength(18)
    expect(document.querySelector('button[aria-label="Значок google"] svg path')).toBeTruthy()
    expect(document.querySelector('button[aria-label="Значок yandex"]')).toBeTruthy()
    expect([...document.querySelectorAll('span')].some((node) => node.textContent === 'Сервисы')).toBe(true)
    closeTopModal()
  })

  it('puts the password and its strength under the login', () => {
    const view = detailScreen({
      item,
      onBack: vi.fn(),
      onEdit: vi.fn(),
      onOpenUrl: vi.fn()
    })
    const blocks = [...view.element.querySelectorAll('div')]
      .filter((node) => node.className.includes('rounded-[6px]'))
    const hero = blocks[0]
    const facts = blocks.find((node) => node.textContent.includes('Логин'))

    expect(hero.textContent).not.toContain('Пароль')
    expect(hero.textContent).not.toContain('••••')
    expect(facts.textContent).toContain('Пароль')
    expect(facts.textContent).toContain('Энтропия')
    expect(facts.textContent.indexOf('Логин')).toBeLessThan(facts.textContent.indexOf('Пароль'))
  })

  it('uses the same compact corner radius as the card detail', () => {
    const view = detailScreen({
      item,
      onBack: vi.fn(),
      onEdit: vi.fn(),
      onOpenUrl: vi.fn()
    })
    const blocks = [...view.element.querySelectorAll('div')]

    expect(blocks.filter((node) => node.className.includes('rounded-[6px]')).length).toBeGreaterThanOrEqual(2)
    expect(blocks.some((node) => node.className.includes('rounded-2xl'))).toBe(false)
  })
})

describe('record photo', () => {
  it('offers adding a photo in the editor and shows it in detail', () => {
    const editor = editorScreen({
      preset: { type: 'note', title: 'Заметка' },
      onCancel: vi.fn(),
      onSave: vi.fn()
    })
    expect(editor.element.textContent).toContain('Добавить фото')
    expect(editor.element.querySelector('input[type="file"]')).toBeTruthy()

    const view = detailScreen({
      item: {
        id: 'n1',
        type: 'note',
        title: 'Заметка',
        category: 'other',
        notes: '',
        photo: 'data:image/png;base64,AAAA',
        updatedAt: Date.now()
      },
      onBack: vi.fn(),
      onEdit: vi.fn(),
      onDelete: vi.fn(),
      onOpenUrl: vi.fn()
    })

    expect(view.element.querySelector('img[alt="Фото"]')).toBeTruthy()
  })
})

describe('passport detail screen', () => {
  it('shows passport fields instead of password fields', () => {
    const view = detailScreen({
      item: {
        id: 'p1',
        type: 'passport',
        title: 'Паспорт',
        category: 'personal',
        passportSeries: 'MP',
        passportNumber: '1234567',
        passportIdNumber: '1234567A123PB4',
        passportIssuedBy: 'РОВД района',
        passportIssuedAt: '2020-05-01',
        passportValidUntil: '2030-05-01',
        notes: '',
        updatedAt: Date.now()
      },
      onBack: vi.fn(),
      onEdit: vi.fn(),
      onDelete: vi.fn()
    })
    const text = view.element.textContent

    expect(text).toContain('MP 1234567')
    expect(text).toContain('1234567A123PB4')
    expect(text).toContain('01.05.2020')
    expect(text).toContain('01.05.2030')
    expect(text).not.toContain('Пароль')
  })
})

describe('date field', () => {
  it('does not use a native date input with a system arrow', () => {
    const wrap = dateField({ label: 'Дата выдачи' })
    expect(wrap.querySelector('input[type="date"]')).toBeNull()
    expect(wrap.querySelector('button svg')).toBeTruthy()
  })

  it('formats the stored value and picks a day from the calendar', () => {
    const wrap = dateField({ label: 'Дата выдачи', value: '2020-05-01' })
    document.body.append(wrap)
    expect(wrap.textContent).toContain('01.05.2020')

    wrap.querySelector('button').click()
    const overlay = document.querySelector('.fixed.inset-0')
    expect(overlay.textContent).toContain('Май 2020')

    const day = [...overlay.querySelectorAll('button')].find((node) => node.textContent.trim() === '12')
    day.click()

    expect(wrap.input.value).toBe('2020-05-12')
    expect(wrap.textContent).toContain('12.05.2020')
    expect(document.querySelector('.fixed.inset-0')).toBeNull()
    wrap.remove()
  })
})

describe('categories screen', () => {
  it('lists categories with add and delete controls', () => {
    const onDelete = vi.fn()
    const view = categoriesScreen({
      categories: [
        { id: 'work', label: 'Работа', color: '#6366f1' },
        { id: 'other', label: 'Общее', color: '#94a3b8' }
      ],
      onBack: vi.fn(),
      onAdd: vi.fn(),
      onEdit: vi.fn(),
      onDelete
    })
    document.body.append(view.element)

    expect(view.element.textContent).toContain('Работа')
    expect(view.element.textContent).toContain('Добавить категорию')

    view.element.querySelector('button[aria-label="Удалить Общее"]').click()
    expect(onDelete).toHaveBeenCalledWith({ id: 'other', label: 'Общее', color: '#94a3b8' })
    view.element.remove()
  })
})

describe('settings data buttons', () => {
  it('renders export, import and token actions', () => {
    const onExport = vi.fn()
    const onImport = vi.fn()
    const onManageToken = vi.fn()
    const view = settingsScreen({
      settings: DEFAULT_SETTINGS,
      onBack: vi.fn(),
      onChange: vi.fn(),
      onChangeMaster: vi.fn(),
      onExport,
      onImport,
      onManageToken,
      serverProfile: 'zamok-abc123',
      onDeleteVault: vi.fn(),
      biometricsAvailable: false
    })
    document.body.append(view.element)

    expect(view.element.textContent).toContain('Экспорт')
    expect(view.element.textContent).toContain('Импорт')
    expect(view.element.textContent).toContain('GitHub-токен')
    expect(view.element.textContent).toContain('Профиль')
    expect(view.element.textContent).toContain('zamok-abc123')
    expect(view.element.textContent).toContain('Настройка категорий')
    const exportButton = [...view.element.querySelectorAll('button')].find((node) =>
      node.textContent.includes('Экспорт')
    )
    exportButton.click()
    expect(onExport).toHaveBeenCalled()

    const tokenButton = [...view.element.querySelectorAll('button')].find((node) =>
      node.textContent.includes('GitHub-токен')
    )
    tokenButton.click()
    expect(onManageToken).toHaveBeenCalled()
    view.element.remove()
  })
})

describe('transfer screen', () => {
  it('offers file and server options for export', () => {
    const onFile = vi.fn()
    const onServer = vi.fn()
    const onBack = vi.fn()
    const view = transferScreen({ mode: 'export', onBack, onFile, onServer })
    document.body.append(view.element)

    expect(view.element.textContent).toContain('Экспорт')
    expect(view.element.textContent).toContain('В файл')
    expect(view.element.textContent).toContain('На сервер')
    expect(view.element.textContent).toContain('.backup')

    const fileButton = [...view.element.querySelectorAll('button')].find((node) =>
      node.textContent.includes('В файл')
    )
    fileButton.click()
    expect(onFile).toHaveBeenCalledOnce()

    const serverButton = [...view.element.querySelectorAll('button')].find((node) =>
      node.textContent.includes('На сервер')
    )
    serverButton.click()
    expect(onServer).toHaveBeenCalledOnce()

    view.element.querySelector('[aria-label="Назад"]').click()
    expect(onBack).toHaveBeenCalledOnce()
    view.element.remove()
  })

  it('offers file and server options for import', () => {
    const view = transferScreen({ mode: 'import', onBack: vi.fn(), onFile: vi.fn(), onServer: vi.fn() })
    document.body.append(view.element)

    expect(view.element.textContent).toContain('Импорт')
    expect(view.element.textContent).toContain('Из файла')
    expect(view.element.textContent).toContain('С сервера')
    view.element.remove()
  })
})

describe('unlock screen', () => {
  it('shows icons on unlock and biometric buttons', () => {
    const view = unlockScreen({
      mode: 'unlock',
      onSubmit: vi.fn(),
      onBiometric: vi.fn(),
      biometricsReady: true
    })
    const buttons = [...view.element.querySelectorAll('button')]
    const submit = buttons.find((node) => node.textContent.includes('Разблокировать'))
    const biometric = buttons.find((node) => node.textContent.includes('Войти по биометрии'))

    expect(submit.querySelector('svg')).toBeTruthy()
    expect(biometric.querySelector('svg')).toBeTruthy()
  })

  it('never puts the cursor into the password field by itself', () => {
    vi.useFakeTimers()
    try {
      const view = unlockScreen({
        mode: 'unlock',
        onSubmit: vi.fn(),
        onBiometric: vi.fn(),
        biometricsReady: true
      })
      document.body.append(view.element)
      vi.advanceTimersByTime(2000)
      expect(document.activeElement).not.toBe(view.element.querySelector('input'))

      view.focus()
      expect(document.activeElement).not.toBe(view.element.querySelector('input'))
      view.element.remove()
    } finally {
      vi.useRealTimers()
    }
  })

  it('reveals each master password input with its own eye button', () => {
    const view = unlockScreen({
      mode: 'create',
      onSubmit: vi.fn(),
      onBiometric: vi.fn(),
      biometricsReady: false
    })
    const inputs = [...view.element.querySelectorAll('input')]

    expect(inputs).toHaveLength(2)
    for (const input of inputs) {
      const eye = input.parentElement.querySelector('button')
      expect(input.type).toBe('password')
      eye.click()
      expect(input.type).toBe('text')
      eye.click()
      expect(input.type).toBe('password')
    }
  })
})

describe('card detail screen', () => {
  const item = {
    id: '1',
    type: 'card',
    title: 'Банк',
    cardNumber: '4111111111113035',
    cardExpiry: '09/28',
    cardCvv: '123',
    cardPin: '4321',
    cardHolder: 'IVAN IVANOV',
    category: 'finance',
    notes: '',
    updatedAt: Date.now()
  }

  it('masks card data and reveals it on tap', () => {
    expect(maskedCardNumber(item.cardNumber)).toBe('•••• •••• •••• 3035')

    const view = cardDetailScreen({ item, onBack: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn() })
    document.body.append(view.element)

    expect(view.element.textContent).toContain('•••• •••• •••• 3035')
    expect(view.element.textContent).toContain('09/28')
    expect(view.element.textContent).toContain('Владелец')
    expect(view.element.textContent).toContain('IVAN IVANOV')

    const eyes = [...view.element.querySelectorAll('button[aria-label="Показать"]')]
    expect(eyes.length).toBeGreaterThanOrEqual(3)
    eyes[0].click()

    expect(view.element.textContent).toContain('4111 1111 1111 3035')
    view.element.remove()
  })

  it('keeps every copy icon in the same column', () => {
    const view = cardDetailScreen({ item, onBack: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn() })
    document.body.append(view.element)

    const copies = [...view.element.querySelectorAll('button[aria-label^="Скопировать"]')]
    expect(copies).toHaveLength(5)
    for (const copy of copies) {
      const group = copy.parentElement
      expect(group.children.length).toBe(2)
      expect(group.lastElementChild).toBe(copy)
      const first = group.firstElementChild
      if (first.tagName === 'BUTTON') expect(first.getAttribute('aria-label')).toBe('Показать')
    }

    view.element.remove()
  })

  it('detects the card network', () => {
    expect(cardBrand('4111111111111111')).toBe('VISA')
    expect(cardBrand('5555555555554444')).toBe('Mastercard')
    expect(cardBrand('2200123456789012')).toBe('МИР')
    expect(cardBrand('378282246310005')).toBe('Amex')
    expect(cardBrand('3530111333300000')).toBe('JCB')
    expect(cardBrand('6212345678901234')).toBe('UnionPay')
    expect(cardBrand('6011111111111117')).toBe('Discover')
    expect(cardBrand('')).toBe('КАРТА')
  })

  it('formats the expiry as MM/YY', () => {
    expect(formatExpiry('1223')).toBe('12/23')
    expect(formatExpiry('09/28')).toBe('09/28')
    expect(formatExpiry('9/28')).toBe('09/28')
    expect(formatExpiry('')).toBe('')
  })

  it('opens the card color picker on a tap anywhere on the card', async () => {
    const onColorChange = vi.fn()
    const view = cardDetailScreen({ item, onBack: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onColorChange })
    document.body.append(view.element)

    view.element.querySelector('[style*="linear-gradient"]').click()
    const graphite = document.body.querySelector('button[aria-label="Графит"]')
    expect(graphite).toBeTruthy()

    graphite.click()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(onColorChange).toHaveBeenCalledWith('graphite')
    expect(document.body.textContent).not.toContain('Выберите оформление')
    view.element.remove()
  })

  it('does not open the color picker when the card number eye is tapped', () => {
    const view = cardDetailScreen({ item, onBack: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn() })
    document.body.append(view.element)

    const eye = view.element.querySelector('div[style*="linear-gradient"] button[aria-label="Показать"]')
    eye.click()

    expect(view.element.textContent).toContain('4111 1111 1111 3035')
    expect(document.body.textContent).not.toContain('Выберите оформление')
    view.element.remove()
  })

  it('offers three rows of colors in the icon picker', () => {
    openIconPicker({ iconName: 'mail', color: '#ec4899', onPreview: vi.fn() })
    expect(document.querySelectorAll('button[aria-label^="Цвет "]')).toHaveLength(24)
    closeTopModal()
  })

  it('shows the card brand on a badge painted with the chosen card colour', () => {
    const visa = itemCard({ ...item, cardNumber: '4111111111113035', cardColor: 'rose' }, {
      onOpen: vi.fn(),
      onToggleFavorite: vi.fn()
    })
    const badge = visa.firstElementChild
    expect(badge.textContent).toBe('VISA')
    expect(badge.className).toContain('rounded-[5px]')
    expect(badge.style.background).toContain('linear-gradient')
    expect(badge.style.background).toContain('#e11d48')

    const mastercard = itemCard({ ...item, cardNumber: '5155555555555555', cardColor: 'emerald' }, {
      onOpen: vi.fn(),
      onToggleFavorite: vi.fn()
    })
    expect(mastercard.firstElementChild.style.background).toContain('#059669')
    const circles = [...mastercard.firstElementChild.querySelectorAll('span')].filter((node) =>
      node.className.includes('rounded-full')
    )
    expect(circles).toHaveLength(2)
    expect(mastercard.firstElementChild.textContent).toBe('')
  })
})

describe('settings update section', () => {
  const release = {
    version: '1.1',
    name: 'Замок 1.1',
    url: 'https://github.com/adminmik7/zamok/releases/tag/v1.1',
    asset: { name: 'zamok-1.1.apk', url: 'https://example.com/zamok-1.1.apk', size: 7340032 }
  }

  const renderSettings = (overrides = {}) => {
    const view = settingsScreen({
      settings: DEFAULT_SETTINGS,
      onBack: vi.fn(),
      onChange: vi.fn(),
      onChangeMaster: vi.fn(),
      onExport: vi.fn(),
      onImport: vi.fn(),
      onDeleteVault: vi.fn(),
      biometricsAvailable: false,
      appVersion: '1.0',
      onCheckUpdate: vi.fn(),
      onDownloadUpdate: vi.fn(),
      onOpenRelease: vi.fn(),
      ...overrides
    })
    document.body.append(view.element)
    return view
  }

  const buttonWith = (view, text) =>
    [...view.element.querySelectorAll('button')].find((node) => node.textContent.includes(text))

  it('shows the app version and the current update state', () => {
    const view = renderSettings()
    expect(view.element.textContent).toContain('Zamok 1.0')
    expect(view.element.textContent).toContain('Установленная версия: 1.0')
    expect(buttonWith(view, 'Скачать обновление').className).toContain('hidden')
    expect(buttonWith(view, 'Сменить мастер-пароль').className).toContain('text-danger-400')
    view.element.remove()
  })

  it('offers the download button when a newer release is found', async () => {
    const onCheckUpdate = vi.fn(() => Promise.resolve({ available: true, release }))
    const onDownloadUpdate = vi.fn(() => Promise.resolve({ ok: true }))
    const view = renderSettings({ onCheckUpdate, onDownloadUpdate })

    buttonWith(view, 'Проверить обновления').click()
    await vi.waitFor(() => expect(view.element.textContent).toContain('Новая версия 1.1'))

    const downloadButton = buttonWith(view, 'Скачать обновление')
    expect(downloadButton.className).not.toContain('hidden')
    downloadButton.click()
    await vi.waitFor(() => expect(onDownloadUpdate).toHaveBeenCalledWith(expect.objectContaining({ version: '1.1' })))
    view.element.remove()
  })

  it('reports a failed check and keeps the release page link', async () => {
    const onOpenRelease = vi.fn()
    const view = renderSettings({
      onCheckUpdate: vi.fn(() => Promise.resolve({ available: false, error: 'нет связи' })),
      onOpenRelease
    })

    buttonWith(view, 'Проверить обновления').click()
    await vi.waitFor(() => expect(view.element.textContent).toContain('Не удалось проверить обновления'))

    buttonWith(view, 'Открыть страницу релиза').click()
    expect(onOpenRelease).toHaveBeenCalled()
    view.element.remove()
  })

  it('refreshes the update block in place when the check finishes', () => {
    const view = renderSettings()

    expect(view.element.textContent).toContain('Установленная версия: 1.0')

    view.setUpdate({ status: 'checking' })
    expect(view.element.textContent).toContain('Проверяем наличие обновлений')

    view.setUpdate({ status: 'available', release })
    expect(view.element.textContent).toContain('Новая версия 1.1')
    expect(buttonWith(view, 'Скачать обновление').className).not.toContain('hidden')
    expect(buttonWith(view, 'Проверить обновления').className).toContain('hidden')

    view.setUpdate({ status: 'current' })
    expect(view.element.textContent).toContain('Обновлений нет')
    expect(buttonWith(view, 'Скачать обновление').className).toContain('hidden')
    expect(buttonWith(view, 'Проверить обновления').className).not.toContain('hidden')

    view.element.remove()
  })
})
