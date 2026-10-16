package dev.zamok.vault.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.zamok.vault.R
import dev.zamok.vault.model.Entry
import dev.zamok.vault.model.EntryField

/**
 * The card as it looks in the hand, rather than as a row in a list.
 *
 * The name of the network comes from the number itself, so the card is never asked what it is and
 * the answer cannot go stale when the number is corrected. The number is drawn the way it is printed
 * on the plastic: dots for everything but the last four, which are what a person recognises a card
 * by anyway.
 */
@Composable
internal fun CardFace(
    entry: Entry,
    numberVisible: Boolean,
    onToggleNumber: () -> Unit,
    onChange: (Entry) -> Unit,
) {
    // Which of the card's own lines is being typed into, or none of them. The card is the only place
    // the number, the holder and the expiry are shown, so it is also the only place they are edited.
    var editing by remember { mutableStateOf(-1) }
    var typed by remember { mutableStateOf("") }
    val numberName = stringResource(R.string.field_card_number)
    val holderName = stringResource(R.string.field_card_holder)
    val expiryName = stringResource(R.string.field_card_expiry)
    val number = fieldValue(entry.fields, stringResource(R.string.field_card_number))
    val holder = fieldValue(entry.fields, stringResource(R.string.field_card_holder))
    val expiry = formatExpiry(fieldValue(entry.fields, stringResource(R.string.field_card_expiry)))
    val brand = brandOf(number)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                brush = Brush.linearGradient(CARD_GRADIENT),
                shape = RoundedCornerShape(16.dp),
            )
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (editing == SLOT_TITLE) {
                var name by remember { mutableStateOf(typed) }
                CardEditField(
                    value = name,
                    onValueChange = {
                        name = it
                        typed = it
                    },
                    onCommit = {
                        onChange(entry.copy(title = name))
                        editing = -1
                    },
                )
            } else {
                Text(
                    text = entry.title.ifBlank { stringResource(R.string.untitled) },
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier
                        .weight(1f)
                        .clickable {
                            typed = entry.title
                            editing = SLOT_TITLE
                        },
                )
            }
            if (brand != CardBrand.UNKNOWN) {
                Text(
                    text = brand.label,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                )
            }
        }
        Icon(
            imageVector = Icons.Filled.CreditCard,
            contentDescription = null,
            tint = Color.White.copy(alpha = 0.8f),
            modifier = Modifier.size(36.dp),
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (editing == SLOT_NUMBER) {
                CardEditField(
                    value = typed,
                    onValueChange = { typed = groupCardNumber(it) },
                    onCommit = {
                        onChange(entry.withField(R.string.field_card_number, groupCardNumber(typed)))
                        editing = -1
                    },
                )
            } else {
                Text(
                    text = if (numberVisible) groupCardNumber(number, brand) else maskCardNumber(number),
                    style = MaterialTheme.typography.bodyLarge,
                    color = Color.White,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier
                        .weight(1f)
                        .clickable {
                            typed = groupCardNumber(fieldValue(entry.fields, numberName))
                            editing = SLOT_NUMBER
                        },
                )
            }
            IconButton(onClick = onToggleNumber) {
                Icon(
                    imageVector = if (numberVisible) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                    contentDescription = stringResource(
                        if (numberVisible) R.string.hide_password else R.string.show_password
                    ),
                    tint = Color.White,
                )
            }
        }
        Row(verticalAlignment = Alignment.Bottom) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.field_card_holder),
                    style = MaterialTheme.typography.labelSmall,
                    color = Color.White.copy(alpha = 0.7f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (editing == SLOT_HOLDER) {
                    CardEditField(
                        value = typed,
                        onValueChange = { typed = it },
                        onCommit = {
                            onChange(entry.withField(R.string.field_card_holder, typed))
                            editing = -1
                        },
                    )
                } else {
                    Text(
                        text = holder.ifBlank { stringResource(R.string.field_empty) },
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.clickable {
                            typed = fieldValue(entry.fields, holderName)
                            editing = SLOT_HOLDER
                        },
                    )
                }
            }
            Column {
                Text(
                    text = stringResource(R.string.field_card_expiry),
                    style = MaterialTheme.typography.labelSmall,
                    color = Color.White.copy(alpha = 0.7f),
                )
                if (editing == SLOT_EXPIRY) {
                    CardEditField(
                        value = typed,
                        onValueChange = { typed = formatExpiry(it) },
                        onCommit = {
                            onChange(entry.withField(R.string.field_card_expiry, formatExpiry(typed)))
                            editing = -1
                        },
                    )
                } else {
                    Text(
                        text = expiry,
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White,
                        modifier = Modifier.clickable {
                            typed = formatExpiry(fieldValue(entry.fields, expiryName))
                            editing = SLOT_EXPIRY
                        },
                    )
                }
            }
        }
    }
}

private val CARD_GRADIENT = listOf(Color(0xFF2B5CB8), Color(0xFF6C8FE0))

