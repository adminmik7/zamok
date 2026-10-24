import { el, icon, ICONS } from '../dom.js'
import { field, textareaField, selectField, strengthMeter, dateField } from '../components/form.js'
import { CATEGORIES } from '../../core/store.js'
import { openGenerator } from './generator.js'
import { parseOtpUri } from '../../core/totp.js'
import { toast, openModal, closeTopModal } from '../components/feedback.js'
import { openScanner } from '../components/scanner.js'
import { openNfcCardReader } from '../components/nfc-card.js'
import { nfcStatus } from '../../platform/nfc.js'

// ponytail: photos live inside the encrypted vault JSON (data URL, max 1280px,
// JPEG 0.75). Fine for a few photos per record; if users need many/large images,
// move them to Filesystem with encrypted blobs keyed by item id.
async function compressImage(file, max = 1280, quality = 0.75) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
  const image = await new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('bad image'))
    img.src = dataUrl
  })
  const scale = Math.min(1, max / Math.max(image.width, image.height))
  if (scale === 1 && dataUrl.length < 300_000) return dataUrl
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(image.width * scale)
  canvas.height = Math.round(image.height * scale)
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}

const sanitizeHolder = (value) =>
  value.toUpperCase().replace(/[^A-Z '-]/g, '').replace(/\s+/g, ' ').trimStart()
const formatCardNumberInput = (value) =>
  value.replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim()
const formatExpiryInput = (value) => {
  const digits = value.replace(/\D/g, '').slice(0, 4)
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits
}
const sanitizePassportSeries = (value) => value.toUpperCase().replace(/[^A-ZА-ЯЁ]/g, '').slice(0, 2)
const sanitizePassportNumber = (value) => value.replace(/\D/g, '').slice(0, 7)
const sanitizePassportId = (value) => value.toUpperCase().replace(/[^A-ZА-ЯЁ0-9]/g, '').slice(0, 14)
// Loyalty barcodes are usually digits, but Code 128 cards can carry letters.
const sanitizeLoyaltyBarcode = (value) =>
  String(value ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 32)

export function editorScreen({ item, preset = {}, defaultCategory = 'other', onCancel, onSave, onDelete, onScannerOpen, onScannerClose }) {
  const draft = {
    id: item?.id,
    title: item?.title ?? preset.title ?? '',
    username: item?.username ?? preset.username ?? '',
    password: item?.password ?? preset.password ?? '',
    url: item?.url ?? preset.url ?? '',
    notes: item?.notes ?? preset.notes ?? '',
    category: item?.category ?? preset.category ?? defaultCategory,
    favorite: item?.favorite ?? false,
    totpSecret: item?.totpSecret ?? '',
    totpIssuer: item?.totpIssuer ?? '',
    totpAccount: item?.totpAccount ?? '',
    type: item?.type ?? preset.type ?? 'login',
    cardNumber: item?.cardNumber ?? preset.cardNumber ?? '',
    cardExpiry: item?.cardExpiry ?? preset.cardExpiry ?? '',
    cardCvv: item?.cardCvv ?? preset.cardCvv ?? '',
    cardPin: item?.cardPin ?? preset.cardPin ?? '',
    cardHolder: item?.cardHolder ?? preset.cardHolder ?? '',
    cardBrand: item?.cardBrand ?? preset.cardBrand ?? '',
    passportSeries: item?.passportSeries ?? preset.passportSeries ?? '',
    passportNumber: item?.passportNumber ?? preset.passportNumber ?? '',
    passportIdNumber: item?.passportIdNumber ?? preset.passportIdNumber ?? '',
    passportIssuedBy: item?.passportIssuedBy ?? preset.passportIssuedBy ?? '',
    passportIssuedAt: item?.passportIssuedAt ?? preset.passportIssuedAt ?? '',
    passportValidUntil: item?.passportValidUntil ?? preset.passportValidUntil ?? '',
    loyaltyBarcode: item?.loyaltyBarcode ?? preset.loyaltyBarcode ?? '',
    photo: item?.photo ?? preset.photo ?? ''
  }

  const isCard = draft.type === 'card'
  const isPassport = draft.type === 'passport'
  const isLoyalty = draft.type === 'loyalty'
  const isOtp =
    !isCard && !isPassport && !isLoyalty &&
    (draft.type === 'otp' || Boolean(draft.totpSecret && !draft.password && !draft.username))
  const isNote = !isCard && !isPassport && !isOtp && draft.type === 'note'
  const showLoginFields = !isCard && !isOtp && !isPassport && !isNote && !isLoyalty
  const titleField = field({
    label: isLoyalty ? 'Магазин или программа' : 'Название',
    value: draft.title,
    placeholder: isCard
      ? 'Например, Сбербанк'
      : isPassport
        ? 'Например, Паспорт РБ'
        : isLoyalty
          ? 'Например, Пятёрочка'
          : 'Например, Яндекс Почта',
    icon: isCard ? ICONS.card : isPassport ? ICONS.id : isLoyalty ? ICONS.ticket : ICONS.key
  })
  const cardNumberField = field({
    label: 'Номер карты',
    value: draft.cardNumber,
    placeholder: '0000 0000 0000 0000',
    inputmode: 'numeric',
    icon: ICONS.card,
    action: {
      icon: ICONS.nfc,
      label: 'Считать карту по NFC',
      onClick: () => {
        onScannerOpen?.()
        openNfcCardReader({
          onClose: () => onScannerClose?.(),
          onResult: (card) => {
            if (card.pan) {
              cardNumberField.input.value = formatCardNumberInput(card.pan)
              cardNumberField.input.dispatchEvent(new Event('input'))
            }
            if (card.brand) draft.cardBrand = card.brand
            if (card.expiry) {
              cardExpiryField.input.value = formatExpiryInput(card.expiry)
              cardExpiryField.input.dispatchEvent(new Event('input'))
            }
            if (card.holder) {
              const cleaned = sanitizeHolder(card.holder)
              cardHolderField.input.value = cleaned || card.holder.trim().toUpperCase()
            }
            toast('Данные карты заполнены', 'success', 1800)
          }
        })
      }
    }
  })
  const cardExpiryField = field({ label: 'Срок действия', value: draft.cardExpiry, placeholder: 'хх/хх', inputmode: 'numeric' })
  const cardCvvField = field({ label: 'CVV', value: draft.cardCvv, type: 'password', placeholder: '123', inputmode: 'numeric', reveal: true })
  const cardPinField = field({ label: 'PIN', value: draft.cardPin, type: 'password', placeholder: '••••', inputmode: 'numeric', reveal: true })
  const cardHolderField = field({ label: 'Владелец', value: draft.cardHolder, placeholder: 'IVAN IVANOV' })
  const passportSeriesField = field({ label: 'Серия', value: draft.passportSeries, placeholder: 'MP' })
  const passportNumberField = field({ label: 'Номер', value: draft.passportNumber, placeholder: '1234567', inputmode: 'numeric' })
  const passportIdField = field({
    label: 'Идентификационный номер',
    value: draft.passportIdNumber,
    placeholder: '1234567A123PB4'
  })
  const passportIssuedByField = field({ label: 'Кем выдан', value: draft.passportIssuedBy, placeholder: 'РОВД района' })
  const passportIssuedAtField = dateField({ label: 'Дата выдачи', value: draft.passportIssuedAt })
  const passportValidField = dateField({ label: 'Действителен до', value: draft.passportValidUntil })
  const loyaltyBarcodeField = field({
    label: 'Штрихкод',
    value: draft.loyaltyBarcode,
    placeholder: 'Цифры под штрихкодом карты',
    inputmode: 'numeric',
    icon: ICONS.ticket,
    action: {
      icon: ICONS.scanBarcode,
      label: 'Сканировать штрихкод',
      onClick: () => {
        onScannerOpen?.()
        openScanner({
          onClose: () => onScannerClose?.(),
          onScan: (value) => {
            const sanitized = sanitizeLoyaltyBarcode(value)
            if (!sanitized) return
            loyaltyBarcodeField.input.value = sanitized
            loyaltyBarcodeField.input.dispatchEvent(new Event('input'))
            toast('Штрихкод отсканирован', 'success', 1600)
          }
        })
      }
    }
  })

  if (isLoyalty) {
    loyaltyBarcodeField.input.value = sanitizeLoyaltyBarcode(draft.loyaltyBarcode)
    loyaltyBarcodeField.input.addEventListener('input', () => {
      loyaltyBarcodeField.input.value = sanitizeLoyaltyBarcode(loyaltyBarcodeField.input.value)
    })
  }

  if (isPassport) {
    passportSeriesField.input.value = sanitizePassportSeries(draft.passportSeries)
    passportNumberField.input.value = sanitizePassportNumber(draft.passportNumber)
    passportIdField.input.value = sanitizePassportId(draft.passportIdNumber)
    passportSeriesField.input.addEventListener('input', () => {
      passportSeriesField.input.value = sanitizePassportSeries(passportSeriesField.input.value)
    })
    passportNumberField.input.addEventListener('input', () => {
      passportNumberField.input.value = sanitizePassportNumber(passportNumberField.input.value)
    })
    passportIdField.input.addEventListener('input', () => {
      passportIdField.input.value = sanitizePassportId(passportIdField.input.value)
    })
  }

  if (isCard) {
    nfcStatus().then((info) => {
      if (!info.available) cardNumberField.actionButton?.classList.add('hidden')
    })
    cardNumberField.input.value = formatCardNumberInput(draft.cardNumber)
    cardHolderField.input.value = sanitizeHolder(draft.cardHolder)
    cardExpiryField.input.value = formatExpiryInput(draft.cardExpiry)
    cardExpiryField.input.maxLength = 5
    cardNumberField.input.addEventListener('input', () => {
      cardNumberField.input.value = formatCardNumberInput(cardNumberField.input.value)
    })
    cardExpiryField.input.addEventListener('input', () => {
      cardExpiryField.input.value = formatExpiryInput(cardExpiryField.input.value)
    })
    cardHolderField.input.addEventListener('input', () => {
      cardHolderField.input.value = sanitizeHolder(cardHolderField.input.value)
    })
  }
  const usernameField = field({ label: 'Логин или email', value: draft.username, placeholder: 'name@example.com', icon: ICONS.globe, autocomplete: 'off' })
  const passwordField = field({ label: 'Пароль', value: draft.password, type: 'password', placeholder: '••••••••', icon: ICONS.lock, reveal: true })
  const notesField = textareaField({ label: 'Заметки', value: draft.notes, placeholder: 'Дополнительная информация' })
  const categoryField = selectField({
    label: 'Категория',
    value: draft.category,
    options: CATEGORIES.map((category) => ({ value: category.id, label: category.label }))
  })
  const totpField = field({ label: 'TOTP-секрет', value: draft.totpSecret, placeholder: 'Base32 или otpauth:// URI', icon: ICONS.clock })
  const issuerField = field({ label: 'Издатель TOTP', value: draft.totpIssuer, placeholder: 'Google Authenticator' })

  const meter = el('div')
  const syncMeter = () => meter.replaceChildren(strengthMeter(passwordField.input.value))
  passwordField.input.addEventListener('input', syncMeter)
  syncMeter()

  const generateBtn = el('button', {
    class:
      'flex w-full items-center justify-center gap-2 rounded-xl bg-ink-800 py-2.5 text-sm font-semibold text-ink-200 transition active:scale-[0.98] hover:bg-ink-700',
    onclick: () => {
      openGenerator((value) => {
        passwordField.input.value = value
        syncMeter()
        toast('Пароль сгенерирован', 'success', 1400)
      })
    }
  }, [icon(ICONS.dice, 'w-4.5 h-4.5'), el('span', { text: 'Сгенерировать пароль' })])

  const favoriteIcon = icon(ICONS.star, 'w-4.5 h-4.5')
  const favoriteLabel = el('span')
  const favoriteBtn = el('button', {
    type: 'button',
    class: '',
    onclick: () => {
      draft.favorite = !draft.favorite
      syncFavorite()
    }
  }, [favoriteIcon, favoriteLabel])
  const syncFavorite = () => {
    favoriteBtn.className = `flex w-full items-center justify-center gap-2 rounded-xl border py-3 text-sm font-semibold transition active:scale-[0.98] ${
      draft.favorite
        ? 'border-warn-500/40 bg-warn-500/15 text-warn-400'
        : 'border-ink-800 bg-ink-900/60 text-ink-300 hover:border-ink-700 hover:bg-ink-800'
    }`
    favoriteLabel.textContent = draft.favorite ? 'В избранном' : 'Добавить в избранное'
    favoriteIcon.setAttribute('fill', draft.favorite ? 'currentColor' : 'none')
  }
  syncFavorite()

  totpField.input.addEventListener('input', () => {
    const value = totpField.input.value.trim()
    if (value.startsWith('otpauth://')) {
      const parsed = parseOtpUri(value)
      if (parsed) {
        totpField.input.value = parsed.secret
        issuerField.input.value = parsed.issuer || issuerField.input.value
        toast('TOTP-ключ распознан', 'success', 1600)
      } else {
        toast('Не удалось разобрать ссылку TOTP', 'error', 2000)
      }
    }
  })


  let photoValue = draft.photo
  const photoPreview = el('div')
  let releasePhotoPick = null
  const beginPhotoPick = (input) => {
    if (releasePhotoPick) return
    onScannerOpen?.()
    let done = false
    let fallback = null
    const release = () => {
      if (done) return
      done = true
      releasePhotoPick = null
      window.removeEventListener('focus', release)
      input.removeEventListener('cancel', release)
      if (fallback) clearTimeout(fallback)
      onScannerClose?.()
    }
    fallback = setTimeout(release, 180000)
    releasePhotoPick = release
    input.addEventListener('cancel', release)
    window.addEventListener('focus', release)
    input.value = ''
    input.click()
  }
  const sourceButton = (label, iconPath, input) =>
    el('button', {
      type: 'button',
      class:
        'flex w-full items-center gap-3 rounded-xl border border-ink-800 bg-ink-900/60 p-3 text-left text-sm font-semibold text-ink-200 transition active:scale-[0.99] hover:border-ink-700 hover:bg-ink-800',
      onclick: () => {
        closeTopModal()
        beginPhotoPick(input)
      }
    }, [
      el('span', { class: 'flex h-9 w-9 items-center justify-center rounded-full bg-brand-500/15 text-brand-300' }, [
        icon(iconPath, 'w-4.5 h-4.5')
      ]),
      el('span', { text: label })
    ])

  const cameraInput = el('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'hidden' })
  const galleryInput = el('input', { type: 'file', accept: 'image/*', class: 'hidden' })

  const renderPhoto = () => {
    photoLabel.textContent = photoValue ? 'Заменить фото' : 'Добавить фото'
    photoPreview.replaceChildren(
      ...(photoValue
        ? [
            el('div', { class: 'relative overflow-hidden rounded-xl border border-ink-800' }, [
              el('img', { src: photoValue, alt: 'Фото записи', class: 'max-h-48 w-full object-cover' }),
              el('button', {
                type: 'button',
                class: 'absolute top-2 right-2 rounded-full bg-ink-950/80 p-2 text-ink-100 transition active:scale-90',
                'aria-label': 'Удалить фото',
                onclick: () => {
                  photoValue = ''
                  renderPhoto()
                }
              }, [icon(ICONS.close, 'w-4 h-4')])
            ])
          ]
        : [])
    )
  }

  const pickPhoto = () => {
    openModal({
      title: 'Добавить фото',
      body: el('div', { class: 'space-y-2' }, [
        sourceButton('Сделать фото', ICONS.camera, cameraInput),
        sourceButton('Выбрать из галереи', ICONS.photo, galleryInput)
      ])
    })
  }

  for (const input of [cameraInput, galleryInput]) {
    input.addEventListener('change', async () => {
      const file = input.files?.[0]
      try {
        if (!file) return
        photoValue = await compressImage(file)
        renderPhoto()
        toast('Фото добавлено', 'success', 1400)
      } catch {
        toast('Не удалось загрузить фото', 'error', 2000)
      } finally {
        releasePhotoPick?.()
      }
    })
  }

  const photoLabel = el('span', { text: 'Добавить фото' })
  const photoButton = el('button', {
    type: 'button',
    class:
      'flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-ink-700 py-2.5 text-sm font-semibold text-ink-300 transition active:scale-[0.98] hover:border-ink-600 hover:bg-ink-900',
    onclick: pickPhoto
  }, [icon(ICONS.camera, 'w-4.5 h-4.5'), photoLabel])

  const photoSection = el('div', { class: 'space-y-2' }, [
    el('span', { class: 'text-xs font-medium tracking-wide text-ink-400 uppercase', text: 'Фото' }),
    photoPreview,
    photoButton,
    cameraInput,
    galleryInput
  ])
  renderPhoto()

  const collectPayload = () => ({
    id: draft.id,
    type: draft.type,
    title: titleField.input.value,
    username: showLoginFields ? usernameField.input.value : draft.username,
    password: showLoginFields ? passwordField.input.value : draft.password,
    url: draft.url,
    notes: notesField.input.value,
    category: categoryField.input.value,
    favorite: draft.favorite,
    totpSecret: isOtp ? totpField.input.value.trim().replace(/\s/g, '').toUpperCase() : draft.totpSecret,
    totpIssuer: isOtp ? issuerField.input.value : draft.totpIssuer,
    cardNumber: isCard ? cardNumberField.input.value.trim() : draft.cardNumber,
    cardExpiry: isCard ? cardExpiryField.input.value.trim() : draft.cardExpiry,
    cardCvv: isCard ? cardCvvField.input.value.trim() : draft.cardCvv,
    cardPin: isCard ? cardPinField.input.value.trim() : draft.cardPin,
    cardHolder: isCard ? cardHolderField.input.value.trim() : draft.cardHolder,
    cardBrand: isCard ? draft.cardBrand : '',
    passportSeries: isPassport ? passportSeriesField.input.value.trim().toUpperCase() : draft.passportSeries,
    passportNumber: isPassport ? passportNumberField.input.value.trim() : draft.passportNumber,
    passportIdNumber: isPassport ? passportIdField.input.value.trim().toUpperCase() : draft.passportIdNumber,
    passportIssuedBy: isPassport ? passportIssuedByField.input.value.trim() : draft.passportIssuedBy,
    passportIssuedAt: isPassport ? passportIssuedAtField.input.value : draft.passportIssuedAt,
    passportValidUntil: isPassport ? passportValidField.input.value : draft.passportValidUntil,
    loyaltyBarcode: isLoyalty ? loyaltyBarcodeField.input.value.trim() : draft.loyaltyBarcode,
    photo: photoValue
  })

  const initialPayload = JSON.stringify(collectPayload())
  const isDirty = () => JSON.stringify(collectPayload()) !== initialPayload

  const save = async () => {
    const payload = collectPayload()
    const values = [
      payload.title, payload.username, payload.password, payload.notes, payload.photo,
      payload.totpSecret, payload.cardNumber, payload.cardExpiry,
      payload.cardCvv, payload.cardPin, payload.cardHolder,
      payload.passportSeries, payload.passportNumber, payload.passportIdNumber,
      payload.passportIssuedBy, payload.passportIssuedAt, payload.passportValidUntil,
      payload.loyaltyBarcode
    ]
    if (!values.some((value) => value.trim())) {
      toast('Заполните хотя бы одно поле', 'error', 2000)
      return
    }
    await onSave(payload)
  }

  const header = el('div', { class: 'flex items-center gap-3' }, [
    el('button', {
      class: 'rounded-xl p-2.5 text-ink-300 transition active:scale-90 hover:bg-ink-800',
      'aria-label': 'Отмена',
      onclick: onCancel
    }, [icon(ICONS.close, 'w-5 h-5')]),
    el('h1', {
      class: 'flex-1 text-lg font-semibold text-ink-50',
      text: item ? 'Изменить запись' : 'Новая запись'
    }),
    el('button', {
      class: 'rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-soft transition active:scale-95 hover:bg-brand-400',
      text: 'Сохранить',
      onclick: save
    })
  ])

  const body = isCard
    ? el('div', { class: 'space-y-4' }, [
        titleField,
        cardNumberField,
        el('div', { class: 'grid grid-cols-2 gap-3' }, [cardExpiryField, cardCvvField]),
        cardPinField,
        cardHolderField,
        categoryField,
        notesField,
        photoSection,
        favoriteBtn
      ])
    : isPassport
      ? el('div', { class: 'space-y-4' }, [
          titleField,
          el('div', { class: 'grid grid-cols-[6rem_1fr] gap-3' }, [passportSeriesField, passportNumberField]),
          passportIdField,
          passportIssuedByField,
          passportIssuedAtField,
          passportValidField,
          categoryField,
          notesField,
          photoSection,
          favoriteBtn
        ])
      : isOtp
      ? el('div', { class: 'space-y-4' }, [
          titleField,
          totpField,
          issuerField,
          categoryField,
          notesField,
          photoSection,
          favoriteBtn
        ])
      : isNote
      ? el('div', { class: 'space-y-4' }, [
          titleField,
          notesField,
          categoryField,
          photoSection,
          favoriteBtn
        ])
      : isLoyalty
      ? el('div', { class: 'space-y-4' }, [
          titleField,
          loyaltyBarcodeField,
          categoryField,
          notesField,
          photoSection,
          favoriteBtn
        ])
      : el('div', { class: 'space-y-4' }, [
          titleField,
          usernameField,
          passwordField,
          meter,
          generateBtn,
          categoryField,
          notesField,
          photoSection,
          favoriteBtn
        ])

  const root = el('div', { class: 'flex h-full flex-col bg-ink-950' }, [
    el('div', { class: 'border-b border-ink-800/80 bg-ink-950/90 px-4 py-3 backdrop-blur-xl' }, [header]),
    el('div', { class: 'flex-1 overflow-y-auto px-4 py-4 pb-10 no-scrollbar' }, [
      body,
      item && onDelete
        ? el('button', {
            class:
              'mt-4 w-full rounded-xl bg-danger-500/15 py-3 text-sm font-semibold text-danger-400 transition active:scale-95 hover:bg-danger-500/25',
            text: 'Удалить запись',
            onclick: onDelete
          })
        : null
    ]),
    el('div', { class: 'safe-bottom' })
  ])

  const focusTargets = {
    notes: notesField,
    totp: totpField,
    password: passwordField,
    cardNumber: cardNumberField,
    loyaltyBarcode: loyaltyBarcodeField
  }

  return { element: root, focus: () => (focusTargets[preset.focus] ?? titleField).input.focus(), isDirty }
}
