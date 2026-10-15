package dev.zamok.vault.crypto

/**
 * The vault key, encrypted by a key that lives in the Android Keystore and needs a fresh
 * biometric unlock for every use.
 *
 * ```
 * offset  size  field
 * 0       9     magic "ZAMOKBIO1"
 * 9       1     version
 * 10      1     iv length
 * 11      n     iv
 * 11+n    m     ciphertext, with the GCM tag appended
 * ```
 *
 * The IV is stored because the Keystore generates it and hands it back; it cannot be re-derived.
 * It is not secret — GCM only requires that it is never reused with the same key, which is
 * exactly why the Keystore owns it rather than the caller.
 */
internal object BiometricBlob {

    const val MAGIC = "ZAMOKBIO1"
    const val VERSION = 1

    private const val MAGIC_BYTES = 9
    private const val HEADER_BYTES = MAGIC_BYTES + 1 + 1

    /**
     * A header, a non-empty IV and at least one byte of ciphertext.
     *
     * No minimum ciphertext length is imposed beyond that: whether the bytes form a valid sealed
     * key is for GCM to say, and a short ciphertext fails authentication on its own.
     */
    const val MIN_BYTES = HEADER_BYTES + 1 + 1

    fun encode(iv: ByteArray, ciphertext: ByteArray): ByteArray {
        require(iv.isNotEmpty() && iv.size <= 255) { "IV must be 1..255 bytes, was ${iv.size}" }
        require(ciphertext.isNotEmpty()) { "Ciphertext is empty" }

        val out = ByteArray(HEADER_BYTES + iv.size + ciphertext.size)
        MAGIC.toByteArray(Charsets.US_ASCII).copyInto(out)
        out[MAGIC_BYTES] = VERSION.toByte()
        out[MAGIC_BYTES + 1] = iv.size.toByte()
        iv.copyInto(out, HEADER_BYTES)
        ciphertext.copyInto(out, HEADER_BYTES + iv.size)
        return out
    }

    /**
     * @throws VaultCryptoException if the bytes are not a blob this version understands.
     */
    fun decode(bytes: ByteArray): ProtectedVaultKey {
        if (bytes.size < MIN_BYTES) {
            throw VaultCryptoException("Protected key is too short (${bytes.size} bytes)")
        }
        if (String(bytes, 0, MAGIC_BYTES, Charsets.US_ASCII) != MAGIC) {
            throw VaultCryptoException("Not a Zamok biometric key")
        }
        val version = bytes[MAGIC_BYTES].toInt()
        if (version != VERSION) {
            throw VaultCryptoException("Unsupported biometric key version $version")
        }

        val ivLength = bytes[MAGIC_BYTES + 1].toInt() and 0xFF
        if (ivLength == 0 || bytes.size < HEADER_BYTES + ivLength + 1) {
            throw VaultCryptoException("Biometric key is truncated")
        }

        return ProtectedVaultKey(
            iv = bytes.copyOfRange(HEADER_BYTES, HEADER_BYTES + ivLength),
            ciphertext = bytes.copyOfRange(HEADER_BYTES + ivLength, bytes.size),
        )
    }
}

/** The two halves of a biometric-protected vault key. */
internal class ProtectedVaultKey(val iv: ByteArray, val ciphertext: ByteArray)