/**
 * The two fields of a card that are not printed on it: the CVV and the PIN.
 *
 * The number, the holder and the expiry are on the card above and are not repeated here - the same
 * value said twice on one screen is read twice and has to be kept straight, which is exactly what
 * a screen like this should not ask of a person.
 */
@Composable
internal fun CardDetails(entry: Entry, onChange: (Entry) -> Unit) {
    CardField(entry = entry, label = R.string.field_card_cvv, secret = true) { value ->
        onChange(entry.withField(R.string.field_card_cvv, value))
    }
    CardField(entry = entry, label = R.string.field_card_pin, secret = true) { value ->
        onChange(entry.withField(R.string.field_card_pin, value))
    }
}

/**
 * One field of a card, shown hidden, opened by an eye, and typed into where it is shown.
 *
 * A value that is left empty is dropped rather than stored: a card with an empty CVV box in it is
 * noise in the file, and a CVV that was there can be typed again in a second.
 */
@Composable
private fun CardField(
    entry: Entry,
    label: Int,
    secret: Boolean,
    format: (String) -> String = { it },
    onCommit: (String) -> Unit,
) {
    val name = stringResource(label)
    val stored = fieldValue(entry.fields, name)
    var visible by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf(false) }
    var typed by remember(stored, editing) { mutableStateOf(stored) }

    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Text(
            text = name,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (editing) {
            OutlinedTextField(
                value = typed,
                onValueChange = { typed = format(it) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                TextButton(onClick = {
                    onCommit(typed)
                    editing = false
                }) { Text(stringResource(R.string.save)) }
            }
        } else {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = when {
                        stored.isEmpty() -> stringResource(R.string.field_empty)
                        secret && !visible -> "•".repeat(stored.length)
                        else -> format(stored)
                    },
                    style = MaterialTheme.typography.bodyLarge,
                    color = if (stored.isEmpty()) {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    } else {
                        MaterialTheme.colorScheme.onSurface
                    },
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f).clickable {
                        typed = stored
                        editing = true
                    },
                )
                if (secret) {
                    IconButton(onClick = { visible = !visible }) {
                        Icon(
                            imageVector = if (visible) {
                                Icons.Filled.VisibilityOff
                            } else {
                                Icons.Filled.Visibility
                            },
                            contentDescription = stringResource(
                                if (visible) R.string.hide_password else R.string.show_password
                            ),
                        )
                    }
                }
            }
        }
    }
    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
}

/**
 * The record with one of its own fields replaced, matched on the label the field is stored under.
 *
 * Matched by name rather than by position, because a field imported from another program keeps
 * whatever it was called there and a card that lost its CVV must not have its expiry written over.
 */
private fun Entry.withField(labelRes: Int, value: String): Entry {
    val name = FieldLabels.nameOf(labelRes)
    val index = fields.indexOfFirst { it.label.equals(name, ignoreCase = true) }
    val updated = fields.toMutableList()
    if (index >= 0) {
        if (value.isBlank()) updated.removeAt(index) else updated[index] = fields[index].copy(value = value)
    } else if (value.isNotBlank()) {
        updated.add(EntryField(name, value))
    }
    return copy(fields = updated)
}

/**
 * The stored name of each of the record's own fields.
 *
 * A map rather than reading the resources: the entry keeps the text, and the code needs to know what
 * that text is without a composition to read it in.
 */
internal object FieldLabels {
    fun nameOf(labelRes: Int): String = when (labelRes) {
        R.string.field_card_number -> "Номер"
        R.string.field_card_holder -> "Владелец"
        R.string.field_card_expiry -> "Срок действия"
        R.string.field_card_cvv -> "CVV"
        R.string.field_card_pin -> "PIN"
        R.string.field_passport_series -> "Серия"
        R.string.field_passport_number -> "Номер"
        R.string.field_passport_issued_by -> "Кем выдан"
        R.string.field_passport_issued_on -> "Дата выдачи"
        R.string.field_passport_department_code -> "Код подразделения"
        R.string.field_passport_valid_until -> "Действителен до"
        else -> ""
    }
}

private const val SLOT_NUMBER = 0
private const val SLOT_HOLDER = 1
private const val SLOT_EXPIRY = 2
private const val SLOT_TITLE = 3

/**
 * A line of the card being typed into, drawn as plain white text on the card itself.
 *
 * No box around it: a field with a border on a card is not something a card has, and the line it
 * replaces is the only sign that the card can be written on.
 */
@Composable
private fun CardEditField(
    value: String,
    onValueChange: (String) -> Unit,
    onCommit: () -> Unit,
) {
    androidx.compose.foundation.text.BasicTextField(
        value = value,
        onValueChange = onValueChange,
        singleLine = true,
        textStyle = MaterialTheme.typography.bodyLarge.copy(color = Color.White),
        cursorBrush = SolidColor(Color.White),
        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
            keyboardType = androidx.compose.ui.text.input.KeyboardType.Number,
            imeAction = androidx.compose.ui.text.input.ImeAction.Done,
        ),
        keyboardActions = androidx.compose.foundation.text.KeyboardActions(
            onDone = { onCommit() },
        ),
        modifier = Modifier.fillMaxWidth(),
    )
}
