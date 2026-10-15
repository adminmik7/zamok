package dev.zamok.vault.crypto

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The code generator is checked against the published values of RFC 6238 Appendix B, not against
 * itself: if Base32 decoding or the truncation is wrong, these fail.
 */
class TotpTest {

    /** The RFC's shared secret for the SHA1 vectors, as the ASCII text it is. */
    private val rfcKey = "12345678901234567890".toByteArray(Charsets.US_ASCII)

    /** The same 20 bytes, in the Base32 a site would actually show. */
    private val rfcKeyBase32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"

    private fun secret(
        key: ByteArray = rfcKey,
        digits: Int = 8,
        periodSeconds: Int = 30,
        algorithm: TotpAlgorithm = TotpAlgorithm.SHA1,
    ) = TotpSecret(key, digits, periodSeconds, algorithm)

    /**
     * Time, then the expected SHA1 code from RFC 6238 Appendix B.
     *
     * The rows where the value has a leading zero are the reason the codes are Strings and not
     * numbers.
     */
    private val rfc6238Sha1 = listOf(
        59L to "94287082",
        1_111_111_109L to "07081804",
        1_111_111_111L to "14050471",
        1_234_567_890L to "89005924",
        2_000_000_000L to "69279037",
        20_000_000_000L to "65353130",
    )

    @Test
    fun `matches the RFC 6238 vectors for SHA1`() {
        val secret = secret()
        for ((timeMillis, expected) in rfc6238Sha1) {
            assertEquals("at ${timeMillis}s", expected, secret.codeAt(timeMillis * 1000))
        }
    }

    @Test
    fun `matches the RFC vectors through a Base32 key`() {
        // The same proof as above, but the key arrives the way it does from a real site. This is
        // what ties the Base32 decoder to everything else.
        val bare = Totp.parse(rfcKeyBase32)
        assertEquals(Totp.DEFAULT_DIGITS, bare?.digits)
        assertEquals(TotpAlgorithm.SHA1, bare?.algorithm)
        // A bare key means six digits, which is the tail of the RFC's eight.
        assertEquals("287082", bare?.codeAt(59_000))

        val eightDigits = Totp.parse("otpauth://totp/Example?secret=$rfcKeyBase32&digits=8")
        for ((timeMillis, expected) in rfc6238Sha1) {
            assertEquals("at ${timeMillis}s", expected, eightDigits?.codeAt(timeMillis * 1000))
        }
    }

    @Test
    fun `matches the RFC vectors for SHA256 and SHA512`() {
        val sha256 = secret(
            key = "12345678901234567890123456789012".toByteArray(Charsets.US_ASCII),
            algorithm = TotpAlgorithm.SHA256,
        )
        val sha512 = secret(
            key = "1234567890123456789012345678901234567890123456789012345678901234"
                .toByteArray(Charsets.US_ASCII),
            algorithm = TotpAlgorithm.SHA512,
        )

        // Only the first row of each column: it is the one quoted everywhere, and one proven row
        // already pins the hash and the truncation.
        assertEquals("46119246", sha256.codeAt(59_000))
        assertEquals("90693936", sha512.codeAt(59_000))
    }

    @Test
    fun `each algorithm gives a different code for the same key`() {
        val codes = TotpAlgorithm.entries.map { secret(algorithm = it).codeAt(59_000) }
        assertEquals(codes.size, codes.toSet().size)
    }

    @Test
    fun `a six digit code is the tail of the eight digit one`() {
        // RFC 6238 says exactly this about shortened codes, and it is a cheap extra guard on the
        // modulo.
        val eight = secret(digits = 8)
        val six = secret(digits = 6)
        assertEquals(eight.codeAt(59_000).takeLast(6), six.codeAt(59_000))
    }

    @Test
    fun `codes are zero padded to the requested length`() {
        for (digits in 6..8) {
            val secret = secret(digits = digits)
            for (step in 0 until 100) {
                val code = secret.codeAt(step * 30_000L)
                assertEquals(digits, code.length)
                assertTrue(code.all { it.isDigit() })
            }
        }
    }

    @Test
    fun `the code changes at the period boundary and not before`() {
        val secret = secret()

        assertEquals(secret.codeAt(10_000), secret.codeAt(29_000))
        assertNotEquals(secret.codeAt(29_000), secret.codeAt(30_000))
        assertEquals(secret.codeAt(30_000), secret.codeAt(59_000))
    }

