package dev.zamok.vault.ui

import android.app.Activity
import android.hardware.biometrics.BiometricPrompt
import android.os.Build
import android.os.CancellationSignal
import android.os.SystemClock
import androidx.annotation.RequiresApi
import javax.crypto.Cipher

/**
 * Shows the platform biometric prompt and hands back the [Cipher] it unlocked.
 *
 * The platform API is used directly rather than `androidx.biometric`, whose only stable release
 * dates from 2020: the security of this feature comes from the Keystore key, not from the library
 * that draws the dialog, and pulling in AppCompat for the dialog alone is not worth it.
 *
 * Requires Android 9. Below that there is no prompt that can carry a `CryptoObject`.
 */
@RequiresApi(Build.VERSION_CODES.P)
internal object BiometricPromptRunner {

    /**
     * How long a prompt is treated as being on screen, whether or not anyone says it has ended.
     *
     * A minute is far longer than answering one takes; the point of the ceiling is that a lost
     * callback can only ever postpone the auto-lock for a bounded time rather than call it off.
     */
    private const val PROMPT_GRACE_MS = 60_000L

    @Volatile
    private var promptStartedAt = 0L

    /**
     * Held for the life of the prompt on purpose.
     *
     * A `CancellationSignal` that is only a temporary can be garbage collected while the dialog is
     * up, which on some implementations takes the authentication down with it — a prompt that never
     * appears, or one that vanishes on its own. Keeping the reference costs nothing.
     */
    private var cancellation: CancellationSignal? = null

    /**
     * True while a fingerprint prompt is plausibly up.
     *
     * Read by the activity before it auto-locks. The vault must not be locked underneath a dialog
     * the user is in the middle of answering — and enrolling a fingerprint needs the vault open, so
     * locking at that moment is exactly how the enrolment silently fails.
     *
     * Deliberately time-bounded instead of waiting for a callback to clear it. `onAuthenticationFailed`
     * is not a terminal event (one unreadable finger leaves the dialog up), and if the system ever
     * dismissed the prompt without reporting it, a plain flag would stay set and the vault would
     * never auto-lock again — a far worse failure than a dialog that gets covered.
     */
    val promptActive: Boolean
        get() = promptStartedAt != 0L &&
            SystemClock.elapsedRealtime() - promptStartedAt < PROMPT_GRACE_MS

    fun run(
        activity: Activity,
        cipher: Cipher,
        title: String,
        cancelLabel: String,
        onUnlocked: (Cipher) -> Unit,
        onFailure: (CharSequence?) -> Unit,
    ) {
        val executor = activity.mainExecutor

        val prompt = BiometricPrompt.Builder(activity)
            .setTitle(title)
            .setNegativeButton(cancelLabel, executor) { _, _ -> }
            .build()

        // A prompt that is already up would be cancelled by its own successor on some devices.
        cancellation?.cancel()
        val signal = CancellationSignal()
        cancellation = signal

        promptStartedAt = SystemClock.elapsedRealtime()
        try {
            prompt.authenticate(
                BiometricPrompt.CryptoObject(cipher),
                signal,
                executor,
                object : BiometricPrompt.AuthenticationCallback() {

                    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                        promptStartedAt = 0L
                        cancellation = null
                        val authenticated = result.cryptoObject?.cipher
                        if (authenticated == null) onFailure(null) else onUnlocked(authenticated)
                    }

                    override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                        promptStartedAt = 0L
                        cancellation = null
                        // Backing out is not an error worth a message; anything else is. Only the
                        // two cancellation codes the platform class actually publishes are checked
                        // — the negative button reports one of these.
                        if (errorCode == BiometricPrompt.BIOMETRIC_ERROR_USER_CANCELED ||
                            errorCode == BiometricPrompt.BIOMETRIC_ERROR_CANCELED
                        ) {
                            onFailure(null)
                        } else {
                            onFailure(errString)
                        }
                    }

                    // One unreadable finger. The prompt stays up and lets the user try again, so
                    // treating this as a failure would throw away a working unlock.
                    override fun onAuthenticationFailed() = Unit
                },
            )
        } catch (failure: Exception) {
            // The platform refused the prompt outright, so it will never report anything.
            promptStartedAt = 0L
            cancellation = null
            onFailure(failure.message)
        }
    }
}
