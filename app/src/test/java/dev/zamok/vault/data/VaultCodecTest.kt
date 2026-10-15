package dev.zamok.vault.data

import dev.zamok.vault.model.Entry
import dev.zamok.vault.model.EntryField
import dev.zamok.vault.model.Vault
import kotlinx.serialization.SerializationException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class VaultCodecTest {

    // Quotes, backslashes and line breaks in every text field: JSON escaping is where this breaks.
    private val entry = Entry(
        id = "1",
        title = "Почта \"рабочая\"",
        username = "user@example.com",
        password = """p@ss"word\{}""",
        url = "https://example.com",
        notes = "первая строка\nвторая",
        category = "Работа",
        tags = listOf("важное", "личное"),
        totpSecret = "JBSWY3DPEHPK3PXP",
        favorite = true,
        createdAt = 1_700_000_000_000L,
        updatedAt = 1_700_000_001_000L,
    )

    @Test
    fun `round trips every field`() {
        val vault = Vault(listOf(entry))

        assertEquals(vault, VaultCodec.decode(VaultCodec.encode(vault)))
    }

    @Test
    fun `round trips an empty vault`() {
        assertEquals(Vault(), VaultCodec.decode(VaultCodec.encode(Vault())))
    }

    @Test
    fun `keeps the order of entries`() {
        val vault = Vault(listOf(entry.copy(id = "a"), entry.copy(id = "b"), entry.copy(id = "c")))

        val ids = VaultCodec.decode(VaultCodec.encode(vault)).entries.map { it.id }

        assertEquals(listOf("a", "b", "c"), ids)
    }

    @Test
    fun `reads past fields written by a newer version`() {
        val text = """{"entries":[{"id":"1","title":"A","somethingNew":42}],"settings":{}}"""

        assertEquals("A", VaultCodec.decode(text.toByteArray()).entries.single().title)
    }

    @Test
    fun `fills in fields an older version did not write`() {
        val decoded = VaultCodec.decode("""{"entries":[{"id":"1"}]}""".toByteArray()).entries.single()

        assertEquals("", decoded.title)
        assertFalse(decoded.favorite)
        assertTrue(decoded.tags.isEmpty())
    }

    @Test
    fun `round trips a record's own fields`() {
        val withFields = entry.copy(
            fields = listOf(
                EntryField("Номер", "4111 1111 1111 1111"),
                EntryField("CVV", "123"),
            )
        )

        val decoded = VaultCodec.decode(VaultCodec.encode(Vault(listOf(withFields)))).entries.single()

        assertEquals(2, decoded.fields.size)
        assertEquals("4111 1111 1111 1111", decoded.fields.first().value)
    }

    @Test
    fun `reads a record written before fields existed`() {
        val decoded = VaultCodec.decode("""{"entries":[{"id":"1"}]}""".toByteArray()).entries.single()

        assertTrue(decoded.fields.isEmpty())
    }

    @Test
    fun `refuses bytes that are not vault json`() {
        assertThrows(SerializationException::class.java) {
            VaultCodec.decode("not json at all".toByteArray())
        }
    }

    @Test
    fun `refuses an entry with no id`() {
        assertThrows(SerializationException::class.java) {
            VaultCodec.decode("""{"entries":[{"title":"A"}]}""".toByteArray())
        }
    }
}
