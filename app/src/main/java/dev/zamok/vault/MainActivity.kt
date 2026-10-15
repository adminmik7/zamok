package dev.zamok.vault

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import dev.zamok.vault.ui.VaultApp

class MainActivity : ComponentActivity() {

    private val controller get() = (application as ZamokApplication).controller

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Without this, every password in the vault is one screenshot away, and the thumbnail in
        // the recents switcher shows the list to anyone holding the phone.
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
        setContent {
            MaterialTheme {
                VaultApp(controller)
            }
        }
    }

    /**
     * The vault is open in memory whenever this app is off screen, so being off screen means being
     * locked. That is the whole reason the app is trustworthy; a timeout would leave a window in
     * which a picked-up phone still has every password in it.
     *
     * Rotating the device is not leaving: locking there would make the app feel broken, so it is
     * excluded explicitly.
     */
    override fun onStop() {
        super.onStop()
        if (!isChangingConfigurations) {
            controller.lock()
        }
    }
}
