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

const row = (y, title, subtitle, badge) => `
<rect x="16" y="${y}" width="368" height="64" rx="6" fill="#151a24" stroke="#232b38" stroke-width="1.5"/>
${badge}
<text x="88" y="${y + 28}" fill="#e5e7eb" font-family="sans-serif" font-size="15" font-weight="600">${title}</text>
<text x="88" y="${y + 46}" fill="#7c8798" font-family="sans-serif" font-size="12">${subtitle}</text>
`

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="320" viewBox="0 0 400 320"><rect width="100%" height="100%" fill="#0b0d12"/>
${row(20, 'Кактус', '• • • • • • • • •', `<rect x="28" y="32" width="48" height="36" rx="5" fill="#374151"/>${art('percent', 40, 38, 0.95, '#e5e7eb')}`)}
${row(100, 'Пятёрочка', '• • • • 4805', `<rect x="28" y="112" width="48" height="36" rx="5" fill="#22c55e"/>${art('percent', 40, 118, 0.95, '#ffffff')}`)}
${row(180, 'Кактус', '• • • • • • • • •', `<rect x="28" y="192" width="48" height="36" rx="5" fill="#facc15"/>${art('ticket', 40, 196, 0.9, '#111827')}`)}
${row(260, 'Магнит', '• • • • 9090', `<rect x="28" y="272" width="48" height="36" rx="5" fill="#374151"/>${art('percent', 40, 278, 0.95, '#e5e7eb')}`)}
</svg>`

const resvg = new Resvg(svg, { background: '#0b0d12' })
fs.writeFileSync('tools/icons-list.png', resvg.render().asPng())
console.log('written tools/icons-list.png')
