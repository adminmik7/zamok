package dev.zamok.vault.data

import dev.zamok.vault.model.Entry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The rules are asserted one at a time, with the exact set of reasons, so a rule that starts firing
 * on passwords it should leave alone shows up as a failure rather than as noise on the screen.
 */
class PasswordAuditTest {

    private fun entry(
        id: String = "1",
        title: String = "",
        username: String = "",
        url: String = "",
        password: String,
    ) = Entry(id = id, title = title, username = username, url = url, password = password)

    private fun reasons(
        password: String,
        title: String = "",
        username: String = "",
        url: String = "",
    ) = PasswordAudit.assess(entry(title = title, username = username, url = url, password = password))

    @Test
    fun `a long mixed password gets no comment`() {
        assertEquals(emptySet<WeakReason>(), reasons("Xk7#mQ2!vB9pLz"))
    }

    @Test
    fun `a known password is named as one`() {
        assertEquals(setOf(WeakReason.COMMON), reasons("PASSWORD"))
        assertEquals(setOf(WeakReason.COMMON), reasons("password123"))
    }

    @Test
    fun `a run of digits is both known and a run`() {
        // Two rules can fire at once, and the screen should say both.
        assertEquals(setOf(WeakReason.COMMON, WeakReason.SEQUENCE), reasons("12345678"))
    }

    @Test
    fun `a keyboard walk is reported as a run`() {
        // A full row, long enough that length says nothing about it.
        assertEquals(setOf(WeakReason.COMMON, WeakReason.SEQUENCE), reasons("qwertyuiop"))
        // The rules are independent, so a short one lands under three of them at once.
        assertEquals(
            setOf(WeakReason.COMMON, WeakReason.TOO_SHORT, WeakReason.SEQUENCE),
            reasons("qwerty"),
        )
    }

    @Test
    fun `runs are caught in both directions and from either keyboard`() {
        assertEquals(setOf(WeakReason.SEQUENCE), reasons("abcdefgh"))
        assertEquals(setOf(WeakReason.SEQUENCE), reasons("hgfedcba"))
        assertEquals(setOf(WeakReason.SEQUENCE), reasons("asdfghjk"))
    }

    @Test
    fun `a short password is named as short`() {
        assertEquals(setOf(WeakReason.TOO_SHORT), reasons("Ab3!xy"))
    }

    @Test
    fun `eight characters is long enough and seven is not`() {
        assertEquals(emptySet<WeakReason>(), reasons("Ab3!xyzq"))
        assertEquals(setOf(WeakReason.TOO_SHORT), reasons("Ab3!xyz"))
    }

    @Test
    fun `one repeated character is named as such`() {
        assertEquals(setOf(WeakReason.REPEATED), reasons("aaaaaaaaaaaa"))
    }

    @Test
    fun `a password built from the entry's title is personal`() {
        assertEquals(setOf(WeakReason.PERSONAL), reasons("почта2024", title = "Почта"))
    }

    @Test
    fun `a password built from the login is personal`() {
        assertEquals(setOf(WeakReason.PERSONAL), reasons("alice99!", username = "alice"))
    }

    @Test
    fun `a password built from the address is personal`() {
        // The host is split, so the site's name alone is enough: nobody types the dot.
        assertEquals(setOf(WeakReason.PERSONAL), reasons("example2019", url = "https://example.com/login"))
        assertEquals(setOf(WeakReason.PERSONAL), reasons("example2019", url = "example.com"))
    }

    @Test
    fun `short words from the entry are not treated as evidence`() {
        // Three letters match by accident far too often to be worth a warning.
        val password = "Xk7#mQ2!vB9pLz"
        assertEquals(emptySet<WeakReason>(), PasswordAudit.assess(entry(title = "Вк", password = password)))
    }

    @Test
    fun `an empty password is not judged`() {
        assertEquals(emptySet<WeakReason>(), reasons(""))
    }

    @Test
    fun `one password used by two entries is one group`() {
        val shared = "Xk7#mQ2!vB9pLz"
        val report = PasswordAudit.report(
            listOf(
                entry(id = "1", title = "Почта", password = shared),
                entry(id = "2", title = "Форум", password = shared),
                entry(id = "3", title = "Банк", password = "Zq3\$wR8*nL5tVy"),
            )
        )

        assertEquals(1, report.reused.size)
        assertEquals(listOf("Почта", "Форум"), report.reused.single().entries.map { it.title })
        // A password can be strong and still be reused: one leak then costs two accounts.
        assertTrue(report.weak.isEmpty())
    }

    @Test
    fun `three entries sharing a password are a single group`() {
        val report = PasswordAudit.report(
            listOf(
                entry(id = "1", title = "A", password = "Xk7#mQ2!vB9pLz"),
                entry(id = "2", title = "B", password = "Xk7#mQ2!vB9pLz"),
                entry(id = "3", title = "C", password = "Xk7#mQ2!vB9pLz"),
            )
        )

        assertEquals(1, report.reused.size)
        assertEquals(3, report.reused.single().entries.size)
    }

    @Test
    fun `a password used once is not reuse`() {
        val report = PasswordAudit.report(
            listOf(
                entry(id = "1", password = "Xk7#mQ2!vB9pLz"),
                entry(id = "2", password = "Zq3\$wR8*nL5tVy"),
            )
        )

        assertTrue(report.reused.isEmpty())
    }

    @Test
    fun `entries without a password are not a reused pair`() {
        // A blank field is not a password, and two blanks are not the same password twice.
        val report = PasswordAudit.report(
            listOf(
                entry(id = "1", title = "Только код", password = ""),
                entry(id = "2", title = "Пустая", password = ""),
            )
        )

        assertTrue(report.reused.isEmpty())
        assertTrue(report.weak.isEmpty())
        assertTrue(report.isEmpty)
    }

    @Test
    fun `an entry can be both weak and reused`() {
        val report = PasswordAudit.report(
            listOf(
                entry(id = "1", title = "A", password = "qwerty"),
                entry(id = "2", title = "B", password = "qwerty"),
            )
        )

        assertEquals(2, report.weak.size)
        assertEquals(1, report.reused.size)
        assertFalse(report.isEmpty)
    }

    @Test
    fun `a healthy vault has nothing to report`() {
        val report = PasswordAudit.report(
            listOf(
                entry(id = "1", title = "Почта", password = "Xk7#mQ2!vB9pLz"),
                entry(id = "2", title = "Банк", password = "Zq3\$wR8*nL5tVy"),
                entry(id = "3", title = "Только код", password = ""),
            )
        )

        assertTrue(report.isEmpty)
    }
}
