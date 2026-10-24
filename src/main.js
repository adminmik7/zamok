import { el, icon, ICONS, mount } from './ui/dom.js'
import { Vault, CATEGORIES, readSettings, writeSettings, removeVault, DEFAULT_SETTINGS, readCategories, writeCategories, vaultMetaStatus } from './core/store.js'
import { isWebCryptoAvailable } from './core/crypto.js'
import { pluralRecords } from './core/format.js'
import { matchesQuery } from './core/search.js'
import { shouldAutoPromptBiometric } from './core/biometric-policy.js'
import {
  checkForUpdate as checkForUpdateCore,
  compareVersions,
  getAppVersion,
  normalizeVersion,
  readUpdateCache,
  RELEASE_PAGE_URL,
  shouldCheckForUpdate,
  writeUpdateCache
} from './core/update.js'
import { readSeenVersions, rememberSeenVersion, shouldNotifyUpdate } from './core/update-notice.js'
import { unlockScreen } from './ui/screens/unlock.js'
import { itemCard, emptyState } from './ui/screens/list.js'
import { detailScreen } from './ui/screens/detail.js'
import { cardDetailScreen } from './ui/screens/card.js'
import { loyaltyDetailScreen } from './ui/screens/loyalty.js'
import { editorScreen } from './ui/screens/editor.js'
import { settingsScreen, changeMasterDialog } from './ui/screens/settings.js'
import { transferScreen } from './ui/screens/transfer.js'
import { newItemScreen } from './ui/screens/new-item.js'
import { categoriesScreen } from './ui/screens/categories.js'
import {
  backupFilename,
  BACKUP_FOLDER,
  BACKUP_OWNER,
  BACKUP_REPO,
  deleteBackup,
  downloadBackup,
  listBackups,
  profileIdForDevice,
  pruneBackups,
  uploadBackup
} from './core/github-backup.js'
import { confirmDialog, promptDialog, openModal, toast, closeTopModal, closeAllModals } from './ui/components/feedback.js'
import { hideSplash, whenSplashHidden } from './ui/splash.js'
import {
  biometricAuthenticate,
  biometricsAvailable,
  copyToClipboard,
  deleteMasterCredential,
  deleteServerToken,
  downloadApk,
  exitApp,
  getDeviceIdentifier,
  getMasterCredential,
  getServerToken,
  hapticLight,
  hapticMedium,
  installApk,
  onAppStateChange,
  onBackButton,
  openExternalUrl,
  saveMasterCredential,
  saveServerToken,
  setSecureScreen,
  setupKeyboard,
  setupStatusBar,
  shareFile
} from './platform/native.js'

function scheduleLock() {
  if (lockTimer) clearTimeout(lockTimer)
  lockTimer = null
  if (autoLockSuspended) return
  const delay = state.settings.autoLockMs
  if (!delay || state.screen === 'unlock') return
  lockTimer = setTimeout(() => {
    lockVault()
    toast('Хранилище заблокировано', 'info', 1800)
  }, delay)
}

// System file pickers and share sheets pause the activity, which otherwise
// triggers the auto-lock mid-flow: the vault key would be dropped while import
// or export is still running. Suspend locking until the flow finishes.
function suspendAutoLock() {
  autoLockSuspended += 1
  if (lockTimer) clearTimeout(lockTimer)
  lockTimer = null
}

function resumeAutoLock() {
  autoLockSuspended = Math.max(0, autoLockSuspended - 1)
  if (!autoLockSuspended) scheduleLock()
}

function resetLockTimer() {
  if (state.screen === 'unlock') return
  scheduleLock()
}

function lockVault() {
  vault.lock()
  // Dialogs live in a body-level stack, not inside the screen, so without this
  // they stayed above the lock screen (photo viewer, card dialog, prompts) and
  // could still act on the already-locked vault.
  closeAllModals()
  state.screen = 'unlock'
  state.activeItemId = null
  autoBiometricPending = true
  render()
}

// The fingerprint prompt is raised by the app itself on start/resume when the
// vault is locked and biometrics are enabled. It fires at most once per lock:
// cancelling the prompt leaves the password field as the way in.
function tryAutoBiometric() {
  if (biometricScheduled) return
  const shouldPrompt = shouldAutoPromptBiometric({
    pending: autoBiometricPending,
    screen: state.screen,
    settings: state.settings,
    ready: state.biometricReady,
    hidden: document.visibilityState === 'hidden'
  })
  if (!shouldPrompt || !biometricRunner) return
  biometricScheduled = true
  whenSplashHidden().then(() => {
    biometricScheduled = false
    const stillAllowed = shouldAutoPromptBiometric({
      pending: autoBiometricPending,
      screen: state.screen,
      settings: state.settings,
      ready: state.biometricReady,
      hidden: document.visibilityState === 'hidden'
    })
    if (!stillAllowed || !biometricRunner) return
    autoBiometricPending = false
    biometricRunner()
  })
}

function applySettings(patch) {
  state.settings = { ...state.settings, ...patch }
  writeSettings(state.settings)
  if (patch.secureScreen !== undefined) applySecureScreen()
  scheduleLock()
}

function applySecureScreen() {
  const wanted = state.settings.secureScreen !== false
  setSecureScreen(wanted).then((result) => {
    if (result.web) return
    if (!result.ok || result.enabled !== wanted) {
      toast('Не удалось применить защиту экрана', 'error', 2500)
    }
  })
}

