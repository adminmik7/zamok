package dev.zamok.vault.data

import dev.zamok.vault.model.Entry
import java.io.ByteArrayOutputStream
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * The vault as a spreadsheet: what a file from another manager turns into, and what a round trip
 * keeps.
 *
 * The repository-level cases at the end are about the two things a spreadsheet cannot show — that
 * an import still reaches the disk, and that it does so once rather than once per row.
 */
class VaultCsvTest {

    @get:Rule
    val temporaryFolder = TemporaryFolder()

    /** See [VaultRepositoryTest] for why the real iteration count is useless in a unit test. */
    private val iterations = 1_000

    private val masterPassword = "correct horse".toCharArray()

    /** Counts how often a change reaches the disk, which is what a bulk write is for. */
    private class CountingStore(file: File) : VaultStore(file) {
        var writes = 0
            private set

        override fun write(bytes: ByteArray) {
            writes++
            super.write(bytes)
        }
    }

    private fun entry(
        title: String = "",
        username: String = "",
        password: String = "",
        url: String = "",
        notes: String = "",
        category: String = "",
        tags: List<String> = emptyList(),
        totpSecret: String = "",
        favorite: Boolean = false,
    ) = Entry(
        id = "",
        title = title,
        username = username,
        password = password,
        url = url,
        notes = notes,
        category = category,
        tags = tags,
        totpSecret = totpSecret,
        favorite = favorite,
    )

    private fun repository(store: VaultStore) =
        VaultRepository(store = store, iterations = iterations, now = { 1_000L })

    // ---- Reading a file ----

    @Test
    fun `a file without a header is read in the documented order`() {
        val imported = VaultCsv.parse("Почта,me,секрет,example.com").entries.single()

        assertEquals("Почта", imported.title)
        assertEquals("me", imported.username)
        assertEquals("секрет", imported.password)
        assertEquals("example.com", imported.url)
        assertEquals("", imported.notes)
    }

    @Test
    fun `columns are found by name, not by position`() {
        val imported = VaultCsv.parse("password,title,username\nсекрет,Почта,me").entries.single()

        assertEquals("Почта", imported.title)
        assertEquals("me", imported.username)
        assertEquals("секрет", imported.password)
    }

    @Test
    fun `the headers other managers write are understood`() {
        // Chrome, Edge and anything else following it.
        val chrome = VaultCsv.parse(
            "name,url,username,password,note\nПочта,example.com,me,секрет,заметка"
        ).entries.single()
        assertEquals("Почта", chrome.title)
        assertEquals("me", chrome.username)
        assertEquals("секрет", chrome.password)
        assertEquals("example.com", chrome.url)
        assertEquals("заметка", chrome.notes)

        // KeePass, with its spaces in the column names.
        val keePass = VaultCsv.parse(
            "Account,Login Name,Password,Web Site,Comments\nБанк,me,секрет,example.com,заметка"
        ).entries.single()
        assertEquals("Банк", keePass.title)
        assertEquals("me", keePass.username)
        assertEquals("секрет", keePass.password)
        assertEquals("example.com", keePass.url)

        // Bitwarden, which writes several columns this app has no use for.
        val bitwarden = VaultCsv.parse(
            "folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username," +
                "login_password,login_totp\n" +
                "Работа,1,login,Почта,заметка,,,example.com,me,секрет,JBSWY3DPEHPK3PXP"
        ).entries.single()
        assertEquals("Почта", bitwarden.title)
        assertEquals("Работа", bitwarden.category)
        assertEquals("example.com", bitwarden.url)
        assertEquals("me", bitwarden.username)
        assertEquals("секрет", bitwarden.password)
        assertEquals("JBSWY3DPEHPK3PXP", bitwarden.totpSecret)
        assertTrue(bitwarden.favorite)
    }

    @Test
    fun `an unknown column is ignored`() {
        val imported = VaultCsv.parse("title,type,password\nПочта,login,секрет").entries.single()

        assertEquals("Почта", imported.title)
        assertEquals("секрет", imported.password)
    }

    @Test
    fun `a row with nothing in it is not an entry`() {
        val import = VaultCsv.parse("title,username,password\nПочта,me,секрет\n,,")

        assertEquals(1, import.entries.size)
        assertEquals(0, import.skipped)
    }

    @Test
    fun `an empty file imports nothing`() {
        val import = VaultCsv.parse("")

        assertTrue(import.entries.isEmpty())
        assertEquals(0, import.skipped)
    }

    // ---- What a second import does ----

    @Test
    fun `a row the vault already holds is skipped`() {
        val existing = listOf(entry(title = "Почта", username = "me", password = "секрет"))
        val file = "title,username,password\nПочта,me,секрет\nБанк,me2,секрет2"

        val import = VaultCsv.parse(file, existing)

        assertEquals(listOf("Банк"), import.entries.map { it.title })
        assertEquals(1, import.skipped)
    }

