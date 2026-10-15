package dev.zamok.vault.crypto

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Test

class VaultCryptoTest {

    private val key = ByteArray(VaultCrypto.KEY_BYTES) { it.toByte() }
    private val aad = "header".toByteArray()
    private val plaintext = "секрет".toByteArray()

    @Test
    fun `seal and open round trip`() {
        val sealedBytes = VaultCrypto.seal(key, plaintext, aad)
        assertArrayEquals(plaintext, VaultCrypto.open(key, sealedBytes, aad))
    }

    @Test
    fun `open requires the same aad that seal used`() {
        val sealedBytes = VaultCrypto.seal(key, plaintext, aad)

        assertThrows(VaultCryptoException::class.java) {
            VaultCrypto.open(key, sealedBytes, "different header".toByteArray())
        }
    }

    @Test
    fun `open rejects a different key`() {
        val sealedBytes = VaultCrypto.seal(key, plaintext, aad)
        val otherKey = ByteArray(VaultCrypto.KEY_BYTES) { (it + 1).toByte() }

        assertThrows(VaultCryptoException::class.java) {
            VaultCrypto.open(otherKey, sealedBytes, aad)
        }
    }

    @Test
    fun `open rejects input shorter than a nonce and a tag`() {
        assertThrows(VaultCryptoException::class.java) {
            VaultCrypto.open(key, ByteArray(VaultCrypto.NONCE_BYTES), aad)
        }
    }

    @Test
    fun `a fresh nonce makes identical plaintext encrypt differently`() {
        val first = VaultCrypto.seal(key, plaintext, aad)
        val second = VaultCrypto.seal(key, plaintext, aad)

        assertFalse(first.contentEquals(second))
        assertArrayEquals(plaintext, VaultCrypto.open(key, second, aad))
    }

    @Test
    fun `derives the same key from the same inputs and a different one from another salt`() {
        val salt = ByteArray(VaultCrypto.SALT_BYTES) { it.toByte() }
        val other = ByteArray(VaultCrypto.SALT_BYTES) { (it + 1).toByte() }
        val password = "pw".toCharArray()

        val a = VaultCrypto.deriveKey(password, salt, 1_000)
        val b = VaultCrypto.deriveKey(password, salt, 1_000)
        val c = VaultCrypto.deriveKey(password, other, 1_000)

        assertEquals(VaultCrypto.KEY_BYTES, a.size)
        assertArrayEquals(a, b)
        assertFalse(a.contentEquals(c))
    }
}