function filteredItems() {
  let items = vault.list()
  if (state.category === 'favorites') {
    items = items.filter((item) => item.favorite)
  } else if (state.category !== 'all') {
    items = items.filter((item) => item.category === state.category)
  }
  items = items.filter((item) => matchesQuery(item, state.query))
  const sort = state.settings.sort
  items.sort((a, b) => {
    if (sort === 'title') return a.title.localeCompare(b.title, 'ru')
    if (sort === 'created') return b.createdAt - a.createdAt
    if (sort === 'favorite') return Number(b.favorite) - Number(a.favorite) || b.updatedAt - a.updatedAt
    return b.updatedAt - a.updatedAt
  })
  return items
}

function categoryChip(id, label, count, color) {
  const active = state.category === id
  return el('button', {
    class: `flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition active:scale-95 ${active
      ? 'border-brand-500 bg-brand-500/15 text-brand-200'
      : 'border-ink-800 bg-ink-900/60 text-ink-400 hover:border-ink-700 hover:text-ink-200'
    }`,
    onclick: () => {
      state.category = id
      render()
    },
  }, [

    color ? el('span', { class: 'h-1.5 w-1.5 rounded-full', style: { backgroundColor: color } }) : null,
    el('span', { text: label }),
    el('span', { class: 'text-ink-500', text: String(count) })
  ])
}

function vaultListScreen() {
  const all = vault.list()
  const listWrap = el('div', { class: 'space-y-2' })

  const search = el('input', {
    type: 'search',
    value: state.query,
    placeholder: 'Поиск по названию, логину, сайту',
    class: 'w-full pl-11'
  })

  const renderList = () => {
    const current = filteredItems()
    if (!current.length) {
      listWrap.replaceChildren(
        emptyState({
          title: all.length ? 'Ничего не найдено' : 'Пока пусто',
          description: state.category === 'favorites'
            ? 'В избранном пока ничего нет'
            : all.length
              ? 'Измените запрос или выберите другую категорию'
              : 'Добавите первую запись — она будет зашифрована мастер-паролем',
          actionLabel: all.length ? null : 'Добавить запись',
          onAction: () => openNewItem()
        })
      )
      return
    }
    listWrap.replaceChildren(
      ...current.map((item) =>
        itemCard(item, {
          onOpen: () => openDetail(item.id),
          onToggleFavorite: async (target) => {
            await vault.upsert({ ...target, favorite: !target.favorite })
            render()
          }
        })
      )
    )
  }

  const applyQuery = () => {
    if (search.value === state.query) return
    state.query = search.value
    renderList()
    const scroller = listWrap.parentElement
    if (scroller) scroller.scrollTop = 0
  }

  // Android keyboards and IME composition disagree on which events they send,
  // so every path runs the same filter.
  for (const event of ['input', 'beforeinput', 'keyup', 'change', 'search', 'blur', 'compositionupdate', 'compositionend']) {
    search.addEventListener(event, applyQuery)
  }

  // Some soft keyboards report the typed text only when the keyboard closes.
  // While the field is focused, watch its value so the list stays live.
  const watcher = setInterval(() => {
    if (!search.isConnected) {
      clearInterval(watcher)
      return
    }
    if (document.activeElement === search) applyQuery()
  }, 120)

  renderList()

  const chips = el('div', { class: 'no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 py-0.5' }, [
    categoryChip('all', 'Все', all.length, null),
    ...CATEGORIES.filter((category) => all.some((item) => item.category === category.id)).map((category) =>
      categoryChip(category.id, category.label, all.filter((item) => item.category === category.id).length, category.color)
    )
  ])

  const favActive = state.category === 'favorites'
  const favStar = icon(ICONS.star, 'w-5 h-5')
  if (favActive) favStar.setAttribute('fill', 'currentColor')

  const header = el('div', { class: 'flex items-center gap-3' }, [
    el('div', { class: 'flex min-w-0 flex-1 items-center gap-3' }, [
      el('img', {
        src: './logo.png',
        alt: '',
        'aria-hidden': 'true',
        class: 'h-10 w-10 shrink-0'
      }),
      el('div', { class: 'min-w-0' }, [
        el('h1', { class: 'text-xl font-semibold tracking-tight text-ink-50' }, [
          el('span', { class: 'text-gradient', text: 'Zamok' })
        ]),
        el('p', { class: 'text-xs text-ink-500', text: pluralRecords(all.length) })
      ])
    ]),
    el('button', {
      class: 'rounded-xl p-2.5 text-ink-300 transition active:scale-90 hover:bg-ink-800',
      'aria-label': 'Настройки',
      onclick: openSettings
    }, [icon(ICONS.settings, 'w-5 h-5')]),
    el('button', {
      class: `rounded-xl p-2.5 transition active:scale-90 hover:bg-ink-800 ${favActive ? 'text-warn-400' : 'text-ink-300'}`,
      'aria-label': favActive ? 'Показать все записи' : 'Показать избранное',
      onclick: () => {
        state.category = favActive ? 'all' : 'favorites'
        render()
      }
    }, [favStar]),
    el('button', {
      class: 'rounded-xl p-2.5 text-ink-300 transition active:scale-90 hover:bg-ink-800',
      'aria-label': 'Добавить',
      onclick: () => openNewItem()
    }, [icon(ICONS.plus, 'w-5 h-5')])
  ])

  const rootNode = el('div', { class: 'relative flex h-full flex-col bg-ink-950' }, [
    el('div', { class: 'border-b border-ink-800/70 bg-ink-950/90 px-4 pt-4 pb-3 backdrop-blur-xl' }, [
      header,
      el('div', { class: 'relative mt-3' }, [
        el('span', { class: 'pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-500' }, [
          icon(ICONS.search, 'w-4.5 h-4.5')
        ]),
        search
      ]),
      chips
    ]),
    el('div', { class: 'flex-1 overflow-y-auto px-4 py-4 no-scrollbar' }, [listWrap]),
    el('div', { class: 'safe-bottom' })
  ])

  return { element: rootNode }
}
const vault = new Vault()