    @Test
    fun `importing the same file twice adds nothing the second time`() {
        val file = "title,username,password\nПочта,me,секрет"

        val first = VaultCsv.parse(file)
        val second = VaultCsv.parse(file, first.entries)

        assertEquals(1, first.entries.size)
        assertTrue(second.entries.isEmpty())
        assertEquals(1, second.skipped)
    }

    @Test
    fun `a file that lists the same account twice adds it once`() {
        val import = VaultCsv.parse("title,username,password\nПочта,me,секрет\nПочта,me,секрет")

        assertEquals(1, import.entries.size)
        assertEquals(1, import.skipped)
    }

    // ---- Writing a file ----

    @Test
    fun `the export names its columns, in order, behind a byte order mark`() {
        val text = VaultCsv.export(listOf(entry(title = "A")))

        // The mark is what stops Windows spreadsheet software from turning Cyrillic into gibberish.
        assertTrue(text.startsWith("\uFEFF"))
        assertEquals(
            "title,username,password,url,notes,category,tags,totp,favorite",
            text.removePrefix("\uFEFF").lineSequence().first(),
        )
    }

    @Test
    fun `a round trip keeps every field`() {
        val original = entry(
            title = "Почта",
            username = "me@example.com",
            password = "сек,рет\"1 ",
            url = "https://example.com",
            notes = "первая\nвторая",
            category = "Работа",
            tags = listOf("важное", "личное"),
            totpSecret = "JBSWY3DPEHPK3PXP",
            favorite = true,
        )

        val parsed = VaultCsv.parse(VaultCsv.export(listOf(original))).entries.single()

        // Only the fields the repository is responsible for are allowed to differ.
        assertEquals(original, parsed.copy(id = "", createdAt = 0L, updatedAt = 0L))
    }

    @Test
    fun `a password keeps the spaces at its ends`() {
        // Nothing about a password is ever trimmed, on either side of the file.
        val fromFile = VaultCsv.parse("title,password\nA, pass ").entries.single()
        val roundTripped = VaultCsv.parse(VaultCsv.export(listOf(entry(title = "A", password = " pass "))))
            .entries.single()

        assertEquals(" pass ", fromFile.password)
        assertEquals(" pass ", roundTripped.password)
    }

    @Test
    fun `tags and favorite come back`() {
        val marked = VaultCsv.parse(
            VaultCsv.export(listOf(entry(title = "A", tags = listOf("x", "y"), favorite = true)))
        ).entries.single()
        val plain = VaultCsv.parse(VaultCsv.export(listOf(entry(title = "B")))).entries.single()

        assertEquals(listOf("x", "y"), marked.tags)
        assertTrue(marked.favorite)
        assertFalse(plain.favorite)
    }

    // ---- Through the repository ----

    @Test
    fun `an export is what the vault holds`() {
        val repository = repository(CountingStore(File(temporaryFolder.root, "vault.zmk")))
        repository.create(masterPassword)
        repository.add(entry(title = "Почта", username = "me", password = "секрет"))

        val out = ByteArrayOutputStream()
        repository.exportCsvTo(out)
        val text = out.toByteArray().toString(Charsets.UTF_8)

        assertTrue(text.contains("Почта,me,секрет"))
        // And it reads back as the same entry, which is the point of the exercise.
        val back = VaultCsv.parse(text).entries.single()
        assertEquals("Почта", back.title)
        assertEquals("me", back.username)
        assertEquals("секрет", back.password)
    }

    @Test
    fun `an import reaches the disk once, not once per row`() {
        val store = CountingStore(File(temporaryFolder.root, "vault.zmk"))
        val repository = repository(store)
        repository.create(masterPassword)
        val writesAfterCreate = store.writes

        val file = buildString {
            append("title,username,password\r\n")
            for (index in 1..50) append("Запись $index,user$index,секрет$index\r\n")
        }
        val imported = repository.importCsv(file.byteInputStream())

        assertEquals(50, imported.entries.size)
        assertEquals(0, imported.skipped)
        assertEquals(50, repository.entries.size)
        // Fifty rows re-encrypting the whole vault once each is what this guards against.
        assertEquals(writesAfterCreate + 1, store.writes)
        // ids come from the repository, so none of them can collide.
        assertEquals(50, repository.entries.map { it.id }.toSet().size)

        // And the imported entries are really on disk, not just in memory.
        repository.lock()
        repository.unlock(masterPassword)
        assertEquals(50, repository.entries.size)
        assertEquals("Запись 50", repository.entries.last().title)
    }

    @Test
    fun `importing what is already there leaves the vault as it was`() {
        val store = CountingStore(File(temporaryFolder.root, "vault.zmk"))
        val repository = repository(store)
        repository.create(masterPassword)
        val file = "title,username,password\nПочта,me,секрет"

        repository.importCsv(file.byteInputStream())
        val writesAfterFirst = store.writes
        val second = repository.importCsv(file.byteInputStream())

        assertEquals(0, second.entries.size)
        assertEquals(1, second.skipped)
        assertEquals(1, repository.entries.size)
        // Nothing to add means nothing to write.
        assertEquals(writesAfterFirst, store.writes)
    }
}
