package dev.zamok.vault.crypto

import java.io.ByteArrayOutputStream
import java.net.URI
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/** The hash behind a code. Sites overwhelmingly use SHA1, but the standard allows all three. */
enum class TotpAlgorithm(val macName: String) {
    SHA1("HmacSHA1"),
    SHA256("HmacSHA256"),
    SHA512("HmacSHA512"),
}

/**
 * A secret that can produce codes. Only [Totp.parse] builds one, so a value of this type is known
 * to have been understood before it is used.
 *
 * The key is a plain [ByteArray] derived from a [String], so it cannot really be wiped — same
 * trade-off as [dev.zamok.vault.model.Entry]. It exists only while the vault is unlocked.
 */
class TotpSecret internal constructor(
    private val key: ByteArray,
    val digits: Int,
    val periodSeconds: Int,
    val algorithm: TotpAlgorithm,
) {

    /**
     * The code valid at [timeMillis], zero-padded to [digits].
     *
     * RFC 4226's dynamic truncation: the low nibble of the last hash byte chooses a 4-byte window
     * inside the hash, whose top bit is masked off so the result stays positive.
     */
    fun codeAt(timeMillis: Long): String {
        val counter = timeMillis / 1000L / periodSeconds
        val mac = Mac.getInstance(algorithm.macName)
        mac.init(SecretKeySpec(key, algorithm.macName))

        val counterBytes = ByteArray(8)
        for (index in 0 until 8) {
            counterBytes[7 - index] = (counter ushr (8 * index)).toByte()
        }
        val hash = mac.doFinal(counterBytes)

        val offset = hash[hash.size - 1].toInt() and 0x0F
        val binary = ((hash[offset].toInt() and 0x7F) shl 24) or
            ((hash[offset + 1].toInt() and 0xFF) shl 16) or
            ((hash[offset + 2].toInt() and 0xFF) shl 8) or
            (hash[offset + 3].toInt() and 0xFF)

        return (binary % modulus(digits)).toString().padStart(digits, '0')
    }

    /** Whole seconds until [codeAt] starts returning something else. */
    fun secondsRemainingAt(timeMillis: Long): Int {
        val elapsed = (timeMillis / 1000L) % periodSeconds
        return (periodSeconds - elapsed).toInt()
    }

    private fun modulus(digits: Int): Int = when (digits) {
        6 -> 1_000_000
        7 -> 10_000_000
        8 -> 100_000_000
        // Unreachable: parse rejects anything else, and staying an Int keeps the modulo exact.
        else -> error("Unsupported digit count $digits")
    }
}

/**
 * Time-based one-time passwords, the second factor this vault stores alongside a password.
 *
 * Accepts either a bare Base32 key or a whole `otpauth://totp/...` URI, because those are the two
 * shapes a site hands out. Counter-based `otpauth://hotp/` is refused rather than guessed at:
 * without its counter, treating it as time-based would produce codes that are simply wrong.
 */
object Totp {

    const val DEFAULT_DIGITS = 6
    const val DEFAULT_PERIOD_SECONDS = 30

    private const val SCHEME_PREFIX = "otpauth:"
    private const val MIN_DIGITS = 6
    private const val MAX_DIGITS = 8

    /** @return null when [secret] is neither a Base32 key nor a usable otpauth URI. */
    fun parse(secret: String): TotpSecret? {
        val trimmed = secret.trim()
        if (trimmed.isEmpty()) return null
        return if (trimmed.startsWith(SCHEME_PREFIX, ignoreCase = true)) {
            parseUri(trimmed)
        } else {
            decodeBase32(trimmed)?.let {
                TotpSecret(it, DEFAULT_DIGITS, DEFAULT_PERIOD_SECONDS, TotpAlgorithm.SHA1)
            }
        }
    }

    private fun parseUri(uri: String): TotpSecret? {
        val parsed = runCatching { URI(uri) }.getOrNull() ?: return null
        if (!parsed.scheme.equals("otpauth", ignoreCase = true)) return null
        if (!parsed.host.equals("totp", ignoreCase = true)) return null

        // Plain splitting, no percent-decoding: every value needed here is a Base32 key or a number,
        // and the one field that does get escaped — the label — is ignored.
        val parameters = parsed.rawQuery.orEmpty()
            .split('&')
            .mapNotNull { pair ->
                val separator = pair.indexOf('=')
                if (separator <= 0) null else pair.take(separator).lowercase() to pair.substring(separator + 1)
            }
            .toMap()

        val key = parameters["secret"]?.let { decodeBase32(it) } ?: return null

        val algorithm = when (parameters["algorithm"]?.uppercase()) {
            null, "SHA1" -> TotpAlgorithm.SHA1
            "SHA256" -> TotpAlgorithm.SHA256
            "SHA512" -> TotpAlgorithm.SHA512
            else -> return null
        }

        val digits = parameters["digits"]?.toIntOrNull() ?: DEFAULT_DIGITS
        val period = parameters["period"]?.toIntOrNull() ?: DEFAULT_PERIOD_SECONDS
        if (digits !in MIN_DIGITS..MAX_DIGITS || period <= 0) return null

        return TotpSecret(key, digits, period, algorithm)
    }

    /**
     * RFC 4648 Base32, the encoding every site uses for these keys. Spaces, dashes and padding are
     * ignored — keys get shown in groups of four, and people paste them that way.
     *
     * @return null if any character is outside the alphabet, or if the bits left over after the
     * last whole byte are not zero. That last check matters: without it a mistyped key is accepted
     * and quietly produces codes that never match.
     */
    private fun decodeBase32(text: String): ByteArray? {
        val cleaned = text.filterNot { it == ' ' || it == '-' || it == '=' }.uppercase()
        if (cleaned.isEmpty()) return null

        val bytes = ByteArrayOutputStream(cleaned.length * 5 / 8)
        var buffer = 0
        var bits = 0
        for (character in cleaned) {
            val value = when (character) {
                in 'A'..'Z' -> character - 'A'
                in '2'..'7' -> character - '2' + 26
                else -> return null
            }
            buffer = (buffer shl 5) or value
            bits += 5
            if (bits >= 8) {
                bits -= 8
                bytes.write((buffer shr bits) and 0xFF)
            }
        }
        if (bits > 0 && (buffer and ((1 shl bits) - 1)) != 0) return null
        // A key that decodes to no bytes at all is not a key.
        if (bytes.size() == 0) return null

        return bytes.toByteArray()
    }
}