const state = {
  screen: 'unlock',
  settings: { ...DEFAULT_SETTINGS },
  query: '',
  category: 'all',
  activeItemId: null,
  editorItemId: null,
  transferMode: 'export',
  biometricReady: false,
  appVersion: '',
  update: { status: 'idle', release: null, error: null }
}

let root = null
let lockTimer = null
let autoLockSuspended = 0
let autoBiometricPending = true
let biometricRunner = null
let biometricScheduled = false
let appIsActive = true

function render() {
  if (state.screen === 'unlock') {
    renderUnlock()
    return
  }
  if (state.screen === 'detail' && state.activeItemId) {
    const item = vault.get(state.activeItemId)
    if (item) {
      openDetail(item.id)
      return
    }
  }
  if (state.screen === 'settings') {
    openSettings()
    return
  }
  if (state.screen === 'transfer') {
    openTransfer(state.transferMode)
    return
  }
  if (state.screen === 'new') {
    openNewItem()
    return
  }
  if (state.screen === 'categories') {
    openCategories()
    return
  }
  const view = vaultListScreen()
  mount(root, view.element)
  resetLockTimer()
}

async function renderUnlock() {
  const status = await vaultMetaStatus()
  const mode = status === 'ok' ? 'unlock' : status === 'corrupt' ? 'corrupt' : 'create'
  let busy = false

  const submitPassword = async (password) => {
    if (busy) return true
    busy = true
    try {
      if (mode === 'create') {
        // Создаём хранилище ровно один раз: vault.create() сам держит ключ
        // в памяти, повторный vault.unlock() после создания не нужен —
        // именно он давал ложный тост «Неверный мастер-пароль».
        await vault.create(password)
        toast('Хранилище создано', 'success', 2000)
        autoBiometricPending = false
        state.screen = 'list'
        render()
        return true
      }
      await vault.unlock(password)
      autoBiometricPending = false
      state.screen = 'list'
      render()
      return true
    } catch (error) {
      console.error(mode === 'create' ? 'Vault create failed:' : 'Vault unlock failed:', error)
      toast(mode === 'create' ? 'Не удалось создать хранилище' : 'Неверный мастер-пароль', 'error')
      return false
    } finally {
      busy = false
    }
  }

  const requestBiometric = async () => {
    if (busy) return
    busy = true
    try {
      // The system dialog may push the app to the background on some ROMs:
      // the vault must not lock while the fingerprint is being checked.
      suspendAutoLock()
      const confirmed = await biometricAuthenticate()
      resumeAutoLock()
      if (!confirmed) {
        toast('Биометрия не подтверждена', 'error')
        return
      }
      const password = await getMasterCredential()
      if (!password) {
        toast('Мастер-пароль не сохранён — введите его вручную', 'error')
        return
      }
      try {
        await vault.unlock(password)
        autoBiometricPending = false
        hapticMedium()
        state.screen = 'list'
        render()
      } catch {
        await deleteMasterCredential()
        applySettings({ biometrics: false })
        toast('Сохранённый пароль не подошёл — вход по биометрии отключён', 'error')
      }
    } finally {
      busy = false
    }
  }

  const view = unlockScreen({
    mode,
    biometricsReady: mode === 'unlock' && state.settings.biometrics && state.biometricReady,
    onSubmit: submitPassword,
    onBiometric: requestBiometric,
    onReset: async () => {
      const yes = await confirmDialog({
        title: 'Создать новое хранилище?',
        message: 'Повреждённые данные будут стёрты, восстановить их не получится.',
        confirmLabel: 'Стереть и начать',
        danger: true
      })
      if (!yes) return
      await removeVault()
      await deleteMasterCredential()
      applySettings({ biometrics: false })
      autoBiometricPending = false
      render()
    }
  })
  mount(root, view.element)

  biometricRunner = mode === 'unlock' ? requestBiometric : null
  if (biometricRunner) setTimeout(tryAutoBiometric, 350)
}

let editorUnsaved = null

function backToList() {
  state.screen = 'list'
  state.activeItemId = null
  state.editorItemId = null
  editorUnsaved = null
  render()
}

function navigateBack() {
  if (closeTopModal()) return
  if (state.screen === 'editor') {
    requestLeaveEditor()
    return
  }
  if (state.screen === 'detail' || state.screen === 'settings' || state.screen === 'new') {
    backToList()
    return
  }
  if (state.screen === 'categories') {
    openSettings()
    return
  }
  if (state.screen === 'transfer') {
    openSettings()
    return
  }
  exitApp()
}

async function requestLeaveEditor() {
  if (editorUnsaved?.()) {
    const yes = await confirmDialog({
      title: 'Отменить изменения?',
      message: 'Запись не сохранена — введённые данные будут потеряны.',
      confirmLabel: 'Не сохранять',
      danger: true
    })
    if (!yes) return
  }
  if (state.editorItemId) openDetail(state.editorItemId)
  else backToList()
}

