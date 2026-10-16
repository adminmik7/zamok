package dev.zamok.vault.ui

import dev.zamok.vault.model.Entry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The two things the record screen works out about a password: how far to trust it, and when the
 * record was last touched. Both are shown as a mark and two lines of text, so a wrong answer is
 * read rather than noticed.
 */
class EntryStrengthTest {

    private fun entry(password: String, title: String = "Почта", username: String = "") =
        Entry(id = "1", title = title, username = username, password = password)

    @Test
    fun `a password one of the rules dislikes is weak`() {
        assertEquals(Strength.WEAK, strengthOf(entry("123456")))
        assertEquals(Strength.WEAK, strengthOf(entry("qwerty")))
    }

    @Test
    fun `a password that repeats the entry itself is weak`() {
        assertEquals(Strength.WEAK, strengthOf(entry("pochta-svedet")))
    }

    @Test
    fun `a short password that passes the rules is only middling`() {
        assertEquals(Strength.MEDIUM, strengthOf(entry("K7q-Lm2x")))
    }

    @Test
    fun `a long one that passes the rules is called strong`() {
        assertEquals(Strength.STRONG, strengthOf(entry("K7q-Lm2x-Rp9t-Vc4w")))
    }

    @Test
    fun `a record with no password is not marked weak for it`() {
        assertEquals(Strength.STRONG, strengthOf(Entry(id = "1")))
    }

    @Test
    fun `a stamp is written the way a person writes it`() {
        val stamp = formatStamp(1_762_000_000_000L)

        assertTrue(stamp, stamp.matches(Regex("\\d{2}\\.\\d{2}\\.\\d{4} \\d{2}:\\d{2}")))
    }

    @Test
    fun `a time that was never set is left out rather than shown as 1970`() {
        assertEquals("", formatStamp(0L))
    }
}