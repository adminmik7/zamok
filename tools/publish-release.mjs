import fs from 'node:fs'
import path from 'node:path'

const owner = 'adminmik7'
const repo = 'zamok'
const token = fs.readFileSync(path.join(process.cwd(), 'github_token'), 'utf8').trim()
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'zamok-publisher'
}

const [tag, name, bodyFile, apkPath, assetName] = process.argv.slice(2)
const body = bodyFile ? fs.readFileSync(bodyFile, 'utf8') : ''

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } })
  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${url} -> ${response.status}: ${text.slice(0, 400)}`)
  }
  return data
}

const base = `https://api.github.com/repos/${owner}/${repo}`

// 1. Release
let release = await api(`${base}/releases/tags/${tag}`).catch(() => null)
if (!release) {
  release = await api(`${base}/releases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag_name: tag, name, body, draft: false, prerelease: false })
  })
  console.log('release created', release.id)
} else {
  release = await api(`${base}/releases/${release.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, body })
  })
  console.log('release updated', release.id)
}

// 2. Asset
const existing = (release.assets || []).find((asset) => asset.name === assetName)
if (existing) {
  await api(`${base}/releases/assets/${existing.id}`, { method: 'DELETE' })
}
const apk = fs.readFileSync(apkPath)
await api(`https://uploads.github.com/repos/${owner}/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(assetName)}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/vnd.android.package-archive' },
  body: apk
})
console.log('asset uploaded', assetName, apk.length)

// 3. README
const readme = fs.readFileSync(path.join(process.cwd(), 'README.md'))
const readmeText = readme.toString('utf8')
const current = await api(`${base}/contents/README.md`)
await api(`${base}/contents/README.md`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: `docs: описание для ${tag}`,
    content: Buffer.from(readmeText, 'utf8').toString('base64'),
    sha: current.sha,
    branch: current.default_branch || 'main'
  })
})
console.log('readme updated')

const check = await api(`${base}/releases/tags/${tag}`)
console.log(JSON.stringify({
  tag: check.tag_name,
  name: check.name,
  assets: check.assets.map((asset) => ({ name: asset.name, size: asset.size, state: asset.state })),
  body: check.body
}, null, 2))