function openDetail(id) {
  editorUnsaved = null
  const item = vault.get(id)
  if (!item) {
    backToList()
    return
  }
  state.screen = 'detail'
  state.activeItemId = id
  const options = {
    item,
    clipboardClearMs: state.settings.clipboardClearMs,
    onBack: backToList,
    onEdit: () => openEditor(id),
    onToggleFavorite: async (target) => {
      await vault.upsert({ ...target, favorite: !target.favorite })
      hapticLight()
      openDetail(id)
    },
    onOpenUrl: (url) => {
      const href = /^https?:\/\//i.test(url) ? url : `https://${url}`
      window.open(href, '_blank', 'noopener')
    },
    onColorChange: async (cardColor) => {
      await vault.upsert({ ...item, cardColor })
      hapticLight()
      toast('Цвет карты изменён', 'success', 1400)
      openDetail(id)
    },
    onAppearanceChange: async ({ icon, iconColor }) => {
      await vault.upsert({ ...item, icon, iconColor })
      hapticLight()
    }
  }
  const view =
    item.type === 'card'
      ? cardDetailScreen(options)
      : item.type === 'loyalty'
        ? loyaltyDetailScreen(options)
        : detailScreen(options)
  mount(root, view.element)
}

function openNewItem() {
  state.screen = 'new'
  const view = newItemScreen({
    onBack: backToList,
    onPick: (type) => openEditor(null, type.preset)
  })
  mount(root, view.element)
}

function openEditor(id, preset = {}) {
  const item = id ? vault.get(id) : null
  state.screen = 'editor'
  state.editorItemId = item?.id ?? null
  const view = editorScreen({
    item,
    preset,
    defaultCategory: state.settings.defaultCategory,
    onCancel: requestLeaveEditor,
    // The camera is a long flow: the vault must not lock while the user
    // points the phone at a barcode.
    onScannerOpen: suspendAutoLock,
    onScannerClose: resumeAutoLock,
    onDelete: item
      ? async () => {
          const yes = await confirmDialog({
            title: 'Удалить запись?',
            message: `«${item.title || 'Без названия'}» будет удалена безвозвратно.`,
            confirmLabel: 'Удалить',
            danger: true
          })
          if (!yes) return
          await vault.remove(item.id)
          hapticMedium()
          toast('Запись удалена', 'success', 1500)
          backToList()
        }
      : null,
    onSave: async (payload) => {
      try {
        const saved = await vault.upsert(payload)
        hapticMedium()
        toast('Запись сохранена', 'success', 1500)
        openDetail(saved.id)
      } catch (error) {
        console.error('Save failed:', error)
        toast('Не удалось сохранить запись', 'error')
      }
    }
  })
  editorUnsaved = view.isDirty
  mount(root, view.element)
  if (!item) view.focus()
}

function openCategories() {
  state.screen = 'categories'
  const view = categoriesScreen({
    categories: CATEGORIES,
    onBack: openSettings,
    onAdd: async ({ label, color }) => {
      await writeCategories([...CATEGORIES, { id: `cat_${Date.now().toString(36)}`, label, color }])
      hapticLight()
      toast('Категория добавлена', 'success', 1400)
      render()
    },
    onEdit: async (id, { label, color }) => {
      await writeCategories(CATEGORIES.map((category) => (category.id === id ? { ...category, label, color } : category)))
      hapticLight()
      toast('Категория изменена', 'success', 1400)
      render()
    },
    onDelete: async (category) => {
      if (CATEGORIES.length <= 1) {
        toast('Должна остаться хотя бы одна категория', 'error', 2000)
        return
      }
      const fallback = CATEGORIES.find((item) => item.id !== category.id && item.id === 'other') ??
        CATEGORIES.find((item) => item.id !== category.id)
      const yes = await confirmDialog({
        title: 'Удалить категорию?',
        message: `Записи из «${category.label}» перейдут в «${fallback.label}».`,
        confirmLabel: 'Удалить',
        danger: true
      })
      if (!yes) return
      await writeCategories(CATEGORIES.filter((item) => item.id !== category.id))
      await vault.batch(async () => {
        for (const entry of vault.list().filter((item) => item.category === category.id)) {
          await vault.upsert({ ...entry, category: fallback.id })
        }
      })
      if (state.category === category.id) state.category = 'all'
      if (state.settings.defaultCategory === category.id) applySettings({ defaultCategory: fallback.id })
      hapticMedium()
      toast('Категория удалена', 'success', 1500)
      render()
    }
  })
  mount(root, view.element)
}

async function runUpdateCheck() {
  const version = state.appVersion || (await getAppVersion()).version
  try {
    const result = await checkForUpdateCore({ currentVersion: version })
    if (result.release) await writeUpdateCache(result.release)
    state.update = { status: result.available ? 'available' : 'current', release: result.release, error: null }
    return result
  } catch (error) {
    state.update = { status: 'error', release: null, error: error?.message || 'нет связи' }
    return { available: false, release: null, error: state.update.error }
  }
}

