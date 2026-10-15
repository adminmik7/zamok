package dev.zamok.vault.crypto

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Iteration count is deliberately low here: these tests check correctness, not KDF cost.
 * Production uses [VaultFile.DEFAULT_ITERATIONS].
 */
private const val ITERATIONS = 1_000

private const val PASSWORD = "correct horse battery staple"

class VaultFileTest {

    // Non-ASCII on purpose: vault entries will hold Cyrillic, so the layer must be 8-bit clean.
    private val payload = """{"entries":[],"note":"тест"}""".toByteArray()

    @Test
    fun `survives a round trip through encode and parse`() {
        val file = VaultFile.create(PASSWORD.toCharArray(), payload, ITERATIONS)

        val session = VaultFile.parse(file.encode()).unlock(PASSWORD.toCharArray())
        try {
            assertArrayEquals(payload, session.readPayload())
        } finally {
            session.close()
        }
    }

    @Test
    fun `keeps the iteration count in the header so it can be raised later`() {
        val file = VaultFile.create(PASSWORD.toCharArray(), payload, ITERATIONS)
        assertTrue(VaultFile.parse(file.encode()).iterations == ITERATIONS)
    }

    @Test
    fun `rejects a wrong password`() {
        val file = VaultFile.create(PASSWORD.toCharArray(), payload, ITERATIONS)

        assertThrows(VaultCryptoException::class.java) {
            file.unlock("wrong password".toCharArray())
        }
    }

    @Test
    fun `detects a flipped bit in the payload`() {
        val file = VaultFile.create(PASSWORD.toCharArray(), payload, ITERATIONS)
        // Offset from the end lands inside the ciphertext, past the nonce and before the tag.
        val corrupted = file.encode().also { it[it.size - 20] = (it[it.size - 20] + 1).toByte() }

        val session = VaultFile.parse(corrupted).unlock(PASSWORD.toCharArray())
        try {
            assertThrows(VaultCryptoException::class.java) { session.readPayload() }
        } finally {
            session.close()
        }
    }

    @Test
    fun `detects an edited header`() {
        val file = VaultFile.create(PASSWORD.toCharArray(), payload, ITERATIONS)
        // Byte 11 is the first salt byte, inside the header that authenticates the key wrap.
        val corrupted = file.encode().also { it[11] = (it[11] + 1).toByte() }

        assertThrows(VaultCryptoException::class.java) {
            VaultFile.parse(corrupted).unlock(PASSWORD.toCharArray())
        }
    }

    @Test
    fun `changing the password keeps the payload and invalidates the old one`() {
        val file = VaultFile.create(PASSWORD.toCharArray(), payload, ITERATIONS)
        val rotated = file.changePassword(PASSWORD.toCharArray(), "new password".toCharArray())

        assertThrows(VaultCryptoException::class.java) {
            rotated.unlock(PASSWORD.toCharArray())
        }

        val session = rotated.unlock("new password".toCharArray())
        try {
            assertArrayEquals(payload, session.readPayload())
        } finally {
            session.close()
        }
    }

    @Test
    fun `changing the password re-wraps the key, not the payload`() {
        val file = VaultFile.create(PASSWORD.toCharArray(), payload, ITERATIONS)
        val rotated = file.changePassword(PASSWORD.toCharArray(), "new".toCharArray())

        // Untouched ciphertext is the whole point: a password change costs nothing on a big vault.
        assertArrayEquals(file.payload, rotated.payload)
        // A fresh salt and nonce must still produce a different wrapped key.
        assertFalse(file.wrappedKey.contentEquals(rotated.wrappedKey))
        assertFalse(file.salt.contentEquals(rotated.salt))
    }

    @Test
    fun `a payload from another vault does not open`() {
        val mine = VaultFile.create(PASSWORD.toCharArray(), payload, ITERATIONS)
        val other = VaultFile.create(PASSWORD.toCharArray(), "другой".toByteArray(), ITERATIONS)

        // Both vaults use the same password, so only the salt, the wrapped key and the vault key
        // separate them. Splice my payload into the other vault; nothing must come of it.
        val spliced = VaultFile.parse(
            VaultLayout.header(other.iterations, other.salt) + other.wrappedKey + mine.payload
        )

        val session = spliced.unlock(PASSWORD.toCharArray())
        try {
            assertThrows(VaultCryptoException::class.java) { session.readPayload() }
        } finally {
            session.close()
        }
    }

    @Test
    fun `writePayload persists changes readable under the same password`() {
        val file = VaultFile.create(PASSWORD.toCharArray(), payload, ITERATIONS)
        val updated = """{"entries":[{"title":"github"}]}""".toByteArray()

        val session = file.unlock(PASSWORD.toCharArray())
        val saved = try {
            session.writePayload(updated)
        } finally {
            session.close()
        }

        val reopened = VaultFile.parse(saved.encode()).unlock(PASSWORD.toCharArray())
        try {
            assertArrayEquals(updated, reopened.readPayload())
        } finally {
            reopened.close()
        }
    }

    @Test
    fun `rejects bytes that are not a vault`() {
        assertThrows(VaultCryptoException::class.java) { VaultFile.parse("hello".toByteArray()) }
        assertThrows(VaultCryptoException::class.java) { VaultFile.parse(ByteArray(500)) }
    }

    @Test
    fun `rejects a vault from a newer version`() {
        val file = VaultFile.create(PASSWORD.toCharArray(), payload, ITERATIONS).encode()
        file[6] = 99.toByte()

        val failure = assertThrows(VaultCryptoException::class.java) { VaultFile.parse(file) }
        assertTrue(failure.message!!.contains("version"))
    }
}