    @Test
    fun `a custom period changes the boundary`() {
        val minute = secret(periodSeconds = 60)

        assertEquals(minute.codeAt(0), minute.codeAt(59_000))
        assertNotEquals(minute.codeAt(0), minute.codeAt(60_000))
    }

    @Test
    fun `seconds left counts down to the next code`() {
        val secret = secret()

        assertEquals(30, secret.secondsRemainingAt(0))
        assertEquals(1, secret.secondsRemainingAt(29_000))
        assertEquals(30, secret.secondsRemainingAt(30_000))
        assertEquals(1, secret.secondsRemainingAt(59_999))
    }

    @Test
    fun `base32 keys are read in the shapes a site shows them`() {
        // Groups of four, lowercase, and padded: all three turn up in the wild.
        val grouped = Totp.parse("gezd gnbv gy3t qojq GEZD GNBV GY3T QOJQ")
        val padded = Totp.parse("$rfcKeyBase32====")

        // Six digits, because a bare key carries no digit count: the tail of the RFC's eight.
        assertEquals("287082", grouped?.codeAt(59_000))
        assertEquals(grouped?.codeAt(59_000), padded?.codeAt(59_000))
    }

    @Test
    fun `a key that is not base32 is refused`() {
        assertNull(Totp.parse("ABC1DEFG"))     // 1 is not in the alphabet
        assertNull(Totp.parse("hello world!"))
        assertNull(Totp.parse("otpauth://totp/x?secret=ABC1DEFG"))
    }

    @Test
    fun `a key whose trailing bits are not zero is refused`() {
        // 'A' alone leaves five bits that must be zero padding, and 'AB' leaves two that are not.
        // Accepting these would mean silently generating codes that never match.
        assertNull(Totp.parse("A"))
        assertNull(Totp.parse("AB"))
        assertNull(Totp.parse("AC"))
    }

    @Test
    fun `blank and empty input is refused`() {
        assertNull(Totp.parse(""))
        assertNull(Totp.parse("   "))
    }

    @Test
    fun `an otpauth uri is understood`() {
        val label = "otpauth://totp/Example:alice@example.com?secret=$rfcKeyBase32&issuer=Example"
        val parsed = Totp.parse(label)

        assertEquals(6, parsed?.digits)
        assertEquals(30, parsed?.periodSeconds)
        // The six digit form of RFC 6238's first row.
        assertEquals("287082", parsed?.codeAt(59_000))
    }

    @Test
    fun `an otpauth uri decides the algorithm, digits and period`() {
        val parsed = Totp.parse(
            "otpauth://totp/Example?secret=$rfcKeyBase32&algorithm=SHA512&digits=8&period=60"
        )

        assertEquals(TotpAlgorithm.SHA512, parsed?.algorithm)
        assertEquals(8, parsed?.digits)
        assertEquals(60, parsed?.periodSeconds)
    }

    @Test
    fun `the scheme and host are matched case insensitively`() {
        val parsed = Totp.parse("OTPAUTH://TOTP/Example?SECRET=$rfcKeyBase32")

        assertEquals("287082", parsed?.codeAt(59_000))
    }

    @Test
    fun `counter based otpauth is refused rather than guessed at`() {
        // Without its counter an HOTP URI cannot produce a correct code, and pretending otherwise
        // would look like a working feature that fails at the site.
        assertNull(Totp.parse("otpauth://hotp/Example?secret=$rfcKeyBase32&counter=1"))
    }

    @Test
    fun `an otpauth uri without a usable secret is refused`() {
        assertNull(Totp.parse("otpauth://totp/Example?issuer=Example"))
        assertNull(Totp.parse("otpauth://totp/Example?secret="))
        assertNull(Totp.parse("otpauth://totp/Example?secret=$rfcKeyBase32&digits=4"))
        assertNull(Totp.parse("otpauth://totp/Example?secret=$rfcKeyBase32&period=0"))
        assertNull(Totp.parse("otpauth://totp/Example?secret=$rfcKeyBase32&algorithm=MD5"))
    }

    @Test
    fun `something that only looks like a uri is refused`() {
        assertNull(Totp.parse("otpauth:"))
        assertNull(Totp.parse("otpauth://totp/"))
    }
}
