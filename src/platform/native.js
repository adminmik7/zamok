import { registerPlugin } from '@capacitor/core'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { Clipboard } from '@capacitor/clipboard'
import { StatusBar, Style } from '@capacitor/status-bar'
import { Keyboard, KeyboardResize } from '@capacitor/keyboard'
import { App } from '@capacitor/app'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { NativeBiometric } from '@capgo/capacitor-native-biometric'
import { setPrivacyBlur } from '../ui/privacy.js'

// Small native helper: launches the system package installer for a downloaded
// APK and opens links in the external browser.
const Update = registerPlugin('Update')

export async function installApk(path) {
  if (!isNative()) return { ok: false, error: 'установка доступна только в приложении' }
  try {
    await Update.install({ path })
    return { ok: true }
  } catch (error) {
    console.error('installApk failed:', error)
    return { ok: false, error: error?.message || 'установщик не открылся' }
  }
}

export async function openExternalUrl(url) {
  if (isNative()) {
    try {
      await Update.openUrl({ url })
      return true
    } catch {
      // fall through to the web fallback
    }
  }
  try {
    window.open(url, '_blank', 'noopener')
    return true
  } catch {
    return false
  }
}

export async function downloadApk(url, filename, onProgress) {
  // The native side emits download progress through the "progress" event, so the
  // listener has to be attached before the request starts.
  const listener = onProgress
    ? await Filesystem.addListener('progress', (status) => onProgress(status))
    : null
  try {
    const result = await Filesystem.downloadFile({
      url,
      path: filename,
      directory: Directory.Cache,
      progress: true
    })
    return result?.path ?? ''
  } finally {
    await listener?.remove()
  }
}

export const isNative = () => {
  const cap = globalThis.Capacitor
  return Boolean(cap?.isNativePlatform?.())
}

export async function hapticLight() {
  try {
    await Haptics.impact({ style: ImpactStyle.Light })
  } catch {
    void 0
  }
}

export async function hapticMedium() {
  try {
    await Haptics.impact({ style: ImpactStyle.Medium })
  } catch {
    void 0
  }
}

export async function hapticSuccess() {
  try {
    await Haptics.notification({ type: NotificationType.Success })
  } catch {
    void 0
  }
}

export async function hapticError() {
  try {
    await Haptics.notification({ type: NotificationType.Error })
  } catch {
    void 0
  }
}

export async function copyToClipboard(text) {
  try {
    await Clipboard.write({ string: text })
  } catch {
    if (navigator.clipboard) await navigator.clipboard.writeText(text)
  }
}

export async function clearClipboard() {
  try {
    await Clipboard.write({ string: '' })
  } catch {
    void 0
  }
}

export async function setupStatusBar() {
  try {
    await StatusBar.setStyle({ style: Style.Dark })
    await StatusBar.setBackgroundColor({ color: '#0b0d12' })
  } catch {
    void 0
  }
}

export async function setupKeyboard() {
  try {
    await Keyboard.setResizeMode({ mode: KeyboardResize.Native })
    await Keyboard.setAccessoryBarVisible({ isVisible: false })
  } catch {
    void 0
  }
}

export function onAppStateChange(handler) {
  try {
    App.addListener('appStateChange', ({ isActive }) => handler(isActive))
  } catch {
    void 0
  }
}

export function onBackButton(handler) {
  try {
    App.addListener('backButton', handler)
  } catch {
    void 0
  }
}

export async function exitApp() {
  try {
    await App.exitApp()
  } catch {
    void 0
  }
}

export async function biometricsAvailable() {
  try {
    const result = await NativeBiometric.isAvailable({ useFallback: false })
    return Boolean(result?.isAvailable)
  } catch {
    return false
  }
}

export async function biometricAuthenticate(reason = 'Разблокировать хранилище') {
  // The system fingerprint dialog is a separate window: the vault screen
  // would stay readable behind it, so it is blurred while the prompt is up.
  const focused = document.activeElement
  const hadFocus = focused && typeof focused.focus === 'function' && document.contains(focused)
  setPrivacyBlur(true)
  if (hadFocus) focused.blur()
  try {
    // verifyIdentity() resolves only on success and rejects on cancel/failure.
    await NativeBiometric.verifyIdentity({
      reason,
      title: 'Zamok',
      subtitle: 'Подтвердите личность',
      description: 'Введите отпечаток или PIN',
      negativeButtonText: 'Отмена'
    })
    return true
  } catch {
    return false
  } finally {
    setPrivacyBlur(false)
    if (hadFocus && document.contains(focused)) focused.focus()
  }
}

const MASTER_CREDENTIAL_KEY = 'zamok_master_credential'
const SERVER_TOKEN_KEY = 'zamok_github_token'
let serverTokenMemory = null

export async function saveMasterCredential(password) {
  if (!isNative()) return false
  try {
    await NativeBiometric.setData({ key: MASTER_CREDENTIAL_KEY, value: password })
    return true
  } catch {
    return false
  }
}

export async function getMasterCredential() {
  if (!isNative()) return null
  try {
    const result = await NativeBiometric.getData({ key: MASTER_CREDENTIAL_KEY })
    return result?.value ?? null
  } catch {
    return null
  }
}

export async function deleteMasterCredential() {
  if (!isNative()) return
  try {
    await NativeBiometric.deleteData({ key: MASTER_CREDENTIAL_KEY })
  } catch {
    void 0
  }
}

export async function setSecureScreen(enabled) {
  if (!isNative()) return { ok: false, web: true }
  try {
    const result = await Update.setSecureScreen({ enabled: Boolean(enabled) })
    return { ok: true, enabled: Boolean(result?.enabled) }
  } catch {
    return { ok: false }
  }
}

export async function getDeviceIdentifier() {
  if (!isNative()) return null
  try {
    const result = await Update.getDeviceId()
    return result?.deviceId || null
  } catch {
    return null
  }
}

export async function saveServerToken(token) {
  serverTokenMemory = token || null
  if (!token) return false
  if (!isNative()) return false
  try {
    await NativeBiometric.setData({ key: SERVER_TOKEN_KEY, value: token })
    return true
  } catch {
    return false
  }
}

export async function getServerToken() {
  if (serverTokenMemory) return serverTokenMemory
  if (!isNative()) return null
  try {
    const result = await NativeBiometric.getData({ key: SERVER_TOKEN_KEY })
    serverTokenMemory = result?.value || null
  } catch {
    serverTokenMemory = null
  }
  return serverTokenMemory
}

export async function deleteServerToken() {
  serverTokenMemory = null
  if (!isNative()) return
  try {
    await NativeBiometric.deleteData({ key: SERVER_TOKEN_KEY })
  } catch {
    void 0
  }
}

export async function shareFile(filename, content, title = 'Zamok — резервная копия') {
  if (isNative()) {
    try {
      await Filesystem.writeFile({
        path: filename,
        data: content,
        directory: Directory.Cache,
        encoding: Encoding.UTF8
      })
      const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache })
      await Share.share({ title, files: [uri], dialogTitle: title })
      return true
    } catch {
      // fall back to a browser download
    }
  }
  const type = filename.endsWith('.json') ? 'application/json' : 'application/octet-stream'
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}