async function downloadUpdate(release) {
  const asset = release?.asset
  if (!asset?.url) {
    toast('В релизе нет APK-файла', 'error')
    return { ok: false }
  }

  const fill = el('div', { class: 'h-full w-0 bg-brand-500 transition-[width] duration-200' })
  const bar = el('div', { class: 'h-2 w-full overflow-hidden rounded-full bg-ink-800' }, [fill])
  const label = el('p', { class: 'text-center text-sm text-ink-300', text: 'Загрузка…' })
  let downloadedPath = ''
  const installButton = el('button', {
    class:
      'hidden w-full rounded-xl bg-brand-500 py-2.5 text-sm font-semibold text-white shadow-soft transition active:scale-[0.98] hover:bg-brand-400',
    text: 'Установить обновление',
    onclick: async () => {
      const result = await installApk(downloadedPath)
      if (result.ok) {
        modal.close()
        return
      }
      const openPage = await confirmDialog({
        title: 'Не удалось открыть установщик',
        message: `${result.error}\n\nОткрыть страницу релиза, чтобы скачать обновление вручную?`,
        confirmLabel: 'Открыть страницу'
      })
      if (openPage) await openExternalUrl(RELEASE_PAGE_URL)
    }
  })

  const modal = openModal({
    title: `Обновление до ${release.version}`,
    subtitle: release.name || 'Релиз с GitHub',
    centered: true,
    body: el('div', { class: 'space-y-3' }, [bar, label, installButton])
  })

  try {
    downloadedPath = await downloadApk(asset.url, asset.name, (status) => {
      const total = Number(status?.contentLength) || 0
      const percent = total ? Math.min(100, Math.round((Number(status?.bytes) || 0) / total * 100)) : 0
      fill.style.width = `${percent}%`
      label.textContent = total ? `Загрузка… ${percent}%` : 'Загрузка…'
    })
    fill.style.width = '100%'
    label.textContent = 'Обновление скачано'
    installButton.classList.remove('hidden')
  } catch (error) {
    console.error('Update download failed:', error)
    label.textContent = 'Не удалось скачать обновление'
    toast('Не удалось скачать обновление', 'error')
  }
}

function openSettings() {
  state.screen = 'settings'
  const view = settingsScreen({
    settings: state.settings,
    biometricsAvailable: state.biometricReady,
    onBack: backToList,
    onChange: (patch) => {
      if (patch.biometrics === true) {
        enableBiometricsDialog().then((enabled) => {
          // the switch is a native checkbox: if setup was cancelled, restore it from settings
          if (!enabled && state.screen === 'settings') openSettings()
        })
        return
      }
      if (patch.biometrics === false) {
        deleteMasterCredential()
        applySettings({ biometrics: false })
        toast('Вход по биометрии отключён', 'info', 1600)
        return
      }
      if (patch.secureScreen !== undefined) {
        applySettings({ secureScreen: patch.secureScreen })
        toast(
          patch.secureScreen ? 'Защита экрана включена' : 'Защита экрана выключена',
          'info',
          1600
        )
        return
      }
      applySettings(patch)
    },
    onChangeMaster: () => {
      changeMasterDialog({
        onSubmit: async (current, next) => {
          try {
            await vault.changeMasterPassword(current, next)
            await deleteMasterCredential()
            if (state.settings.biometrics) await saveMasterCredential(next)
            hapticMedium()
            toast('Мастер-пароль изменён', 'success')
            return true
          } catch {
            return false
          }
        }
      })
    },
    onExport: () => openTransfer('export'),
    onImport: () => openTransfer('import'),
    onManageToken: manageServerToken,
    serverProfile: state.settings.serverProfile || '',
    onManageCategories: openCategories,
    onDeleteVault: deleteVaultFlow,
    appVersion: state.appVersion,
    update: state.update,
    onCheckUpdate: runManualUpdateCheck,
    onDownloadUpdate: downloadUpdate,
    onOpenRelease: () => openExternalUrl(RELEASE_PAGE_URL)
  })
  mount(root, view.element)
  refreshUpdateState(view)
  if (!state.settings.serverProfile) {
    ensureServerProfile().then(() => {
      if (state.screen === 'settings') openSettings()
    })
  }
}

// The update block must never sit idle with a stale version: opening the
// settings screen triggers a check by itself.
const SETTINGS_CHECK_INTERVAL_MS = 15 * 60 * 1000

async function refreshUpdateState(view) {
  if (!view?.setUpdate) return

  // A cached release that is newer than the installed one is shown at once.
  const cached = await readUpdateCache()
  if (cached && compareVersions(cached.version, state.appVersion) > 0) {
    state.update = { status: 'available', release: cached, error: null }
    view.setUpdate(state.update)
    return
  }

  if (!(await shouldCheckForUpdate({ intervalMs: SETTINGS_CHECK_INTERVAL_MS }))) return

  view.setUpdate({ status: 'checking' })
  await runUpdateCheck()
  view.setUpdate(state.update)
}

function enableBiometricsDialog() {
  return new Promise((resolve) => {
    let enabled = false
    const input = el('input', { type: 'password', placeholder: 'Мастер-пароль', class: 'w-full' })
    openModal({
      title: 'Вход по биометрии',
      subtitle: 'Введите мастер-пароль и подтвердите биометрию — он сохранится в защищённом хранилище устройства',
      body: input,
      onClose: () => resolve(enabled),
      actions: [
        {
          label: 'Включить',
          primary: true,
          onClick: async () => {
            if (!input.value) {
              toast('Введите мастер-пароль', 'error')
              return false
            }
            suspendAutoLock()
            const confirmed = await biometricAuthenticate()
            resumeAutoLock()
            if (!confirmed) {
              toast('Биометрия не подтверждена', 'error')
              return false
            }
            try {
              await vault.unlock(input.value)
            } catch {
              toast('Неверный мастер-пароль', 'error')
              return false
            }
            const saved = await saveMasterCredential(input.value)
            if (!saved) {
              toast('Не удалось сохранить пароль в хранилище устройства', 'error')
              return false
            }
            enabled = true
            applySettings({ biometrics: true })
            toast('Вход по биометрии включён', 'success')
            return true
          }
        }
      ]
    })
    setTimeout(() => input.focus(), 120)
  })
}

