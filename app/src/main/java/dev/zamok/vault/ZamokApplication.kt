package dev.zamok.vault

import android.app.Application
import dev.zamok.vault.data.VaultRepository
import dev.zamok.vault.data.VaultStore
import dev.zamok.vault.ui.BiometricSupport
import dev.zamok.vault.ui.VaultController
import java.io.File

/**
 * Owns the single vault this app has, and the state the screens read from it.
 *
 * Both live here rather than in an activity because a screen rotation must not lock the vault:
 * the vault would fall shut in the user's hand, and the KDF would run again for nothing. The
 * process dying does drop the unlocked vault, which is exactly right — the key only ever exists
 * in memory.
 *
 * This is the role a ViewModel would play, hoisted one level so rotation and backgrounding are
 * handled in one place instead of per screen.
 */
class ZamokApplication : Application() {

    val repository: VaultRepository by lazy {
        VaultRepository(VaultStore(File(filesDir, VAULT_FILE_NAME)))
    }

    /** Created lazily on the main thread, so the controller's default dispatch is usable. */
    val controller: VaultController by lazy {
        VaultController(
            repository = repository,
            biometricSupported = BiometricSupport.isSupported(this),
        )
    }

    private companion object {
        const val VAULT_FILE_NAME = "vault.zmk"
    }
}
