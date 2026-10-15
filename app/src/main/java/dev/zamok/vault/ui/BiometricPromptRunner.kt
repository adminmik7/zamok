package dev.zamok.vault.ui

import android.app.Activity
import android.hardware.biometrics.BiometricPrompt
import android.os.Build
import android.os.CancellationSignal
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

    fun run(
        activity: Activity,
        cipher: Cipher,
        title: String,
        cancelLabel: String,
        onUnlocked: (Cipher) -> Unit,
        onFailure: (CharSequence?) -> Unit,
    ) {
        val executor = activity.mainExecutor

        BiometricPrompt.Builder(activity)
            .setTitle(title)
            .setNegativeButton(cancelLabel, executor) { _, _ -> }
            .build()
            .authenticate(
                BiometricPrompt.CryptoObject(cipher),
                CancellationSignal(),
                executor,
                object : BiometricPrompt.AuthenticationCallback() {

                    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                        val authenticated = result.cryptoObject?.cipher
                        if (authenticated == null) onFailure(null) else onUnlocked(authenticated)
                    }

                    override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                        // Backing out is not an error worth a message; anything else is.
                        if (errorCode == BiometricPrompt.BIOMETRIC_ERROR_USER_CANCELED ||
                            errorCode == BiometricPrompt.BIOMETRIC_ERROR_NEGATIVE_BUTTON
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
    }
}
