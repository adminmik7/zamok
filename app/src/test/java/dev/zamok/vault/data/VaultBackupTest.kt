package dev.zamok.vault.data

import dev.zamok.vault.crypto.VaultCryptoException
import dev.zamok.vault.crypto.VaultFile
import dev.zamok.vault.model.Entry
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * Export and restore, where the cost of being wrong is every password at once.
 *
 * Most of these tests are about what a *failed* restore must not do, which is why almost every one
 * of them ends by checking that the vault on disk is still exactly what it was.
 */
class VaultBackupTest {

    @get:Rule
    val temporaryFolder = TemporaryFolder()

    /** See [VaultRepositoryTest] for why the real iteration count is useless in a unit test. */
    private val iterations = 1_000

    private val password = "correct horse".toCharArray()
    private val otherPassword = "battery staple".toCharArray()

    private fun repository(name: String = "vault.zmk", dropBiometricKey: () -> Unit = {}) =
        VaultRepository(
            store = VaultStore(File(temporaryFolder.root, name)),
            iterations = iterations,
            now = { 1_000L },
            dropBiometricKey = dropBiometricKey,
        )

    private fun vaultFile(name: String = "vault.zmk") = File(temporaryFolder.root, name)

    private fun VaultRepository.export(): ByteArray =
        ByteArrayOutputStream().also { exportTo(it) }.toByteArray()

    @Test
    fun `an export is the vault file itself`() {
        val repository = repository()
        repository.create(password)
        repository.add(Entry(id = "", title = "Почта", password = "секрет"))

        val exported = repository.export()

        assertArrayEquals(vaultFile().readBytes(), exported)
        // And it really is a vault: not just any bytes that happen to match the file.
        assertTrue(VaultFile.parse(exported).unlock(password).also { it.close() }.iterations > 0)
    }

    @Test
    fun `an export works while the vault is locked`() {
        // Deliberate: a backup is worth being able to take without typing the password, and the
        // bytes are ciphertext either way.
        val repository = repository()
        repository.create(password)
        repository.lock()

        assertEquals(vaultFile().readBytes().size, repository.export().size)
    }

    @Test
    fun `a restore replaces the vault with the backup`() {
        val source = repository("a.zmk")
        source.create(password)
        source.add(Entry(id = "", title = "Почта", username = "me"))

        val target = repository("b.zmk")
        target.create(otherPassword)
        target.add(Entry(id = "", title = "Что-то другое"))

        target.restore(ByteArrayInputStream(source.export()), password)

        assertEquals(listOf("Почта"), target.entries.map { it.title })
        assertTrue(target.isUnlocked)
        // The vault now belongs to the backup, password included.
        val reopened = repository("b.zmk")
        reopened.unlock(password)
        assertEquals(listOf("Почта"), reopened.entries.map { it.title })
    }

    @Test
    fun `a restore keeps the ids and timestamps of the backup`() {
        val source = repository("a.zmk")
        source.create(password)
        val stored = source.add(Entry(id = "", title = "Почта"))

        val target = repository("b.zmk")
        target.create(otherPassword)
        target.restore(ByteArrayInputStream(source.export()), password)

        val restored = target.entries.single()
        assertEquals(stored.id, restored.id)
        assertEquals(stored.createdAt, restored.createdAt)
        assertEquals(stored.updatedAt, restored.updatedAt)
    }

    @Test
    fun `a file that is not a vault leaves the vault alone`() {
        val target = repository("b.zmk")
        target.create(otherPassword)
        target.add(Entry(id = "", title = "Что-то другое"))
        val before = vaultFile("b.zmk").readBytes()

        assertThrows(VaultCryptoException::class.java) {
            target.restore(ByteArrayInputStream(byteArrayOf(1, 2, 3)), otherPassword)
        }

        assertArrayEquals(before, vaultFile("b.zmk").readBytes())
        val reopened = repository("b.zmk")
        reopened.unlock(otherPassword)
        assertEquals(listOf("Что-то другое"), reopened.entries.map { it.title })
    }

    @Test
    fun `a backup opened with the wrong password leaves the vault alone`() {
        val source = repository("a.zmk")
        source.create(password)
        source.add(Entry(id = "", title = "Почта"))

        val target = repository("b.zmk")
        target.create(otherPassword)
        target.add(Entry(id = "", title = "Что-то другое"))
        val before = vaultFile("b.zmk").readBytes()

        assertThrows(VaultCryptoException::class.java) {
            target.restore(ByteArrayInputStream(source.export()), otherPassword)
        }

        assertArrayEquals(before, vaultFile("b.zmk").readBytes())
        val reopened = repository("b.zmk")
        reopened.unlock(otherPassword)
        assertEquals(listOf("Что-то другое"), reopened.entries.map { it.title })
    }

    @Test
    fun `a truncated backup leaves the vault alone`() {
        val source = repository("a.zmk")
        source.create(password)
        val half = source.export().let { it.copyOf(it.size / 2) }

        val target = repository("b.zmk")
        target.create(otherPassword)
        val before = vaultFile("b.zmk").readBytes()

        assertThrows(VaultCryptoException::class.java) {
            target.restore(ByteArrayInputStream(half), password)
        }

        assertArrayEquals(before, vaultFile("b.zmk").readBytes())
        assertTrue("the open vault must survive a failed restore", target.isUnlocked)
    }

    @Test
    fun `a restore drops the biometric copy of the vault it replaced`() {
        val source = repository("a.zmk")
        source.create(password)

        var droppedKeys = 0
        val target = repository("b.zmk", dropBiometricKey = { droppedKeys++ })
        target.create(otherPassword)
        target.enableBiometricUnlock { byteArrayOf(1, 2, 3) }
        val biometricCopy = File(temporaryFolder.root, "b.zmk.bio")
        assertTrue(biometricCopy.exists())
        assertTrue(target.biometricUnlockEnrolled())

        // Counted as a delta: create() already dropped a key of its own, and the number of drops
        // before this point is not what is under test.
        val droppedBefore = droppedKeys
        target.restore(ByteArrayInputStream(source.export()), password)

        // The restored vault has its own vault key, so a copy sealed under the old one is not just
        // useless, it is a button on the lock screen that can never work.
        assertFalse(biometricCopy.exists())
        assertFalse(target.biometricUnlockEnrolled())
        assertEquals(droppedBefore + 1, droppedKeys)
        // And the restored vault is open, with the enrolment gone rather than merely hidden.
        assertTrue(target.isUnlocked)
    }
}
