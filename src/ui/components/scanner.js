import jsQR from 'jsqr'
import { el, icon, ICONS } from '../dom.js'
import { openModal } from './feedback.js'

// Camera scanner for barcodes.
//
// Decoding happens in two ways:
//   - BarcodeDetector (built into Chromium) when the WebView provides it —
//     it is the same detector the platform uses and reads EAN/Code 128 fast;
//   - jsQR as a fallback, so the scanner still works on WebViews without it.
//
// Both work on a crop of the frame: the barcode is looked for in the full
// picture, then in the centre, and each crop is scaled up, so a small code
// at the edge of the picture is still found.

const DETECT_FORMATS = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'code_93',
  'itf',
  'codabar',
  'qr_code',
  'data_matrix',
  'pdf417',
  'aztec'
]

const CROPS = [
  { scale: 1, ratio: 1 },
  { scale: 1, ratio: 0.7 },
  { scale: 1, ratio: 0.45 }
]

const TARGET_WIDTH = 1000

async function createDetector() {
  if (typeof window === 'undefined' || !window.BarcodeDetector) return null
  try {
    const supported = (await window.BarcodeDetector.getSupportedFormats?.()) ?? DETECT_FORMATS
    const formats = DETECT_FORMATS.filter((format) => supported.includes(format))
    if (!formats.length) return null
    return new window.BarcodeDetector({ formats })
  } catch (error) {
    console.warn('BarcodeDetector is not available:', error)
    return null
  }
}

export function openScanner({ title = 'Сканировать штрихкод', onScan, onClose } = {}) {
  const video = document.createElement('video')
  video.setAttribute('playsinline', '')
  video.setAttribute('muted', '')
  video.setAttribute('autoplay', '')
  video.muted = true
  video.autoplay = true
  video.className = 'h-full w-full bg-black object-cover'

  const hint = el('p', { class: 'text-center text-sm text-ink-400', text: 'Наведите камеру на штрихкод' })
  const error = el('p', { class: 'hidden text-center text-sm text-danger-400' })
  const status = el('p', { class: 'text-center text-xs text-ink-500', text: 'Ищу код…' })

  const body = el('div', { class: 'flex min-h-0 flex-1 flex-col items-center justify-center gap-4' }, [
    el('div', { class: 'relative aspect-[3/4] max-h-full w-full max-w-sm overflow-hidden rounded-[6px] border border-ink-800 bg-black' }, [video]),
    el('div', { class: 'shrink-0 space-y-1.5' }, [hint, status, error])
  ])

  let stream = null
  let timer = null
  let stopped = false
  let detector = null
  let frame = 0
  let failures = 0
  let noHit = 0

  const stop = () => {
    if (stopped) return
    stopped = true
    if (timer) clearTimeout(timer)
    timer = null
    stream?.getTracks().forEach((track) => track.stop())
    stream = null
    onClose?.()
  }

  const modal = openModal({
    title,
    body,
    fullscreen: true,
    onClose: stop
  })

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })

  const finish = (value, format) => {
    if (stopped) return
    stop()
    modal.close()
    onScan?.(value, format)
  }

  // Draws the current video frame into the canvas, cropped and scaled up.
  const drawCrop = (crop) => {
    const videoWidth = video.videoWidth
    const videoHeight = video.videoHeight
    const cropWidth = Math.round(videoWidth * crop.ratio)
    const cropHeight = Math.round(videoHeight * crop.ratio)
    const offsetX = Math.round((videoWidth - cropWidth) / 2)
    const offsetY = Math.round((videoHeight - cropHeight) / 2)

    const scale = Math.max(1, Math.min(1.6, TARGET_WIDTH / Math.max(1, cropWidth)))
    const heightScale = cropHeight * scale > 1400 ? 1400 / cropHeight : scale
    const finalScale = Math.max(1, Math.min(scale, heightScale))
    canvas.width = Math.round(cropWidth * finalScale)
    canvas.height = Math.round(cropHeight * finalScale)
    context.drawImage(
      video,
      offsetX,
      offsetY,
      cropWidth,
      cropHeight,
      0,
      0,
      canvas.width,
      canvas.height
    )
  }

  const scanStep = async () => {
    if (stopped) return
    try {
      if (video.readyState >= 2 && video.videoWidth) {
        const crop = CROPS[frame % CROPS.length]
        frame += 1
        drawCrop(crop)

        if (detector) {
          const results = await detector.detect(canvas)
          const hit = results.find((result) => result.rawValue)
          if (hit) {
            finish(String(hit.rawValue).trim(), hit.format)
            return
          }
          // The platform detector may not know the format at all (some
          // WebViews only do QR). After a while we continue with jsQR.
          noHit += 1
          if (noHit > 60) {
            console.info('BarcodeDetector found nothing, switching to jsQR')
            detector = null
            noHit = 0
          }
        } else {
          const image = context.getImageData(0, 0, canvas.width, canvas.height)
          const result = jsQR(image.data, image.width, image.height, {
            inversionAttempts: 'attemptBoth'
          })
          if (result?.data) {
            finish(String(result.data).trim(), result.format)
            return
          }
          noHit = 0
        }
        failures = 0
        status.textContent =
          frame > 90
            ? `Код не найден (${detector ? 'BarcodeDetector' : 'jsQR'}). Поднесите ближе, держите ровно и включите свет`
            : 'Ищу код…'
      } else {
        status.textContent = 'Готовлю камеру…'
      }
    } catch (error) {
      failures += 1
      console.error('Barcode scan failed:', error)
      status.textContent = 'Продолжаю искать…'
      if (failures > 30) {
        error.textContent = 'Не удалось распознать штрихкод. Поднесите карту ближе и держите ровно.'
        error.classList.remove('hidden')
      }
    }
    timer = setTimeout(scanStep, 120)
  }

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      error.textContent = 'Камера недоступна в этом приложении — введите штрихкод вручную'
      error.classList.remove('hidden')
      hint.classList.add('hidden')
      return
    }
    try {
      detector = await createDetector()
      if (detector) console.info('Using BarcodeDetector')
      else console.info('Using jsQR fallback')

      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      })
      video.srcObject = stream
      // play() is not awaited: on some WebViews the promise only settles
      // once the user taps the video, and waiting for it would freeze the
      // whole scanner.
      video.play().catch((error) => console.warn('Video play was rejected:', error))
      scanStep()
    } catch (error_) {
      console.error('Camera start failed:', error_)
      error.textContent = 'Не удалось включить камеру — разрешите доступ к камере и попробуйте снова'
      error.classList.remove('hidden')
      hint.classList.add('hidden')
    }
  }

  start()

  return modal
}

export function scannerButton({ onScan, label = 'Сканировать штрихкод' } = {}) {
  return el('button', {
    type: 'button',
    class: 'rounded-xl p-2.5 text-ink-400 transition active:scale-95 hover:bg-ink-800 hover:text-ink-100',
    'aria-label': label,
    onclick: (event) => {
      event.preventDefault()
      openScanner({ onScan })
    }
  }, [icon(ICONS.scanBarcode, 'w-4.5 h-4.5')])
}
