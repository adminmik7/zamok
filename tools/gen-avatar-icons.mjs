import fs from 'node:fs'
import path from 'node:path'
import { Resvg } from '@resvg/resvg-js'

const root = 'D:/dev/zamok'
const map = {
  globe: 'globe',
  key: 'key-round',
  user: 'user',
  mail: 'mail',
  lock: 'lock',
  shield: 'shield',
  card: 'credit-card',
  id: 'id-card',
  wallet: 'wallet',
  bank: 'landmark',
  note: 'file-text',
  tag: 'tag',
  clock: 'clock',
  calendar: 'calendar',
  star: 'star',
  music: 'music',
  game: 'gamepad-2',
  home: 'house',
  cloud: 'cloud',
  cart: 'shopping-cart',
  phone: 'phone',
  terminal: 'square-terminal',
  photo: 'image',
  fingerprint: 'fingerprint',
  info: 'info',
  ticket: 'ticket',
  percent: 'percent',
  barcode: 'barcode'
}

const num = (v) => Number(v)
const fixed = (v) => Number(num(v).toFixed(4))
const pt = (x, y) => `${fixed(x)} ${fixed(y)}`

function circlePath(cx, cy, r) {
  return `M${pt(cx - r, cy)}A${r} ${r} 0 1 0 ${pt(cx + r, cy)}A${r} ${r} 0 1 0 ${pt(cx - r, cy)}Z`
}

function rectPath(x, y, w, h, rx) {
  rx = Math.min(rx, w / 2, h / 2)
  if (!rx) return `M${pt(x, y)}H${fixed(x + w)}V${fixed(y + h)}H${fixed(x)}Z`
  return `M${pt(x + rx, y)}H${fixed(x + w - rx)}A${rx} ${rx} 0 0 1 ${pt(x + w, y + rx)}V${fixed(y + h - rx)}A${rx} ${rx} 0 0 1 ${pt(x + w - rx, y + h)}H${fixed(x + rx)}A${rx} ${rx} 0 0 1 ${pt(x, y + h - rx)}V${fixed(y + rx)}A${rx} ${rx} 0 0 1 ${pt(x + rx, y)}Z`
}

function attrs(tag) {
  const out = {}
  for (const m of tag.matchAll(/([\w:-]+)="([^"]*)"/g)) out[m[1]] = m[2]
  return out
}

function toPath(svg) {
  const parts = []
  for (const m of svg.matchAll(/<(path|circle|rect|line|polyline|polygon|ellipse)\b([^>]*)\/?>/g)) {
    const a = attrs(m[2])
    if (m[1] === 'path') parts.push(a.d)
    else if (m[1] === 'circle') parts.push(circlePath(num(a.cx), num(a.cy), num(a.r)))
    else if (m[1] === 'ellipse') {
      const { cx, cy, rx, ry } = a
      parts.push(`M${pt(num(cx) - num(rx), num(cy))}A${rx} ${ry} 0 1 0 ${pt(num(cx) + num(rx), num(cy))}A${rx} ${ry} 0 1 0 ${pt(num(cx) - num(rx), num(cy))}Z`)
    } else if (m[1] === 'rect') {
      parts.push(rectPath(num(a.x || 0), num(a.y || 0), num(a.width), num(a.height), num(a.rx || 0)))
    } else if (m[1] === 'line') {
      parts.push(`M${pt(num(a.x1), num(a.y1))}L${pt(num(a.x2), num(a.y2))}`)
    } else {
      const nums = a.points.trim().split(/[\s,]+/).map(Number)
      const pts = []
      for (let i = 0; i < nums.length; i += 2) pts.push(`${fixed(nums[i])} ${fixed(nums[i + 1])}`)
      parts.push(`M${pts[0]}${pts.slice(1).map((p) => `L${p}`).join('')}${m[1] === 'polygon' ? 'Z' : ''}`)
    }
  }
  return parts.join('')
}

const paths = {}
for (const [key, slug] of Object.entries(map)) {
  const url = `https://cdn.jsdelivr.net/npm/lucide-static@latest/icons/${slug}.svg`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${slug}: HTTP ${res.status}`)
  paths[key] = toPath(await res.text())
}

let file = fs.readFileSync(path.join(root, 'src/ui/dom.js'), 'utf8')
const eol = file.includes('\r\n') ? '\r\n' : '\n'
for (const [key, d] of Object.entries(paths)) {
  const esc = d.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  if (key === 'barcode') {
    file = file.replace(/\r?\n  barcode: \{[\s\S]*?\r?\n  \},/, `${eol}  barcode: '${esc}',`)
  } else {
    const oneLine = new RegExp(`\\r?\\n  ${key}: '[^']*',`)
    const multiLine = new RegExp(`\\r?\\n  ${key}:\\r?\\n    '[^']*',`)
    if (oneLine.test(file)) file = file.replace(oneLine, `${eol}  ${key}: '${esc}',`)
    else if (multiLine.test(file)) file = file.replace(multiLine, `${eol}  ${key}: '${esc}',`)
    else throw new Error(`missing ${key}`)
  }
}
fs.writeFileSync(path.join(root, 'src/ui/dom.js'), file)

const order = Object.keys(map)
const cell = 64
const cols = 7
const rows = Math.ceil(order.length / cols)
const cells = order.map((key, i) => {
  const x = (i % cols) * cell + cell / 2
  const y = Math.floor(i / cols) * cell + cell / 2
  return `<g transform="translate(${x - 12} ${y - 12})"><path d="${paths[key]}" fill="none" stroke="#e5e7eb" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></g>`
}).join('')
const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * cell}" height="${rows * cell}" viewBox="0 0 ${cols * cell} ${rows * cell}"><rect width="100%" height="100%" fill="#0b0d12"/><g>${cells}</g></svg>`
fs.writeFileSync('C:/Users/admin/AppData/Local/Temp/opencode/avatar-preview.svg', sheet)
const png = new Resvg(sheet, { fitTo: { mode: 'zoom', value: 2 } }).render().asPng()
fs.writeFileSync('C:/Users/admin/AppData/Local/Temp/opencode/avatar-preview.png', png)
console.log('patched', order.length, 'icons')
