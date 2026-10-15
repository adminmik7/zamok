package dev.zamok.vault.crypto

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import androidx.annotation.RequiresApi
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * The key that protects the biometric copy of the vault key.
 *
 * It is generated inside the Android Keystore and never leaves it: this code only ever holds a
 * handle. Three properties do the actual work:
 *
 * - `setUserAuthenticationRequired(true)` — the key is unusable without a fresh biometric
 *   unlock, so a stolen, unlocked phone still cannot open the vault through this path.
 * - `setInvalidatedByBiometricEnrollment(true)` — adding a fingerprint destroys the key. Without
 *   it, somebody who can add their own fingerprint to an unlocked phone gets permanent access.
 * - AES-256-GCM — the same authenticated encryption as the vault itself.
 *
 * Deliberately left out: `setUnlockedDeviceRequired(true)`. It is API 28+ and would only add a
 * second, redundant condition — a biometric prompt already implies an unlocked device.
 *
 * @see BiometricBlob for the on-disk shape of what this encrypts.
 */
@RequiresApi(Build.VERSION_CODES.P)
internal object KeystoreVaultKey {

    private const val KEYSTORE = "AndroidKeyStore"
    private const val ALIAS = "zamok.biometric.vaultkey"
    private const val TRANSFORM = "AES/GCM/NoPadding"
    private const val TAG_BITS = 128

    /**
     * A cipher ready for the biometric prompt, in encrypt mode.
     *
     * The Keystore picks the IV during this call, which is why [Cipher.getIV] is read straight
     * after and stored: GCM must never reuse an IV under one key, and only the Keystore knows
     * which one it has already used.
     */
    fun encryptionCipher(): Cipher =
        Cipher.getInstance(TRANSFORM).apply { init(Cipher.ENCRYPT_MODE, key()) }

    /** A cipher for the prompt in decrypt mode, bound to the IV stored alongside the blob. */
    fun decryptionCipher(iv: ByteArray): Cipher =
        Cipher.getInstance(TRANSFORM).apply {
            init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(TAG_BITS, iv))
        }

    /**
     * Removes the Keystore key, so the stored blob becomes permanently useless.
     *
     * Called when the key was invalidated (a new fingerprint was enrolled) or when the blob no
     * longer matches the vault. Nothing can be recovered from it either way.
     */
    fun deleteKey() {
        android.util.Log.i("Zamok", "Dropping the biometric Keystore key")
        runCatching { keyStore().deleteEntry(ALIAS) }
    }

    private fun key(): SecretKey {
        val existing = keyStore().getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry
        if (existing != null) return existing.secretKey

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setUserAuthenticationRequired(true)
                .setInvalidatedByBiometricEnrollment(true)
                .build()
        )
        return generator.generateKey()
    }

    private fun keyStore(): KeyStore =
        KeyStore.getInstance(KEYSTORE).apply { load(null) }
}
