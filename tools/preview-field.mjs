import { Resvg } from '@resvg/resvg-js'
import fs from 'node:fs'

const { ICONS } = await import('../src/ui/dom.js')

const art = (name, x, y, scale, color) => {
  const path = ICONS[name]
  const body = typeof path === 'object'
    ? path.body.replace(/currentColor/g, color)
    : `<path d="${path}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`
  return `<g transform="translate(${x} ${y}) scale(${scale})">${body}</g>`
}

const field = (y, leading, trailing, label) => `
<rect x="20" y="${y}" width="360" height="56" rx="14" fill="#151a24" stroke="#2a3240" stroke-width="2"/>
${art(leading, 38, y + 19, 0.75, '#64748b')}
<text x="62" y="${y + 35}" fill="#7c8798" font-family="sans-serif" font-size="15">Цифры под штрихкодом карты</text>
${art(trailing, 340, y + 17, 0.85, '#94a3b8')}
<text x="20" y="${y - 8}" fill="#94a3b8" font-family="sans-serif" font-size="12" letter-spacing="1">ШТРИХКОД</text>
`

const typeRow = (y, name) => `
<circle cx="46" cy="${y}" r="22" fill="#6366f1"/>
${art(name, 34, y - 12, 1, '#ffffff')}
<text x="84" y="${y + 5}" fill="#e5e7eb" font-family="sans-serif" font-size="15">${name}</text>
`

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="100%" height="100%" fill="#0b0d12"/>
${field(30, 'barcode', 'scanBarcode')}
${field(110, 'ticket', 'percent')}
${typeRow(210, 'percent')}
${typeRow(260, 'ticket')}
</svg>`

const resvg = new Resvg(svg, { background: '#0b0d12' })
fs.writeFileSync('tools/icons-field.png', resvg.render().asPng())
console.log('written tools/icons-field.png')
