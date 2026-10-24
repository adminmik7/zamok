// Regenerates src/ui/brand-icons.js from the Iconify API.
// Run: node tools/gen-brand-icons.mjs
import { writeFileSync } from 'node:fs'

const SIMPLE = [
  'google', 'microsoft', 'maildotru', 'telegram', 'whatsapp', 'vk', 'youtube',
  'instagram', 'facebook', 'x', 'github', 'apple', 'discord', 'steam',
  'spotify', 'tiktok', 'netflix'
]

async function collection(prefix, icons) {
  const response = await fetch(`https://api.iconify.design/${prefix}.json?icons=${icons.join(',')}`)
  if (!response.ok) throw new Error(`${prefix}: HTTP ${response.status}`)
  const json = await response.json()
  return json.icons ?? {}
}

const result = {}

for (const [name, data] of Object.entries(await collection('simple-icons', SIMPLE))) {
  const width = data.width ?? 24
  const height = data.height ?? width
  result[name] = {
    viewBox: `${data.left ?? 0} ${data.top ?? 0} ${width} ${height}`,
    body: data.body
  }
}

// Font Awesome icons omit height in the Iconify JSON; the brand box is 512 tall.
const fa6 = await collection('fa6-brands', ['yandex'])
if (fa6.yandex) result.yandex = { viewBox: '0 0 256 512', body: fa6.yandex.body }

// Sber is absent from simple-icons, so use the Arcticons outline mark.
const arcticons = await collection('arcticons', ['sberbank'])
if (arcticons.sberbank) result.sber = { viewBox: '0 0 48 48', body: arcticons.sberbank.body }

const order = [
  'google', 'yandex', 'maildotru', 'telegram', 'whatsapp', 'vk',
  'youtube', 'instagram', 'facebook', 'x', 'github', 'apple',
  'microsoft', 'discord', 'steam', 'spotify', 'sber', 'tiktok', 'netflix'
]

const missing = order.filter((name) => !result[name])
if (missing.length) throw new Error(`missing icons: ${missing.join(', ')}`)

const lines = [
  '// Brand marks fetched from the Iconify API (simple-icons, fa6-brands).',
  '// Shapes are the official logo silhouettes; they inherit the text colour.',
  '// Regenerate with: node tools/gen-brand-icons.mjs',
  'export const BRAND_ICONS = {'
]
for (const name of order) {
  const { viewBox, body } = result[name]
  lines.push(`  ${name}: { viewBox: '${viewBox}', body: ${JSON.stringify(body)} },`)
}
lines.push('}', '')

writeFileSync(new URL('../src/ui/brand-icons.js', import.meta.url), lines.join('\n'))
console.log(`brand-icons.js: ${order.length} icons`)
