package dev.zamok.vault.crypto

import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Byte layout of a vault file:
 *
 * ```
 * offset  size  field
 * 0       6     magic "ZAMOK1"
 * 6       1     version
 * 7       4     kdf iterations (big-endian)
 * 11      32    salt
 * 43      60    wrapped key: nonce || ciphertext(32) || tag
 * 103     n     payload:     nonce || ciphertext      || tag
 * ```
 *
 * [header] covers `magic..salt`. It is the additional authenticated data of the key wrap, and
 * `header || wrappedKey` is the AAD of the payload, so no field can be edited or reordered
 * without authentication failing.
 */
internal object VaultLayout {

    const val MAGIC = "ZAMOK1"
    const val VERSION = 1

    const val SALT_BYTES = VaultCrypto.SALT_BYTES
    const val WRAPPED_KEY_BYTES = VaultCrypto.NONCE_BYTES + VaultCrypto.KEY_BYTES + VaultCrypto.TAG_BYTES

    private const val MAGIC_BYTES = 6
    private const val VERSION_BYTES = 1
    private const val ITERATIONS_BYTES = 4

    const val HEADER_BYTES = MAGIC_BYTES + VERSION_BYTES + ITERATIONS_BYTES + SALT_BYTES
    const val MIN_FILE_BYTES = HEADER_BYTES + WRAPPED_KEY_BYTES + VaultCrypto.NONCE_BYTES + VaultCrypto.TAG_BYTES

    fun header(iterations: Int, salt: ByteArray): ByteArray {
        require(salt.size == SALT_BYTES) { "salt must be $SALT_BYTES bytes, was ${salt.size}" }
        return ByteBuffer.allocate(HEADER_BYTES)
            .order(ByteOrder.BIG_ENDIAN)
            .put(MAGIC.toByteArray(Charsets.US_ASCII))
            .put(VERSION.toByte())
            .putInt(iterations)
            .put(salt)
            .array()
    }
}

/**
 * The vault as it sits on disk. Parsing never needs the password, so a locked vault can be
 * inspected — only [unlock] touches secrets.
 *
 * There are two layers of keys on purpose. The master key `MK = PBKDF2(password, salt, n)` never
 * leaves this file; it wraps a random 32-byte vault key `VK`, and `VK` encrypts the payload.
 * Changing the password therefore re-wraps `VK` and leaves the payload untouched, instead of
 * re-encrypting everything.
 */
