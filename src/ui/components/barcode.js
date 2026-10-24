import { barcodeFor } from '../../core/barcode.js'

const SVG_NS = 'http://www.w3.org/2000/svg'

// Renders the stored barcode as an SVG. Modules keep their proportions
// (uniform scaling, quiet zones on both sides) so a scanner on the checkout
// reads it correctly.
export function barcodeSvg(value, { className = 'w-full', moduleHeight = 30 } = {}) {
  const data = barcodeFor(value)
  if (!data) return null

  const quiet = 10
  const width = data.modules.length + quiet * 2

  let path = ''
  data.modules.forEach((module, index) => {
    if (!module) return
    const x = index + quiet
    path += `M${x} 0h1v${moduleHeight}h-1z`
  })

  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', `0 0 ${width} ${moduleHeight}`)
  svg.setAttribute('class', className)
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', `Штрихкод ${data.text}`)
  svg.style.height = 'auto'

  const shape = document.createElementNS(SVG_NS, 'path')
  shape.setAttribute('d', path)
  shape.setAttribute('fill', 'currentColor')
  svg.append(shape)

  return svg
}
