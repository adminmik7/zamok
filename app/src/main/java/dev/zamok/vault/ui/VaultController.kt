package dev.zamok.vault.ui

import android.os.Handler
import android.os.Looper
import android.security.keystore.KeyPermanentlyInvalidatedException
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import dev.zamok.vault.crypto.VaultCryptoException
import dev.zamok.vault.data.VaultRepository
import dev.zamok.vault.model.Entry
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.util.concurrent.Executor
import java.util.concurrent.Executors

/** Everything the screens draw, in one object, so a screen only ever reads one value. */
data class VaultUiState(
    val unlocked: Boolean = false,
    val vaultExists: Boolean = false,
    val busy: Boolean = false,
    val error: VaultError? = null,
    val entries: List<Entry> = emptyList(),
    val biometricEnrolled: Boolean = false,
)

/**
 * User-facing failures. Kept as types rather than messages so the text lives in resources and
 * this class stays testable without Android.
 *
 * [WRONG_PASSWORD_OR_DAMAGED] is deliberately one case: AES-GCM cannot tell a wrong password from
 * a corrupted file, both are the same authentication failure. Claiming to know which it was would
 * be a lie in a dialog.
 */
enum class VaultError {
    WRONG_PASSWORD_OR_DAMAGED,
    PASSWORD_TOO_SHORT,
    STORAGE,
    BIOMETRIC_LOST,
    UNEXPECTED,
}

/**
 * Runs vault operations for the screens.
 *
 * Every operation that touches the disk goes to [background] first, because unlocking runs PBKDF2
 * and takes about a second — freezing the UI for that long looks like a hang. Results are applied
 * back on [main], which is the only thread that may write the state the UI observes.
 *
 * Both executors are injectable so the whole thing can be driven synchronously from a unit test
 * with no device involved.
 */
class VaultController(
    private val repository: VaultRepository,
    private val background: Executor = Executors.newSingleThreadExecutor(),
    private val main: Executor = Executor { command -> Handler(Looper.getMainLooper()).post(command) },
    /** Whether this device can protect the vault key with a biometric unlock at all. */
    val biometricSupported: Boolean = false,
) {

    var state by mutableStateOf(snapshot())
        private set

    fun create(password: String) {
        if (password.length < MIN_MASTER_PASSWORD_LENGTH) {
            state = state.copy(error = VaultError.PASSWORD_TOO_SHORT)
            return
        }
        submit { repository.create(password.toCharArray()) }
    }

    fun unlock(password: String) = submit { repository.unlock(password.toCharArray()) }

    fun lock() {
        repository.lock()
        state = snapshot()
    }

    fun add(entry: Entry) = submit { repository.add(entry) }

    fun update(entry: Entry) = submit { repository.update(entry) }

    fun delete(id: String) = submit { repository.delete(id) }

    fun dismissError() {
        state = state.copy(error = null)
    }

    // ---- Backup ----
    //
    // The stream comes from the UI, which is what holds the uri the user picked and the
    // ContentResolver that can open it. Nothing Android-shaped reaches the repository, so the
    // part worth testing — what a restore may overwrite and what it must leave alone — is still
    // ordinary code.

    /** Copies the encrypted vault into the stream [open] hands back. */
    fun export(open: () -> OutputStream) = submit { open().use { repository.exportTo(it) } }

    /** Replaces the vault with the backup in [open]'s stream, which is opened with [password]. */
    fun restore(open: () -> InputStream, password: String) =
        submit { open().use { repository.restore(it, password.toCharArray()) } }

    // ---- Biometric unlock ----
    //
    // The prompt itself runs in the UI layer, which is what has an Activity. What arrives here is
    // only the cipher the prompt unlocked, so the vault key never travels through a screen.

    /** Stores a biometric copy of the open vault's key, sealed by [seal]. */
    fun enableBiometricUnlock(seal: (ByteArray) -> ByteArray) =
        submit { repository.enableBiometricUnlock(seal) }

    /** Opens the vault with the key [open] recovers from the stored copy. */
    fun unlockWithBiometrics(open: (ByteArray) -> ByteArray) =
        submit { repository.unlockWithBiometrics(open) }

    /** Drops the stored copy. The vault still opens with its password. */
    fun forgetBiometricUnlock() = submit { repository.forgetBiometricUnlock() }

    /** The IV of the stored copy, for building the decrypt cipher. Not secret. */
    fun biometricIv(): ByteArray? = runCatching { repository.biometricIv() }.getOrNull()

    /**
     * Called when the Keystore key is gone before the prompt can even run — the platform destroys
     * it when a new fingerprint is enrolled. The stored copy is worthless from then on.
     */
    fun onBiometricKeyLost() {
        repository.forgetBiometricUnlock()
        state = snapshot().copy(error = VaultError.BIOMETRIC_LOST)
    }

    private fun snapshot() = VaultUiState(
        unlocked = repository.isUnlocked,
        vaultExists = repository.vaultExists(),
        entries = repository.entries,
        biometricEnrolled = repository.biometricUnlockEnrolled(),
    )

    private fun submit(action: () -> Unit) {
        // A second tap while the first is still running would run the KDF twice over the same state.
        if (state.busy) return
        state = state.copy(busy = true, error = null)

        background.execute {
            val outcome = runCatching(action)
            val failure = outcome.exceptionOrNull()
            main.execute {
                state = if (failure == null) {
                    snapshot()
                } else {
                    // Leave the entries alone: the change never reached disk, so showing it would
                    // promise the user something the vault does not hold. The enrolment flag is
                    // re-read, because a failed biometric unlock removes the stored copy.
                    state.copy(
                        busy = false,
                        error = failure.toVaultError(),
                        biometricEnrolled = repository.biometricUnlockEnrolled(),
                    )
                }
            }
        }
    }

    private fun Throwable.toVaultError(): VaultError = when (this) {
        // Checked before VaultCryptoException and before anything generic: it is a subtype of
        // InvalidKeyException, and the user needs to be told the fingerprint no longer works.
        is KeyPermanentlyInvalidatedException -> VaultError.BIOMETRIC_LOST
        is VaultCryptoException -> VaultError.WRONG_PASSWORD_OR_DAMAGED
        is IOException -> VaultError.STORAGE
        else -> VaultError.UNEXPECTED
    }

    private companion object {
        /**
         * A floor, not a policy. The master password is the only thing standing between the file
         * and every other password in it, and there is no recovery if it is forgotten.
         */
        const val MIN_MASTER_PASSWORD_LENGTH = 8
    }
}
