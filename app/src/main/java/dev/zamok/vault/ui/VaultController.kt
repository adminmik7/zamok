package dev.zamok.vault.ui

import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import dev.zamok.vault.crypto.VaultCryptoException
import dev.zamok.vault.data.VaultRepository
import dev.zamok.vault.model.Entry
import java.io.IOException
import java.util.concurrent.Executor
import java.util.concurrent.Executors

/** Everything the screens draw, in one object, so a screen only ever reads one value. */
data class VaultUiState(
    val unlocked: Boolean = false,
    val vaultExists: Boolean = false,
    val busy: Boolean = false,
    val error: VaultError? = null,
    val entries: List<Entry> = emptyList(),
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
) {

    var state by mutableStateOf(VaultUiState(vaultExists = repository.vaultExists()))
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
        state = VaultUiState(vaultExists = repository.vaultExists())
    }

    fun add(entry: Entry) = submit { repository.add(entry) }

    fun update(entry: Entry) = submit { repository.update(entry) }

    fun delete(id: String) = submit { repository.delete(id) }

    fun dismissError() {
        state = state.copy(error = null)
    }

    private fun submit(action: () -> Unit) {
        // A second tap while the first is still running would run the KDF twice over the same state.
        if (state.busy) return
        state = state.copy(busy = true, error = null)

        background.execute {
            val outcome = runCatching(action)
            val failure = outcome.exceptionOrNull()
            main.execute {
                state = if (failure == null) {
                    VaultUiState(
                        unlocked = repository.isUnlocked,
                        vaultExists = repository.vaultExists(),
                        entries = repository.entries,
                    )
                } else {
                    // Leave the entries alone: the change never reached disk, so showing it would
                    // promise the user something the vault does not hold.
                    state.copy(busy = false, error = failure.toVaultError())
                }
            }
        }
    }

    private fun Throwable.toVaultError(): VaultError = when (this) {
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
