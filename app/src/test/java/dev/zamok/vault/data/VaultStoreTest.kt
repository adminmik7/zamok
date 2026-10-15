package dev.zamok.vault.data

import java.io.File
import java.io.IOException
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class VaultStoreTest {

    @get:Rule
    val temporaryFolder = TemporaryFolder()

    private fun storeAt(relativePath: String = "vault.zmk") =
        VaultStore(File(temporaryFolder.root, relativePath))

    @Test
    fun `reports no vault before one is written`() {
        assertFalse(storeAt().exists())
    }

    @Test
    fun `reads back exactly what was written`() {
        val store = storeAt()
        val bytes = "не секрет".toByteArray()

        store.write(bytes)

        assertTrue(store.exists())
        assertArrayEquals(bytes, store.read())
    }

    @Test
    fun `a second write replaces the first`() {
        val store = storeAt()
        store.write(byteArrayOf(1, 2, 3))

        store.write(byteArrayOf(9))

        assertArrayEquals(byteArrayOf(9), store.read())
    }

    @Test
    fun `reading a vault that was never created fails loudly`() {
        assertThrows(IOException::class.java) { storeAt().read() }
    }

    @Test
    fun `creates the directory when it is missing`() {
        val nested = storeAt("a/b/vault.zmk")

        nested.write(byteArrayOf(7))

        assertArrayEquals(byteArrayOf(7), nested.read())
    }

    @Test
    fun `leaves no temporary file behind`() {
        val store = storeAt()

        store.write(byteArrayOf(1, 2))

        val leftovers = temporaryFolder.root.listFiles().orEmpty().map { it.name }.filter { it.endsWith(".tmp") }
        assertTrue("temporary files left behind: $leftovers", leftovers.isEmpty())
    }

    @Test
    fun `keeps a large payload intact`() {
        val store = storeAt()
        val bytes = ByteArray(512 * 1024) { (it % 251).toByte() }

        store.write(bytes)

        assertArrayEquals(bytes, store.read())
    }
}
