import { describe, expect, it } from 'vitest'

const byText = (root, text) => [...root.querySelectorAll('button')].find((node) => node.textContent.includes(text))
const byAria = (root, label) => root.querySelector(`button[aria-label="${label}"]`)

async function waitFor(check, timeout = 8000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    const result = check()
    if (result) return result
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error('waitFor timeout')
}

async function openEditor(root) {
  await waitFor(() => byText(root, 'Добавить запись'))
  byText(root, 'Добавить запись').click()
  await waitFor(() => byText(root, 'Пароль'))
  byText(root, 'Пароль').click()
  await waitFor(() => byAria(root, 'Отмена'))
}

describe('discard protection in the editor', () => {
  it('asks before leaving the editor with unsaved changes', async () => {
    localStorage.clear()
    document.body.innerHTML = '<div id="app"></div>'
    await import('../src/main.js')
    const root = document.getElementById('app')

    const inputs = await waitFor(() => {
      const found = [...root.querySelectorAll('input')]
      return found.length >= 2 ? found : null
    })
    inputs[0].value = 'master-password'
    inputs[1].value = 'master-password'
    byText(root, 'Создать хранилище').click()

    await openEditor(root)
    const fields = [...root.querySelectorAll('input')]
    fields[0].value = 'Черновик'
    byAria(root, 'Отмена').click()

    await waitFor(() => document.body.textContent.includes('Отменить изменения?'))
    expect(byAria(root, 'Отмена')).toBeTruthy()

    byText(document, 'Не сохранять').click()
    await waitFor(() => root.querySelector('input[type="search"]'))
    expect(root.textContent).not.toContain('Черновик')
  })

  it('leaves the editor straight away when nothing was changed', async () => {
    const root = document.getElementById('app')
    await openEditor(root)
    byAria(root, 'Отмена').click()

    await waitFor(() => root.querySelector('input[type="search"]'))
    expect(document.body.textContent).not.toContain('Отменить изменения?')
  })
})
