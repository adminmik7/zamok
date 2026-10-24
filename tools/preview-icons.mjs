import { Resvg } from '@resvg/resvg-js'
import fs from 'node:fs'

const { ICONS } = await import('../src/ui/dom.js')

const names = process.argv.slice(2)
const size = 64
const cell = 96
const cols = Math.min(8, names.length)
const rows = Math.ceil(names.length / cols)

const parts = []
names.forEach((name, index) => {
  const path = ICONS[name]
  const x = (index % cols) * cell
  const y = Math.floor(index / cols) * cell
  if (typeof path === 'object') {
    parts.push(`<g transform="translate(${x + 16} ${y + 16}) scale(${size / 24})">${path.body}</g>`)
    return
  }
  parts.push(
    `<g transform="translate(${x + 16} ${y + 16}) scale(${size / 24})">` +
      `<path d="${path}" fill="none" stroke="#e5e7eb" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>` +
      `</g>`
  )
})

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * cell}" height="${rows * cell}" viewBox="0 0 ${cols * cell} ${rows * cell}"><rect width="100%" height="100%" fill="#0b0d12"/>${parts.join('')}</svg>`

const resvg = new Resvg(svg, { background: '#0b0d12' })
fs.writeFileSync('tools/icons-preview.png', resvg.render().asPng())
console.log('written tools/icons-preview.png', names.join(' '))
