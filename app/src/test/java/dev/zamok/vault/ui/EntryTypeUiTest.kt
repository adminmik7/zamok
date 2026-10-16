package dev.zamok.vault.ui

import dev.zamok.vault.R
import dev.zamok.vault.model.EntryField
import dev.zamok.vault.model.EntryTypes
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * What a record type adds to the form, and what happens to those values when the record is saved.
 *
 * Boxes are identified by their label resource rather than by the text the user reads: that text is
 * what the entry stores, and comparing one resource to another is the part that can be checked
 * without a device.
 */
class EntryTypeUiTest {

    // ---- which boxes a type brings with it ----

    @Test
    fun `a card asks for its number, holder, expiry, cvv and pin`() {
        assertEquals(5, EntryTypeUi.specs(EntryTypes.CARD).size)
    }

    @Test
    fun `a passport asks for its own set`() {
        assertEquals(6, EntryTypeUi.specs(EntryTypes.PASSPORT).size)
    }

    @Test
    fun `records covered by the common fields ask for nothing extra`() {
        for (type in listOf(EntryTypes.PASSWORD, EntryTypes.NOTE)) {
            assertTrue("$type should add no boxes", EntryTypeUi.specs(type).isEmpty())
        }
    }

    @Test
    fun `a type this build has never heard of adds no boxes`() {
        assertTrue(EntryTypeUi.specs("drivers_licence").isEmpty())
    }

    @Test
    fun `a login is the only record asked for a login, a code and tags`() {
        val login = EntryTypeUi.commonFields(EntryTypes.PASSWORD)

        for (field in listOf(R.string.field_username, R.string.field_password, R.string.field_url, R.string.field_totp, R.string.field_tags, R.string.field_favorite)) {
            assertTrue("$field belongs on a login", field in login)
        }
    }

    @Test
    fun `a card, a passport and a note are not asked for the fields of a login`() {
        for (type in listOf(EntryTypes.CARD, EntryTypes.PASSPORT, EntryTypes.NOTE)) {
            assertTrue("$type should ask for no login fields", EntryTypeUi.commonFields(type).isEmpty())
        }
    }

    @Test
    fun `a type this build has never heard of is read as a login, fields and all`() {
        assertEquals(
            EntryTypeUi.commonFields(EntryTypes.PASSWORD),
            EntryTypeUi.commonFields("drivers_licence"),
        )
    }

    @Test
    fun `the old one-time code kind is read as a login, so its code is still there`() {
        assertEquals(EntryTypes.PASSWORD, EntryTypes.normalise("otp"))
        assertTrue(R.string.field_totp in EntryTypeUi.commonFields(EntryTypes.normalise("otp")))
    }

    @Test
    fun `a card number, a cvv and a pin are typed out of sight`() {
        val hidden = EntryTypeUi.specs(EntryTypes.CARD).filter { it.secret }

        assertEquals(3, hidden.size)
    }

    @Test
    fun `a cardholder and an expiry date are not hidden`() {
        val card = EntryTypeUi.specs(EntryTypes.CARD)

        assertFalse("the holder is not a secret", card[1].secret)
        assertFalse("the expiry is not a secret", card[2].secret)
    }

    @Test
    fun `no type asks for the same box twice`() {
        for (type in EntryTypes.all) {
            val labels = EntryTypeUi.specs(type).map { it.label }

            assertEquals("$type repeats a box", labels.size, labels.distinct().size)
        }
    }

    // ---- what actually gets stored ----

    @Test
    fun `stores what was typed`() {
        val stored = EntryTypeUi.fieldsToStore(
            labels = listOf("Номер", "CVV"),
            values = mapOf("Номер" to "4111", "CVV" to "123"),
            existing = emptyList(),
        )

        assertEquals(listOf(EntryField("Номер", "4111"), EntryField("CVV", "123")), stored)
    }

    @Test
    fun `leaves out the boxes that were left empty`() {
        val stored = EntryTypeUi.fieldsToStore(
            labels = listOf("Номер", "PIN"),
            values = mapOf("Номер" to "4111"),
            existing = emptyList(),
        )

        assertEquals(listOf("Номер"), stored.map { it.label })
    }

    @Test
    fun `keeps the fields of a type that was changed away from`() {
        val stored = EntryTypeUi.fieldsToStore(
            labels = listOf("Серия"),
            values = mapOf("Серия" to "1234"),
            existing = listOf(EntryField("Номер", "4111"), EntryField("CVV", "123")),
        )

        assertEquals(listOf("Серия", "Номер", "CVV"), stored.map { it.label })
    }

    @Test
    fun `a value typed over an old one wins`() {
        val stored = EntryTypeUi.fieldsToStore(
            labels = listOf("Номер"),
            values = mapOf("Номер" to "9999"),
            existing = listOf(EntryField("Номер", "4111")),
        )

        assertEquals(listOf(EntryField("Номер", "9999")), stored)
    }
}