function askPassword({ title, subtitle, confirmLabel = 'Продолжить', validate }) {
  return new Promise((resolve) => {
    let value = null
    const input = el('input', {
      type: 'password',
      placeholder: 'Мастер-пароль',
      autocomplete: 'current-password',
      class: 'w-full'
    })
    openModal({
      title,
      subtitle,
      body: input,
      onClose: () => resolve(value),
      actions: [
        {
          label: confirmLabel,
          primary: true,
          onClick: async () => {
            if (!input.value) {
              toast('Введите мастер-пароль', 'error')
              return false
            }
            const error = await validate?.(input.value)
            if (error) {
              toast(error, 'error')
              return false
            }
            value = input.value
            return true
          }
        }
      ]
    })
    setTimeout(() => input.focus(), 120)
  })
}

function openTransfer(mode) {
  state.screen = 'transfer'
  state.transferMode = mode === 'import' ? 'import' : 'export'
  const view = transferScreen({
    mode: state.transferMode,
    onBack: openSettings,
    onFile: state.transferMode === 'export' ? exportBackupFile : importBackupFile,
    onServer: state.transferMode === 'export' ? exportBackupToServer : importBackupFromServer
  })
  mount(root, view.element)
  resetLockTimer()
}

async function exportBackupFile() {
  suspendAutoLock()
  try {
    const password = await askPassword({
      title: 'Экспорт в файл .zmk',
      subtitle: 'Копия будет зашифрована мастер-паролем. Без него файл не открыть.',
      confirmLabel: 'Экспортировать',
      validate: async (value) => ((await vault.verifyPassword(value)) ? null : 'Неверный мастер-пароль')
    })
    if (!password) return

    try {
      const backup = await vault.exportEncrypted(password)
      const stamp = new Date().toISOString().slice(0, 10)
      await shareFile(`zamok-backup-${stamp}.zmk`, JSON.stringify(backup, null, 2))
      hapticMedium()
      toast('Зашифрованная копия сохранена', 'success')
    } catch {
      toast('Не удалось сохранить файл', 'error')
    }
  } finally {
    resumeAutoLock()
  }
}

async function exportBackupToServer() {
  suspendAutoLock()
  try {
    const profile = await ensureServerProfile()
    const password = await askPassword({
      title: 'Экспорт на сервер',
      subtitle: `Копия будет зашифрована мастер-паролем и уйдёт в ${BACKUP_OWNER}/${BACKUP_REPO}/${BACKUP_FOLDER}/${profile}.`,
      confirmLabel: 'Загрузить',
      validate: async (value) => ((await vault.verifyPassword(value)) ? null : 'Неверный мастер-пароль')
    })
    if (!password) return
    const token = await ensureServerToken()
    if (!token) return

    const busy = toast('Загружаю копию на сервер…', 'info', 60000)
    try {
      const backup = await vault.exportEncrypted(password)
      const filename = backupFilename()
      await uploadBackup(token, profile, filename, JSON.stringify(backup, null, 2))
      await pruneBackups(token, profile).catch(() => [])
      hapticMedium()
      busy.remove()
      toast(`Копия на сервере: ${filename}`, 'success', 3000)
    } catch (error) {
      busy.remove()
      toast(error?.message || 'Не удалось загрузить копию', 'error', 3000)
    }
  } finally {
    resumeAutoLock()
  }
}

function serverTokenDialog({ hasToken }) {
  return new Promise((resolve) => {
    const input = el('input', {
      type: 'password',
      placeholder: hasToken ? 'Токен сохранён — вставьте новый, чтобы заменить' : 'github_pat_…',
      autocomplete: 'off',
      class: 'w-full'
    })
    const actions = []
    if (hasToken) {
      actions.push({
        label: 'Удалить',
        danger: true,
        onClick: () => {
          resolve({ action: 'delete' })
          return true
        }
      })
    }
    actions.push({
      label: 'Сохранить',
      primary: true,
      onClick: () => {
        const token = input.value.trim()
        if (!token) {
          toast('Вставьте токен GitHub', 'error')
          return false
        }
        resolve({ action: 'save', token })
        return true
      }
    })
    openModal({
      title: 'GitHub-токен',
      subtitle: `Доступ к ${BACKUP_OWNER}/${BACKUP_REPO}`,
      body: el('div', { class: 'space-y-2' }, [
        el('p', {
          class: 'text-xs leading-relaxed text-ink-500',
          text: 'Нужен fine-grained токен с правом Contents: read and write на репозиторий копий. Токен хранится в защищённом хранилище телефона.'
        }),
        input
      ]),
      actions,
      onClose: () => resolve(null)
    })
    setTimeout(() => input.focus(), 120)
  })
}

async function ensureServerToken() {
  const saved = await getServerToken()
  if (saved) return saved
  const result = await serverTokenDialog({ hasToken: false })
  if (!result || result.action !== 'save') return null
  await saveServerToken(result.token)
  return result.token
}

