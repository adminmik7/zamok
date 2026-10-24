import { describe, expect, it } from 'vitest'

const byText = (root, text) => [...root.querySelectorAll('button')].find((node) => node.textContent.includes(text))

async function waitFor(check, timeout = 8000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    const result = check()
    if (result) return result
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error('waitFor timeout')
}

describe('list search', () => {
  it('filters the vault list as the user types', async () => {
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

    await waitFor(() => byText(root, 'Добавить запись'))
    byText(root, 'Добавить запись').click()
    await waitFor(() => byText(root, 'Пароль'))
    byText(root, 'Пароль').click()

    const fields = await waitFor(() => {
      const found = [...root.querySelectorAll('input')]
      return found.length >= 3 ? found : null
    })
    fields[0].value = 'Яндекс'
    fields[1].value = 'user@ya.ru'
    fields[2].value = 'secret'
    byText(root, 'Сохранить').click()

    await waitFor(() => root.querySelector('button[aria-label="Назад"]'))
    root.querySelector('button[aria-label="Назад"]').click()

    const search = await waitFor(() => root.querySelector('input[type="search"]'))
    expect(root.textContent).toContain('Яндекс')

    search.value = 'яндекс'
    search.dispatchEvent(new Event('input'))
    await waitFor(() => root.textContent.includes('Яндекс'))

    search.value = 'zzz'
    search.dispatchEvent(new Event('input'))
    await waitFor(() => root.textContent.includes('Ничего не найдено'))

    search.value = ''
    search.dispatchEvent(new Event('input'))
    await waitFor(() => root.textContent.includes('Яндекс'))

    search.value = 'user@ya'
    search.dispatchEvent(new Event('keyup'))
    await waitFor(() => root.textContent.includes('Яндекс'))

    search.value = 'nothing-matches'
    search.dispatchEvent(new Event('keyup'))
    await waitFor(() => root.textContent.includes('Ничего не найдено'))

    // keyboards that report the value only on close: no events, value changes while focused
    search.focus()
    search.value = 'яндекс'
    await waitFor(() => root.textContent.includes('Яндекс') && !root.textContent.includes('Ничего не найдено'))

    search.value = ''
    search.dispatchEvent(new Event('change'))
    await waitFor(() => root.textContent.includes('Яндекс'))
  })
})
