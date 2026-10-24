import { Resvg } from '@resvg/resvg-js'
import fs from 'node:fs'

const candidates = {
  'barcode-filled': {
    viewBox: '0 0 24 24',
    body:
      '<path fill="currentColor" d="M2 4h1.8v16H2zM4.8 4h.9v16h-.9zM6.7 4h2.2v16H6.7zM9.9 4h.9v16h-.9zM11.8 4h1.6v16h-1.6zM14.4 4h2.1v16h-2.1zM17.5 4h.9v16h-.9zM19.4 4h2.6v16h-2.6z"/>'
  },
  'scan-barcode': {
    viewBox: '0 0 24 24',
    body:
      '<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M11 8v8M13 8v8M17 8v8"/>'
  },
  'ticket-lucide': {
    viewBox: '0 0 24 24',
    body:
      '<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2zM13 5v2M13 11v2M13 17v2"/>'
  },
  'ticket-simple': {
    viewBox: '0 0 24 24',
    body:
      '<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a3 3 0 0 0 0 6v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a3 3 0 0 0 0-6zM9 5v2M9 11v2M9 17v2"/>'
  },
  'scan-line': {
    viewBox: '0 0 24 24',
    body:
      '<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10"/>'
  }
}

const cell = 110
const cols = candidates.length
const parts = []

for (const [name, artwork] of Object.entries(candidates)) {
  const x = Object.keys(candidates).indexOf(name) * cell
  parts.push(`<text x="${x + 10}" y="20" fill="#94a3b8" font-family="sans-serif" font-size="11">${name}</text>`)
  // large
  parts.push(
    `<g transform="translate(${x + 18} 34) scale(2)">${artwork.body.replace('stroke-width="1.8"', 'stroke-width="1.8"')}</g>`
  )
  // small, as in a form field
  parts.push(
    `<g transform="translate(${x + 18} 92) scale(0.75)">${artwork.body}</g>`
  )
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * cell}" height="130" viewBox="0 0 ${cols * cell} 130"><rect width="100%" height="100%" fill="#0b0d12"/>${parts.join('')}</svg>`

const resvg = new Resvg(svg, { background: '#0b0d12' })
fs.writeFileSync('tools/icons-candidates.png', resvg.render().asPng())
console.log('written tools/icons-candidates.png')