class VaultFile private constructor(
    val iterations: Int,
    val salt: ByteArray,
    internal val wrappedKey: ByteArray,
    internal val payload: ByteArray,
) {

    /** The exact bytes to write to disk. */
    fun encode(): ByteArray {
        return VaultLayout.header(iterations, salt) + wrappedKey + payload
    }

    /**
     * Verifies [masterPassword] and returns a session holding the vault key.
     * Callers must [VaultSession.close] it when locking.
     *
     * @throws VaultCryptoException if the password is wrong or the file was altered.
     */
    fun unlock(masterPassword: CharArray): VaultSession {
        val masterKey = VaultCrypto.deriveKey(masterPassword, salt, iterations)
        try {
            val vaultKey = VaultCrypto.open(masterKey, wrappedKey, header())
            return VaultSession(vaultKey, iterations, salt, wrappedKey, payload)
        } finally {
            masterKey.wipe()
        }
    }

    /**
     * Re-wraps the vault key under [new]. The payload is not re-encrypted, so this is cheap
     * even for a large vault. [current] is verified first.
     */
    fun changePassword(
        current: CharArray,
        new: CharArray,
        newIterations: Int = iterations,
    ): VaultFile {
        val currentMasterKey = VaultCrypto.deriveKey(current, salt, iterations)
        val vaultKey = try {
            VaultCrypto.open(currentMasterKey, wrappedKey, header())
        } finally {
            currentMasterKey.wipe()
        }

        try {
            val newSalt = VaultCrypto.randomBytes(VaultLayout.SALT_BYTES)
            val newHeader = VaultLayout.header(newIterations, newSalt)
            val newMasterKey = VaultCrypto.deriveKey(new, newSalt, newIterations)
            val newWrappedKey = try {
                VaultCrypto.seal(newMasterKey, vaultKey, newHeader)
            } finally {
                newMasterKey.wipe()
            }
            return VaultFile(newIterations, newSalt, newWrappedKey, payload)
        } finally {
            vaultKey.wipe()
        }
    }

    /** AAD binding the payload to this exact header and wrapped key. */
    internal fun payloadAad(): ByteArray = header() + wrappedKey

    private fun header(): ByteArray = VaultLayout.header(iterations, salt)

    companion object {

        /**
         * 600k iterations is the OWASP figure for PBKDF2-HMAC-SHA256. It costs roughly a second
         * on a mid-range phone, once, at unlock.
         */
        const val DEFAULT_ITERATIONS = 600_000

        /** Creates a brand new vault holding [payload], encrypted under [masterPassword]. */
        fun create(
            masterPassword: CharArray,
            payload: ByteArray,
            iterations: Int = DEFAULT_ITERATIONS,
        ): VaultFile {
            val salt = VaultCrypto.randomBytes(VaultLayout.SALT_BYTES)
            val header = VaultLayout.header(iterations, salt)
            val vaultKey = VaultCrypto.randomBytes(VaultCrypto.KEY_BYTES)
            try {
                val masterKey = VaultCrypto.deriveKey(masterPassword, salt, iterations)
                try {
                    val wrappedKey = VaultCrypto.seal(masterKey, vaultKey, header)
                    val payloadBytes = VaultCrypto.seal(vaultKey, payload, header + wrappedKey)
                    return VaultFile(iterations, salt, wrappedKey, payloadBytes)
                } finally {
                    masterKey.wipe()
                }
            } finally {
                vaultKey.wipe()
            }
        }

        /**
         * Reads a vault file. Does not verify the password — that happens in [unlock].
         *
         * @throws VaultCryptoException if the bytes are not a vault of a version we understand.
         */
        fun parse(bytes: ByteArray): VaultFile {
            if (bytes.size < VaultLayout.MIN_FILE_BYTES) {
                throw VaultCryptoException("File is too short to be a vault (${bytes.size} bytes)")
            }

            val buffer = ByteBuffer.wrap(bytes).order(ByteOrder.BIG_ENDIAN)
            val magic = ByteArray(6).also { buffer.get(it) }
            if (String(magic, Charsets.US_ASCII) != VaultLayout.MAGIC) {
                throw VaultCryptoException("Not a Zamok vault file")
            }

            val version = buffer.get().toInt()
            if (version != VaultLayout.VERSION) {
                throw VaultCryptoException("Unsupported vault version $version")
            }

            val iterations = buffer.int
            if (iterations <= 0) {
                throw VaultCryptoException("Header carries an invalid iteration count")
            }

            val salt = ByteArray(VaultLayout.SALT_BYTES).also { buffer.get(it) }
            val wrappedKey = ByteArray(VaultLayout.WRAPPED_KEY_BYTES).also { buffer.get(it) }
            val payload = ByteArray(bytes.size - buffer.position()).also { buffer.get(it) }

            return VaultFile(iterations, salt, wrappedKey, payload)
        }

        internal fun of(
            iterations: Int,
            salt: ByteArray,
            wrappedKey: ByteArray,
            payload: ByteArray,
        ): VaultFile = VaultFile(iterations, salt, wrappedKey, payload)
    }
}

/**
 * An unlocked vault. Holds the vault key in memory; [close] wipes it.
 *
 * Deliberately not `AutoCloseable`: `use {}` invites treating a lock as a scoped block, and a
 * vault stays open across many frames.
 */
class VaultSession internal constructor(
    private val vaultKey: ByteArray,
    val iterations: Int,
    val salt: ByteArray,
    private val wrappedKey: ByteArray,
    private val payload: ByteArray,
) {

    /** Decrypts and returns the payload. Fresh bytes on every call. */
    fun readPayload(): ByteArray {
        val header = VaultLayout.header(iterations, salt)
        return VaultCrypto.open(vaultKey, payload, header + wrappedKey)
    }

    /** Re-encrypts [plaintext] under the vault key and returns the file to persist. */
    fun writePayload(plaintext: ByteArray): VaultFile {
        val header = VaultLayout.header(iterations, salt)
        val sealedPayload = VaultCrypto.seal(vaultKey, plaintext, header + wrappedKey)
        return VaultFile.of(iterations, salt, wrappedKey, sealedPayload)
    }

    /** Drops the vault key. The session is unusable afterwards. */
    fun close() {
        vaultKey.wipe()
    }
}
