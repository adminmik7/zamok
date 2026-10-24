const MIN_VISIBLE_MS = 3000
const EXIT_MS = 400
const startedAt = performance.now()

let requested = false
let resolveHidden
const hiddenPromise = new Promise((resolve) => {
  resolveHidden = resolve
})

export function whenSplashHidden() {
  return hiddenPromise
}

export function hideSplash() {
  if (requested) return hiddenPromise
  requested = true
  const wait = Math.max(0, MIN_VISIBLE_MS - (performance.now() - startedAt))
  setTimeout(() => {
    const node = document.getElementById('splash')
    if (!node) {
      resolveHidden()
      return
    }
    node.classList.add('splash-exit')
    setTimeout(() => {
      node.remove()
      resolveHidden()
    }, EXIT_MS)
  }, wait)
  return hiddenPromise
}
