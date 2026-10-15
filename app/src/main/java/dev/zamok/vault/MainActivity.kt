package dev.zamok.vault

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import dev.zamok.vault.ui.BiometricPromptRunner
import dev.zamok.vault.ui.VaultApp
import dev.zamok.vault.ui.ZamokTheme
import dev.zamok.vault.ui.promptBiometricUnlock

class MainActivity : ComponentActivity() {

    private val controller get() = (application as ZamokApplication).controller

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Without this, every password in the vault is one screenshot away, and the thumbnail in
        // the recents switcher shows the list to anyone holding the phone.
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
        setContent {
            ZamokTheme {
                VaultApp(controller)
            }
        }
    }

    /**
     * The fingerprint prompt is asked for here, not from the composition.
     *
     * The platform dialog only attaches to a window that is already on screen, and the first
     * composition runs before the activity is resumed — which is why a prompt fired from a
     * composable could simply never appear. Coming back to the app is also exactly the moment a
     * locked vault should ask for a finger: nothing to tap first.
     *
     * Skipped while a prompt is already up, because on some devices showing it goes through
     * another activity and this one would be resumed and ask all over again.
     */
    override fun onResume() {
        super.onResume()
        val state = controller.state
        if (state.vaultExists &&
            !state.unlocked &&
            state.biometricEnrolled &&
            controller.biometricSupported &&
            !BiometricPromptRunner.promptActive
        ) {
            promptBiometricUnlock(
                activity = this,
                controller = controller,
                title = getString(R.string.biometric_prompt_title),
                cancelLabel = getString(R.string.cancel),
            )
        }
    }

    /**
     * The vault is open in memory whenever this app is off screen, so being off screen means being
     * locked. That is the whole reason the app is trustworthy; a timeout would leave a window in
     * which a picked-up phone still has every password in it.
     *
     * Rotating the device is not leaving: locking there would make the app feel broken, so it is
     * excluded explicitly. Neither is answering the fingerprint dialog — the user is right there,
     * and locking under it is what makes disabling the fingerprint look like it worked.
     */
    override fun onStop() {
        super.onStop()
        if (!isChangingConfigurations && !BiometricPromptRunner.promptActive) {
            controller.lock()
        }
    }
}
