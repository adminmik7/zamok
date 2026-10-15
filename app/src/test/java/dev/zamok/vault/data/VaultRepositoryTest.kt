package dev.zamok.vault.data

import dev.zamok.vault.crypto.VaultCryptoException
import dev.zamok.vault.crypto.VaultFile
import dev.zamok.vault.model.Entry
import java.io.File
import java.io.IOException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class VaultRepositoryTest {

    @get:Rule
    val temporaryFolder = TemporaryFolder()

    /**
     * Iteration count is deliberately tiny: these tests check behaviour, and the production count
     * would make every one of them take about a second.
     */
    private val iterations = 1_000

    private val password = "correct horse".toCharArray()

    private var clock = 1_000L

    /** A repository over the same file every time, which is how "reopen the app" is simulated. */
    private fun repository(name: String = "vault.zmk") = VaultRepository(
        store = VaultStore(File(temporaryFolder.root, name)),
        iterations = iterations,
        now = { clock },
    )

    @Test
    fun `a new vault starts empty and unlocked`() {
        val repository = repository()

        repository.create(password)

        assertTrue(repository.vaultExists())
        assertTrue(repository.isUnlocked)
        assertTrue(repository.entries.isEmpty())
    }

    @Test
    fun `refuses to overwrite an existing vault`() {
        repository().create(password)

        assertThrows(IllegalStateException::class.java) { repository().create(password) }
    }

    @Test
    fun `reopening sees what was stored`() {
        val first = repository()
        first.create(password)
        first.add(Entry(id = "", title = "Почта", username = "user", password = "секрет"))
        first.lock()

        val second = repository()
        second.unlock(password)

        val entry = second.entries.single()
        assertEquals("Почта", entry.title)
        assertEquals("секрет", entry.password)
    }

    @Test
    fun `a wrong password leaves the vault locked`() {
        repository().create(password)
        val repository = repository()

        assertThrows(VaultCryptoException::class.java) { repository.unlock("nope".toCharArray()) }

        assertFalse(repository.isUnlocked)
        assertTrue(repository.entries.isEmpty())
    }

    @Test
    fun `unlocking without a vault fails loudly`() {
        assertThrows(IOException::class.java) { repository().unlock(password) }
    }

    @Test
    fun `add assigns an id and timestamps of its own`() {
        val repository = repository()
        repository.create(password)

        val stored = repository.add(Entry(id = "mine", title = "A", createdAt = 5L, updatedAt = 5L))

        assertNotEquals("mine", stored.id)
        assertTrue(stored.id.isNotEmpty())
        assertEquals(1_000L, stored.createdAt)
        assertEquals(1_000L, stored.updatedAt)
    }

    @Test
    fun `two entries do not share an id`() {
        val repository = repository()
        repository.create(password)

        val first = repository.add(Entry(id = "", title = "A"))
        val second = repository.add(Entry(id = "", title = "B"))

        assertNotEquals(first.id, second.id)
        assertEquals(2, repository.entries.size)
    }

    @Test
    fun `update keeps createdAt and refreshes updatedAt`() {
        val repository = repository()
        repository.create(password)
        val stored = repository.add(Entry(id = "", title = "A"))
        clock = 5_000L

        val edited = repository.update(stored.copy(title = "B"))

        assertEquals(1_000L, edited.createdAt)
        assertEquals(5_000L, edited.updatedAt)
        assertEquals("B", repository.entries.single().title)
    }

    @Test
    fun `an edit survives a reopen`() {
        val first = repository()
        first.create(password)
        val stored = first.add(Entry(id = "", title = "A"))
        first.update(stored.copy(title = "B"))
        first.lock()

        val second = repository()
        second.unlock(password)

        assertEquals("B", second.entries.single().title)
    }

    @Test
    fun `update of an unknown id fails`() {
        val repository = repository()
        repository.create(password)

        assertThrows(IllegalArgumentException::class.java) {
            repository.update(Entry(id = "ghost", title = "A"))
        }
    }

    @Test
    fun `delete removes the entry and the change persists`() {
        val repository = repository()
        repository.create(password)
        val doomed = repository.add(Entry(id = "", title = "A"))
        repository.add(Entry(id = "", title = "B"))

        repository.delete(doomed.id)
        repository.lock()
        val reopened = repository()
        reopened.unlock(password)

        assertEquals(listOf("B"), reopened.entries.map { it.title })
    }

    @Test
    fun `delete of an unknown id fails`() {
        val repository = repository()
        repository.create(password)

        assertThrows(IllegalArgumentException::class.java) { repository.delete("ghost") }
    }

    @Test
    fun `mutations while locked fail`() {
        val repository = repository()

        assertThrows(IllegalStateException::class.java) { repository.add(Entry(id = "")) }
        assertThrows(IllegalStateException::class.java) { repository.update(Entry(id = "x")) }
        assertThrows(IllegalStateException::class.java) { repository.delete("x") }
    }

    @Test
    fun `lock clears the entries`() {
        val repository = repository()
        repository.create(password)
        repository.add(Entry(id = "", title = "A"))

        repository.lock()

        assertFalse(repository.isUnlocked)
        assertTrue(repository.entries.isEmpty())
    }

    @Test
    fun `changing the password keeps the entries and retires the old one`() {
        val repository = repository()
        repository.create(password)
        repository.add(Entry(id = "", title = "Почта"))

        repository.changePassword(password, "brand new".toCharArray())
        repository.lock()

        val reopened = repository()
        assertThrows(VaultCryptoException::class.java) { reopened.unlock(password) }
        reopened.unlock("brand new".toCharArray())
        assertEquals("Почта", reopened.entries.single().title)
    }

    @Test
    fun `the vault stays usable right after a password change`() {
        val repository = repository()
        repository.create(password)

        repository.changePassword(password, "brand new".toCharArray())
        val added = repository.add(Entry(id = "", title = "после смены"))

        assertTrue(repository.isUnlocked)
        assertEquals(added.id, repository.entries.single().id)
    }

    @Test
    fun `a wrong current password changes nothing`() {
        val repository = repository()
        repository.create(password)
        repository.add(Entry(id = "", title = "Почта"))

        assertThrows(VaultCryptoException::class.java) {
            repository.changePassword("wrong".toCharArray(), "brand new".toCharArray())
        }

        repository.lock()
        val reopened = repository()
        reopened.unlock(password)
        assertEquals("Почта", reopened.entries.single().title)
    }

    @Test
    fun `a failed write leaves the in-memory entries alone`() {
        val repository = repository()
        repository.create(password)
        // Put a directory where the vault file lives, so the atomic move has nowhere to land.
        val vaultPath = File(temporaryFolder.root, "vault.zmk")
        assertTrue(vaultPath.delete())
        assertTrue(vaultPath.mkdir())

        assertThrows(IOException::class.java) { repository.add(Entry(id = "", title = "A")) }

        assertTrue("a change that never reached disk must not appear", repository.entries.isEmpty())
    }

    // Guards the one number that silently weakens the vault if it is ever lowered.
    @Test
    fun `the default iteration count is at least the OWASP figure`() {
        assertTrue(
            "PBKDF2 below 600k would quietly weaken every vault",
            VaultFile.DEFAULT_ITERATIONS >= 600_000,
        )
    }
}
