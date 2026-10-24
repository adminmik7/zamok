// Privacy blur for the system biometric dialog.
//
// The fingerprint prompt is a separate system window, so the app content stays
// visible behind it. While the prompt is open we cover the screen with a
// blurred layer, so a shoulder surfer cannot read the vault screen.

const OVERLAY_ID = 'privacy-blur-overlay'

const supportsBlur = () => {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return false
  return (
    CSS.supports('backdrop-filter', 'blur(10px)') ||
    CSS.supports('-webkit-backdrop-filter', 'blur(10px)')
  )
}

function ensureOverlay() {
  let overlay = document.getElementById(OVERLAY_ID)
  if (overlay) return overlay
  overlay = document.createElement('div')
  overlay.id = OVERLAY_ID
  overlay.className = 'privacy-blur'
  overlay.setAttribute('aria-hidden', 'true')
  if (!supportsBlur()) overlay.classList.add('no-blur')
  document.body.append(overlay)
  return overlay
}

export function setPrivacyBlur(active) {
  if (typeof document === 'undefined' || !document.body) return
  const overlay = ensureOverlay()
  overlay.classList.toggle('is-active', Boolean(active))
  if (!active) {
    // Keep the node for the next prompt, but make sure it stops eating taps.
    overlay.style.pointerEvents = 'none'
  } else {
    overlay.style.pointerEvents = 'auto'
  }
}

export function isPrivacyBlurActive() {
  const overlay = document.getElementById(OVERLAY_ID)
  return Boolean(overlay?.classList.contains('is-active'))
}
