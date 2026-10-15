package dev.zamok.vault.ui

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Create
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.ui.graphics.vector.ImageVector
import dev.zamok.vault.R
import dev.zamok.vault.model.EntryTypes

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
        EntryTypes.ONE_TIME_CODE -> Icons.Filled.Refresh
        EntryTypes.CARD -> Icons.Filled.ShoppingCart
        EntryTypes.NOTE -> Icons.Filled.Create
        EntryTypes.PASSPORT -> Icons.Filled.Person
        else -> Icons.Filled.Lock
    }
}
