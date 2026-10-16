package dev.zamok.vault.ui

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Badge
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Timer
import androidx.compose.ui.graphics.vector.ImageVector
import dev.zamok.vault.R
import dev.zamok.vault.model.EntryField
import dev.zamok.vault.model.EntryTypes

/**
 * A box a record of a given type brings with it, and whether its value is hidden while typing.
 *
 * The label is a resource rather than text because the resolved text is what the entry stores, and
 * two records of one type have to agree on it for their values to line up. [secret] is a property of
 * the box, not of the value: a card number belongs off the screen, a cardholder's name does not.
 */
internal data class FieldSpec(val label: Int, val secret: Boolean = false)

/**
 * How a record type looks: its name and its icon.
 *
 * Icons come from the platform set rather than being pictures of the services themselves: those are
 * other people's trademarks, and fetching one per entry would mean asking the network about every
 * record in the vault — which this app never does.
 *
 * Kept apart from [EntryList] on purpose: that object is pure logic and gets exercised in unit
 * tests, and pulling Compose icons into it would drag them in there too.
 */
internal object EntryTypeUi {

    fun label(id: String): Int = when (EntryTypes.normalise(id)) {
        EntryTypes.ONE_TIME_CODE -> R.string.type_otp
        EntryTypes.CARD -> R.string.type_card
        EntryTypes.NOTE -> R.string.type_note
        EntryTypes.PASSPORT -> R.string.type_passport
        else -> R.string.type_password
    }

    fun icon(id: String): ImageVector = when (EntryTypes.normalise(id)) {
        EntryTypes.ONE_TIME_CODE -> Icons.Filled.Timer
        EntryTypes.CARD -> Icons.Filled.CreditCard
        EntryTypes.NOTE -> Icons.Filled.Description
        EntryTypes.PASSPORT -> Icons.Filled.Badge
        else -> Icons.Filled.Lock
    }

    /**
     * The boxes a record of [id] fills in on top of the fields every record has.
     *
     * Only cards and passports so far: a login and a note are covered by the fields every record
     * already has, and inventing boxes for them would be asking for something nobody needs.
     */
    fun specs(id: String): List<FieldSpec> = when (EntryTypes.normalise(id)) {
        EntryTypes.CARD -> listOf(
            FieldSpec(R.string.field_card_number, secret = true),
            FieldSpec(R.string.field_card_holder),
            FieldSpec(R.string.field_card_expiry),
            FieldSpec(R.string.field_card_cvv, secret = true),
            FieldSpec(R.string.field_card_pin, secret = true),
        )
        EntryTypes.PASSPORT -> listOf(
            FieldSpec(R.string.field_passport_series, secret = true),
            FieldSpec(R.string.field_passport_number, secret = true),
            FieldSpec(R.string.field_passport_issued_by),
            FieldSpec(R.string.field_passport_issued_on),
            FieldSpec(R.string.field_passport_department_code),
            FieldSpec(R.string.field_passport_valid_until),
        )
        else -> emptyList()
    }

    /**
     * What to store on a record of this type: its own boxes, then anything it already carried under a
     * label this type does not have.
     *
     * The second half is the point. Changing a record's type must not silently throw away the fields
     * of the old one — there is no undo in this app and the user never asked for that. Empty values
     * are dropped, so a card that never got a PIN does not carry a blank box forever.
     */
    fun fieldsToStore(
        labels: List<String>,
        values: Map<String, String>,
        existing: List<EntryField>,
    ): List<EntryField> =
        labels.map { EntryField(it, values[it].orEmpty().trim()) }.filter { it.value.isNotEmpty() } +
            existing.filter { it.value.isNotBlank() && it.label !in labels }
}
