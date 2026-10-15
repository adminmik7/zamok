package dev.zamok.vault.crypto

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

/**
 * Only the framing is checked here. Whether the Keystore-based encryption works is a device
 * question — it needs real hardware-backed keys, so it is verified on a phone, not in a JVM.
 */
class BiometricBlobTest {

    private val iv = ByteArray(12) { it.toByte() }
    private val ciphertext = ByteArray(64) { (it * 3).toByte() }

    @Test
    fun `round trips the iv and the ciphertext`() {
        val decoded = BiometricBlob.decode(BiometricBlob.encode(iv, ciphertext))

        assertArrayEquals(iv, decoded.iv)
        assertArrayEquals(ciphertext, decoded.ciphertext)
    }

    @Test
    fun `keeps the iv and ciphertext apart when ciphertext looks like an iv`() {
        // An IV of the same bytes as the ciphertext prefix is where an off-by-one shows up.
        val decoded = BiometricBlob.decode(BiometricBlob.encode(iv, iv.copyOf()))

        assertArrayEquals(iv, decoded.iv)
        assertArrayEquals(iv, decoded.ciphertext)
    }

    @Test
    fun `accepts a single byte iv`() {
        val decoded = BiometricBlob.decode(BiometricBlob.encode(byteArrayOf(1), ciphertext))

        assertEquals(1, decoded.iv.size)
        assertArrayEquals(ciphertext, decoded.ciphertext)
    }

    @Test
    fun `refuses an empty iv`() {
        assertThrows(IllegalArgumentException::class.java) { BiometricBlob.encode(ByteArray(0), ciphertext) }
    }

    @Test
    fun `refuses empty ciphertext`() {
        assertThrows(IllegalArgumentException::class.java) { BiometricBlob.encode(iv, ByteArray(0)) }
    }

    @Test
    fun `refuses a blob from some other format`() {
        assertThrows(VaultCryptoException::class.java) {
            BiometricBlob.decode("some other file entirely".toByteArray())
        }
    }

    @Test
    fun `refuses a truncated blob`() {
        val whole = BiometricBlob.encode(iv, ciphertext)

        assertThrows(VaultCryptoException::class.java) {
            BiometricBlob.decode(whole.copyOfRange(0, 20))
        }
    }

    @Test
    fun `refuses a blob whose iv length runs past the end`() {
        val whole = BiometricBlob.encode(iv, ciphertext)
        // Claim a 250-byte IV in a blob that is far shorter.
        whole[BiometricBlob.MAGIC.length + 1] = 250.toByte()

        assertThrows(VaultCryptoException::class.java) { BiometricBlob.decode(whole) }
    }

    @Test
    fun `refuses a version it does not know`() {
        val whole = BiometricBlob.encode(iv, ciphertext)
        whole[BiometricBlob.MAGIC.length] = 9

        val failure = assertThrows(VaultCryptoException::class.java) { BiometricBlob.decode(whole) }
        assertEquals("Unsupported biometric key version 9", failure.message)
    }
}
