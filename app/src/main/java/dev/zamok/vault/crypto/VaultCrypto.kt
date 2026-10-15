package dev.zamok.vault.crypto

import java.security.GeneralSecurityException
import java.security.SecureRandom
import java.util.Arrays
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

/**
 * Thrown when a vault cannot be opened.
 *
 * AES-GCM authentication cannot distinguish "wrong password" from "damaged or tampered file",
 * so neither does this type. Reporting them separately would mean guessing.
 */
class VaultCryptoException(message: String, cause: Throwable? = null) : Exception(message, cause)

/**
 * Cryptographic primitives. Nothing here is hand-rolled: this class only wires up
 * PBKDF2-HMAC-SHA256 and AES-256-GCM from the platform.
 */
internal object VaultCrypto {

    const val SALT_BYTES = 32
    const val KEY_BYTES = 32
    const val NONCE_BYTES = 12
    const val TAG_BITS = 128
    const val TAG_BYTES = TAG_BITS / 8

    /** PBKDF2-HMAC-SHA256 is in the platform provider from API 26, which is our minSdk. */
    private const val KDF = "PBKDF2WithHmacSHA256"
    private const val TRANSFORM = "AES/GCM/NoPadding"

    private val random = SecureRandom()

    fun randomBytes(size: Int): ByteArray = ByteArray(size).also { random.nextBytes(it) }

    /** Derives a 32-byte AES key from the master password. */
    fun deriveKey(password: CharArray, salt: ByteArray, iterations: Int): ByteArray {
        require(iterations > 0) { "iterations must be positive, was $iterations" }
        val spec = PBEKeySpec(password, salt, iterations, KEY_BYTES * 8)
        try {
            return SecretKeyFactory.getInstance(KDF).generateSecret(spec).encoded
        } catch (e: GeneralSecurityException) {
            throw VaultCryptoException("Key derivation failed", e)
        } finally {
            spec.clearPassword()
        }
    }

    /**
     * Encrypts [plaintext] and returns `nonce || ciphertext || tag`.
     *
     * A fresh random 96-bit nonce each call. With a random nonce GCM stays safe far below
     * 2^32 messages per key, and a personal vault will never come close.
     */
    fun seal(key: ByteArray, plaintext: ByteArray, aad: ByteArray): ByteArray {
        val nonce = randomBytes(NONCE_BYTES)
        return try {
            val cipher = Cipher.getInstance(TRANSFORM)
            cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(TAG_BITS, nonce))
            cipher.updateAAD(aad)
            nonce + cipher.doFinal(plaintext)
        } catch (e: GeneralSecurityException) {
            throw VaultCryptoException("Encryption failed", e)
        }
    }

    /**
     * Reverses [seal]. The nonce alone is not secret, so a failure here means either the
     * password was wrong or the bytes were altered — GCM proves which of the two never happened.
     */
    fun open(key: ByteArray, sealedBytes: ByteArray, aad: ByteArray): ByteArray {
        if (sealedBytes.size < NONCE_BYTES + TAG_BYTES) {
            throw VaultCryptoException("Ciphertext is too short to be valid")
        }
        val nonce = sealedBytes.copyOfRange(0, NONCE_BYTES)
        val body = sealedBytes.copyOfRange(NONCE_BYTES, sealedBytes.size)
        return try {
            val cipher = Cipher.getInstance(TRANSFORM)
            cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(TAG_BITS, nonce))
            cipher.updateAAD(aad)
            cipher.doFinal(body)
        } catch (e: GeneralSecurityException) {
            throw VaultCryptoException("Wrong password, or the vault file is damaged", e)
        }
    }
}

/**
 * Best-effort wipe of a secret from memory.
 *
 * The JVM may hold copies elsewhere (GC moves objects, the Cipher keeps its own state), so this
 * narrows the window rather than closing it. It is still worth doing for derived keys.
 */
internal fun ByteArray.wipe() {
    Arrays.fill(this, 0.toByte())
}