async function ensureServerProfile() {
  if (state.settings.serverProfile) return state.settings.serverProfile
  const deviceId = await getDeviceIdentifier()
  const id = await profileIdForDevice(deviceId)
  applySettings({ serverProfile: id })
  return id
}

async function manageServerToken() {
  suspendAutoLock()
  try {
    const existing = await getServerToken()
    const result = await serverTokenDialog({ hasToken: Boolean(existing) })
    if (!result) return
    if (result.action === 'delete') {
      await deleteServerToken()
      toast('Токен удалён', 'info', 1800)
      return
    }
    await saveServerToken(result.token)
    toast('Токен сохранён', 'success', 1800)
  } finally {
    resumeAutoLock()
  }
}

async function importBackupFromServer() {
  suspendAutoLock()
  try {
    const token = await ensureServerToken()
    if (!token) return
    const profile = await ensureServerProfile()

    const status = el('p', { class: 'text-sm text-ink-400', text: 'Читаю список копий…' })
    const list = el('div', { class: 'space-y-2' })
    const modal = openModal({
      title: 'Копии на сервере',
      subtitle: `${BACKUP_OWNER}/${BACKUP_REPO}/${BACKUP_FOLDER}/${profile}`,
      body: el('div', { class: 'space-y-3' }, [status, list])
    })

    let backups = []

    const downloadServerBackup = async (backup) => {
      modal.close()
      const busy = toast('Скачиваю копию…', 'info', 60000)
      try {
        const text = await downloadBackup(token, profile, backup.name)
        busy.remove()
        await importBackupText(text)
      } catch (error) {
        busy.remove()
        toast(error?.message || 'Не удалось скачать копию', 'error', 3000)
      }
    }

    const removeServerBackup = async (backup) => {
      const confirmed = await confirmDialog({
        title: 'Удалить копию с сервера?',
        message: `${backup.name}\n\nВосстановить удалённую копию не получится.`,
        confirmLabel: 'Удалить',
        danger: true
      })
      if (!confirmed) return
      const busy = toast('Удаляю копию…', 'info', 30000)
      try {
        await deleteBackup(token, profile, backup.name, backup.sha)
        busy.remove()
        toast('Копия удалена с сервера', 'success', 2200)
        await loadBackups()
      } catch (error) {
        busy.remove()
        toast(error?.message || 'Не удалось удалить копию', 'error', 3000)
      }
    }

    const openServerBackup = (backup) => {
      openModal({
        title: 'Копия на сервере',
        subtitle: formatBackupSize(backup),
        body: el('div', { class: 'space-y-2' }, [
          el('p', {
            class: 'break-all rounded-xl border border-ink-800 bg-ink-950/60 px-3 py-2.5 text-sm text-ink-200',
            text: backup.name
          }),
          el('p', {
            class: 'text-sm leading-relaxed text-ink-400',
            text: 'Загрузить копию в хранилище или удалить её с сервера?'
          })
        ]),
        actions: [
          { label: 'Удалить с сервера', danger: true, onClick: () => removeServerBackup(backup) },
          { label: 'Загрузить с сервера', primary: true, onClick: () => downloadServerBackup(backup) }
        ]
      })
    }

    const loadBackups = async () => {
      status.textContent = 'Читаю список копий…'
      list.replaceChildren()
      try {
        backups = await listBackups(token, profile)
      } catch (error) {
        backups = []
        status.textContent = error?.message || 'Не удалось получить список копий'
        return
      }
      if (!backups.length) {
        status.textContent = 'Копий вашего профиля на сервере нет'
        return
      }
      status.textContent = `Копий вашего профиля: ${backups.length}`
      for (const backup of backups) {
        list.append(
          el('button', {
            class:
              'flex w-full items-center gap-3 rounded-[6px] border border-ink-800 bg-ink-900/60 p-3 text-left transition active:scale-[0.99] hover:border-ink-700 hover:bg-ink-900',
            onclick: () => openServerBackup(backup)
          }, [
            el('span', { class: 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-brand-300' }, [
              icon(ICONS.cloud, 'w-4.5 h-4.5')
            ]),
            el('span', { class: 'min-w-0 flex-1' }, [
              el('span', { class: 'block truncate text-sm font-semibold text-ink-100', text: backup.name }),
              el('span', { class: 'mt-0.5 block text-xs text-ink-500', text: formatBackupSize(backup) })
            ]),
            el('span', { class: 'text-ink-600' }, [icon(ICONS.download, 'w-4 h-4')])
          ])
        )
      }
    }

    await loadBackups()
  } finally {
    resumeAutoLock()
  }
}

function formatBackupSize(backup) {
  const date = backup.date ? new Date(backup.date).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : ''
  const size = backup.size < 1024 ? `${backup.size} Б` : `${Math.round(backup.size / 1024)} КБ`
  return date ? `${date} · ${size}` : size
}

function pickBackupFile() {
  return new Promise((resolve) => {
    const input = el('input', { type: 'file', accept: '.zmk,application/json,.json', class: 'hidden' })
    const finish = (value) => {
      input.remove()
      resolve(value)
    }
    input.addEventListener('change', async () => {
      const file = input.files?.[0]
      finish(file ? await file.text() : null)
    })
    input.addEventListener('cancel', () => finish(null))
    document.body.append(input)
    input.click()
  })
}

async function importBackupFile() {
  suspendAutoLock()
  try {
    const text = await pickBackupFile()
    if (text == null) return
    await importBackupText(text)
  } finally {
    resumeAutoLock()
  }
}

