package dev.zamok.vault.ui

import dev.zamok.vault.data.VaultRepository
import dev.zamok.vault.data.VaultStore
import dev.zamok.vault.model.Entry
import java.io.File
import java.util.concurrent.Executor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * Drives the controller with a synchronous executor, so the UI logic — what the screens would
 * actually show — is checked without a device or an emulator.
 */
class VaultControllerTest {

    @get:Rule
    val temporaryFolder = TemporaryFolder()

    private val immediate = Executor { it.run() }
    private val password = "master password"

    private fun controller(name: String = "vault.zmk"): VaultController {
        val repository = VaultRepository(
            store = VaultStore(File(temporaryFolder.root, name)),
            iterations = 1_000,
            now = { 1_000L },
        )
        return VaultController(repository, immediate, immediate)
    }

    @Test
    fun `starts locked with no vault`() {
        val controller = controller()

        assertFalse(controller.state.unlocked)
        assertFalse(controller.state.vaultExists)
        assertNull(controller.state.error)
    }

    @Test
    fun `creating unlocks and reports the vault as present`() {
        val controller = controller()

        controller.create(password)

        assertTrue(controller.state.unlocked)
        assertTrue(controller.state.vaultExists)
        assertFalse(controller.state.busy)
        assertTrue(controller.state.entries.isEmpty())
    }

    @Test
    fun `a short master password is refused with its own message`() {
        val controller = controller()

        controller.create("short")

        assertEquals(VaultError.PASSWORD_TOO_SHORT, controller.state.error)
        assertFalse(controller.state.unlocked)
        // Nothing was written, so the screen still offers to create a vault.
        assertFalse(controller.state.vaultExists)
    }

    @Test
    fun `a wrong password is reported and leaves the vault locked`() {
        controller().create(password)
        val controller = controller()

        controller.unlock("wrong password")

        assertEquals(VaultError.WRONG_PASSWORD_OR_DAMAGED, controller.state.error)
        assertFalse(controller.state.unlocked)
        assertTrue(controller.state.entries.isEmpty())
    }

    @Test
    fun `unlocking an absent vault is reported as a storage failure`() {
        val controller = controller()

        controller.unlock(password)

        assertEquals(VaultError.STORAGE, controller.state.error)
    }

    @Test
    fun `an added entry shows up`() {
        val controller = controller()
        controller.create(password)

        controller.add(Entry(id = "", title = "Почта", username = "user"))

        assertEquals("Почта", controller.state.entries.single().title)
    }

    @Test
    fun `an edited entry replaces the original`() {
        val controller = controller()
        controller.create(password)
        controller.add(Entry(id = "", title = "A"))

        controller.update(controller.state.entries.single().copy(title = "B"))

        assertEquals(listOf("B"), controller.state.entries.map { it.title })
    }

    @Test
    fun `a deleted entry disappears`() {
        val controller = controller()
        controller.create(password)
        controller.add(Entry(id = "", title = "A"))
        val id = controller.state.entries.single().id

        controller.delete(id)

        assertTrue(controller.state.entries.isEmpty())
    }

    @Test
    fun `locking clears the entries and the error`() {
        val controller = controller()
        controller.create(password)
        controller.add(Entry(id = "", title = "A"))

        controller.lock()

        assertFalse(controller.state.unlocked)
        assertTrue(controller.state.entries.isEmpty())
        assertNull(controller.state.error)
    }

    @Test
    fun `an error can be dismissed`() {
        val controller = controller()
        controller.unlock("wrong password")
        assertEquals(VaultError.STORAGE, controller.state.error)

        controller.dismissError()

        assertNull(controller.state.error)
    }

    @Test
    fun `reopening sees what was stored`() {
        val first = controller()
        first.create(password)
        first.add(Entry(id = "", title = "Почта", password = "секрет"))
        first.lock()

        val second = controller()
        second.unlock(password)

        assertEquals("секрет", second.state.entries.single().password)
    }
}
