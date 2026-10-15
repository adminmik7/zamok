@file:Suppress("DEPRECATION") // FingerprintManager is the only API that exists on Android 9.

package dev.zamok.vault.ui

import android.content.Context
import android.hardware.biometrics.BiometricManager
import android.hardware.fingerprint.FingerprintManager
import android.os.Build

/**
 * Whether this device can protect a vault key with a biometric unlock.
 *
 * Only Class 3 ("strong") biometrics count. A face or fingerprint that merely unlocks the screen
 * is not strong enough to stand in for a master password — that is the whole reason the answer
 * comes from the platform rather than from a preference.
 *
 * Below Android 9 there is no `BiometricPrompt` that can carry a `CryptoObject`, so the whole
 * feature is off there. The app still runs; it just always asks for the password.
 */
object BiometricSupport {

    fun isSupported(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return false

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val manager = context.getSystemService(BiometricManager::class.java) ?: return false
            return manager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) ==
                BiometricManager.BIOMETRIC_SUCCESS
        }

        // API 28 has no BiometricManager. FingerprintManager is deprecated but is what exists there.
        val fingerprint = context.getSystemService(FingerprintManager::class.java) ?: return false
        return fingerprint.isHardwareDetected && fingerprint.hasEnrolledFingerprints()
    }
}
