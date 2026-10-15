package dev.zamok.vault.ui

import dev.zamok.vault.data.VaultRepository
import dev.zamok.vault.data.VaultStore
import dev.zamok.vault.model.Entry
import java.io.File
import java.io.IOException
import java.util.concurrent.Executor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
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
    fun `an unreadable vault keeps the biometric copy`() {
        val first = controller()
        first.create(password)
        first.enableBiometricUnlock { it.copyOf() }
        first.lock()

        // The vault becomes unreadable: a directory where the file should be. The copy is still
        // good, only the vault cannot be read right now, so it must survive.
        File(temporaryFolder.root, "vault.zmk").delete()
        File(temporaryFolder.root, "vault.zmk").mkdirs()

        val second = controller()
        val failure = assertThrows(Exception::class.java) {
            second.unlockWithBiometrics { it.copyOf() }
        }

        assertTrue(failure is IOException)
        second.lock()
        assertTrue(second.state.biometricEnrolled)
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

    // ---- Biometric unlock ----
    //
    // The Keystore half is a device concern and is checked on a phone. What is checked here is the
    // bookkeeping around it: when a copy is kept, when it is thrown away, and what the screens are
    // told afterwards. The lambdas stand in for the Keystore cipher, which is why they are handed
    // the vault key and just hand it back.

    @Test
    fun `enrolling a biometric copy is reported to the screens`() {
        val controller = controller()
        controller.create(password)

        controller.enableBiometricUnlock { it.copyOf() }

        assertTrue(controller.state.biometricEnrolled)
    }

    @Test
    fun `a biometric unlock opens the vault`() {
        val first = controller()
        first.create(password)
        first.add(Entry(id = "", title = "Почта", password = "секрет"))
        first.enableBiometricUnlock { it.copyOf() }
        first.lock()

        val second = controller()
        assertTrue(second.state.biometricEnrolled)
        second.unlockWithBiometrics { it.copyOf() }

        assertTrue(second.state.unlocked)
        assertEquals("секрет", second.state.entries.single().password)
    }

    @Test
    fun `a copy that does not match the vault is refused and thrown away`() {
        val first = controller()
        first.create(password)
        first.enableBiometricUnlock { it.copyOf() }
        first.lock()

        val second = controller()
        // The Keystore hands back a key that is not this vault's.
        second.unlockWithBiometrics { ByteArray(32) { 9 } }

        assertEquals(VaultError.WRONG_PASSWORD_OR_DAMAGED, second.state.error)
        assertFalse(second.state.unlocked)
        // Dropped, so the screen stops offering an unlock that can only fail.
        assertFalse(second.state.biometricEnrolled)
    }

    @Test
    fun `a lost keystore key drops the copy and explains itself`() {
        val controller = controller()
        controller.create(password)
        controller.enableBiometricUnlock { it.copyOf() }

        controller.onBiometricKeyLost()

        assertEquals(VaultError.BIOMETRIC_LOST, controller.state.error)
        assertFalse(controller.state.biometricEnrolled)
    }

    @Test
    fun `forgetting biometrics leaves the vault reachable by password`() {
        val controller = controller()
        controller.create(password)
        controller.enableBiometricUnlock { it.copyOf() }

        controller.forgetBiometricUnlock()
        controller.lock()

        val second = controller()
        assertFalse(second.state.biometricEnrolled)
        second.unlock(password)
        assertTrue(second.state.unlocked)
    }

    @Test
    fun `creating a vault drops a leftover biometric copy`() {
        // A copy of the old vault's key must not survive into a vault that has a new key.
        val leftover = File(temporaryFolder.root, "vault.zmk.bio")
        leftover.writeBytes(ByteArray(64))
        val controller = controller()

        controller.create(password)

        assertFalse(controller.state.biometricEnrolled)
        assertFalse(leftover.exists())
    }
}