async function importBackupText(text) {
  let file
  try {
    file = JSON.parse(text)
  } catch {
    toast('Файл не похож на резервную копию', 'error', 2500)
    return
  }

  let data = file
  if (file?.format === 'zmk') {
    data = await askPassword({
      title: 'Импорт из .zmk',
      subtitle: 'Введите мастер-пароль, которым зашифрован файл',
      confirmLabel: 'Импортировать',
      validate: async (password) => {
        try {
          data = await vault.decryptBackup(file, password)
          return null
        } catch (error) {
          return error?.message || 'Не удалось расшифровать файл'
        }
      }
    }).then((password) => (password ? data : null))
    if (!data) return
  }

  const confirmed = await confirmDialog({
    title: 'Импортировать копию?',
    message: 'Текущие записи будут объединены с данными из копии. Убедитесь, что у вас есть бэкап текущего хранилища.',
    confirmLabel: 'Импортировать',
    danger: true
  })
  if (!confirmed) return

  try {
    const added = await vault.importPlain(data, 'merge')
    hapticMedium()
    render()
    toast(`Импортировано записей: ${added}`, 'success', 2200)
  } catch (error) {
    console.error('Import failed:', error)
    toast(error?.message || 'Не удалось импортировать', 'error')
  }
}

async function deleteVaultFlow() {
  const password = await promptDialog({
    title: 'Удалить хранилище?',
    label: 'Все записи будут стёрты безвозвратно вместе с ключом и зашифрованными данными. Введите мастер-пароль, чтобы подтвердить.',
    placeholder: 'Мастер-пароль',
    type: 'password',
    confirmLabel: 'Удалить всё'
  })
  if (password === null) return
  if (!password) {
    toast('Введите мастер-пароль', 'error')
    return
  }
  if (!(await vault.verifyPassword(password))) {
    toast('Неверный мастер-пароль', 'error')
    return
  }
  await removeVault()
  await deleteMasterCredential()
  vault.lock()
  applySettings({ biometrics: false })
  toast('Хранилище удалено', 'success')
  state.screen = 'unlock'
  render()
}

const LAUNCH_UPDATE_CHECK_DELAY_MS = 15 * 1000
const LAUNCH_CHECK_MIN_INTERVAL_MS = 5 * 60 * 1000
const UPDATE_NOTICE_TOAST_MS = 6000

let updateNoticeVersion = ''
let updateCheckTimer = null

async function notifyUpdate(version, release) {
  if (!appIsActive) return
  if (updateNoticeVersion === version) return
  const seen = await readSeenVersions()
  if (updateNoticeVersion === version) return
  if (!shouldNotifyUpdate({ screen: state.screen, version, seen })) return
  updateNoticeVersion = version
  toast(`Доступна версия ${version}`, 'success', UPDATE_NOTICE_TOAST_MS, () => {
    if (release) downloadUpdate(release)
  })
}

async function runManualUpdateCheck() {
  const result = await runUpdateCheck()
  if (result?.available && result?.release?.version) {
    await rememberSeenVersion(result.release.version)
  }
  return result
}

function scheduleUpdateCheck() {
  if (updateCheckTimer) return
  updateCheckTimer = setTimeout(() => {
    updateCheckTimer = null
    if (appIsActive) runLaunchUpdateCheck()
  }, LAUNCH_UPDATE_CHECK_DELAY_MS)
}

function cancelScheduledUpdateCheck() {
  if (!updateCheckTimer) return
  clearTimeout(updateCheckTimer)
  updateCheckTimer = null
}

async function runLaunchUpdateCheck() {
  try {
    const cached = await readUpdateCache()
    const hitNetwork = await shouldCheckForUpdate({ intervalMs: LAUNCH_CHECK_MIN_INTERVAL_MS })

    if (!hitNetwork) {
      if (cached && compareVersions(cached.version, state.appVersion) > 0) {
        state.update = { status: 'available', release: cached, error: null }
        notifyUpdate(cached.version, cached)
      }
      return
    }

    const result = await runUpdateCheck()
    if (result?.available) {
      notifyUpdate(result.release.version, result.release)
    }
  } catch (error) {
    console.error('Update check failed:', error)
  }
}

async function bootstrap() {
  root = document.getElementById('app')
  if (!isWebCryptoAvailable()) {
    toast('Web Crypto недоступен — шифрование невозможно', 'error', 8000)
  }
  await setupStatusBar()
  await setupKeyboard()
  state.settings = await readSettings()
  applySecureScreen()
  const categories = await readCategories()
  CATEGORIES.splice(0, CATEGORIES.length, ...categories)
  state.biometricReady = await biometricsAvailable()
  const versionInfo = await getAppVersion()
  state.appVersion = versionInfo.version
  render()
  hideSplash()

  onAppStateChange((isActive) => {
    appIsActive = isActive
    if (!isActive && state.settings.autoLockMs > 0 && !autoLockSuspended) lockVault()
    if (isActive) {
      scheduleUpdateCheck()
      tryAutoBiometric()
    } else {
      cancelScheduledUpdateCheck()
    }
  })

  onBackButton(navigateBack)

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.settings.autoLockMs > 0 && !autoLockSuspended) {
      lockVault()
    } else if (!document.hidden) {
      resetLockTimer()
      tryAutoBiometric()
    }
  })

  for (const event of ['pointerdown', 'keydown', 'touchstart']) {
    document.addEventListener(event, resetLockTimer, { passive: true })
  }

  scheduleUpdateCheck()
}

bootstrap()
