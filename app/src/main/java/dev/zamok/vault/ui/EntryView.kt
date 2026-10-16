package dev.zamok.vault.ui

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.zamok.vault.R
import dev.zamok.vault.model.Entry
import dev.zamok.vault.model.EntryField

/**
 * One record, read at a glance and changed in place.
 *
 * The big fields - the name, the login, the password - are edited where they are shown, because that
 * is where they are looked for: a password manager is a screen people read rather than fill in, and
 * the few things worth changing are worth changing without walking through a form to reach. Every
 * change is handed straight to the vault, which writes the file; there is no save button to forget.
 *
 * Everything else - the address, the two-factor key, tags, notes, the category and the fields of a
 * card or a passport - is behind the pencil, in the full form. The pencil is there because those
 * fields are set once and read rarely, and putting them here would bury the three that matter.
 *
 * A field that is not shown is not erased: the value stays in the entry and comes back if the
 * record is edited there.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun EntryView(
    entry: Entry,
    onChange: (Entry) -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    var passwordVisible by remember { mutableStateOf(false) }
    var menuOpen by remember { mutableStateOf(false) }
    var editingField by remember { mutableStateOf(-1) }

    fun change(transform: (Entry) -> Entry) = onChange(transform(entry))

    Scaffold(
        topBar = {
            TopAppBar(
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, stringResource(R.string.back))
                    }
                },
                title = { },
                actions = {
                    IconButton(onClick = onEdit) {
                        Icon(Icons.Filled.Edit, stringResource(R.string.cd_full_edit))
                    }
                    IconButton(
                        onClick = { change { it.copy(favorite = !it.favorite) } },
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Star,
                            contentDescription = stringResource(R.string.cd_favorite_mark),
                            tint = if (entry.favorite) {
                                MaterialTheme.colorScheme.tertiary
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                        )
                    }
                    IconButton(
                        onClick = {
                            context.copyToClipboard(
                                listOf(entry.username, entry.password).filter { it.isNotEmpty() }
                                    .joinToString("\n")
                            )
                            Toast.makeText(
                                context,
                                context.getString(R.string.copied_login_and_password),
                                Toast.LENGTH_SHORT,
                            ).show()
                        },
                    ) {
                        Icon(Icons.Filled.ContentCopy, stringResource(R.string.cd_copy_login))
                    }
                    Box {
                        IconButton(onClick = { menuOpen = true }) {
                            Icon(Icons.Filled.MoreVert, stringResource(R.string.menu_more))
                        }
                        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                            DropdownMenuItem(
                                text = { Text(stringResource(R.string.delete)) },
                                onClick = {
                                    menuOpen = false
                                    onDelete()
                                },
                            )
                        }
                    }
                },
            )
        },
        floatingActionButton = {
            androidx.compose.material3.FloatingActionButton(onClick = onEdit) {
                Icon(Icons.Filled.Edit, stringResource(R.string.cd_full_edit))
            }
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .border(
                        width = 2.dp,
                        color = MaterialTheme.colorScheme.primary,
                        shape = RoundedCornerShape(16.dp),
                    )
                    .padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                EntryAvatar(entry)
                InlineValue(
                    value = entry.title,
                    placeholder = stringResource(R.string.field_title),
                    editing = editingField == TITLE,
                    onStartEditing = { editingField = TITLE },
                    onStopEditing = { editingField = -1 },
                    onCommit = { typed -> change { it.copy(title = typed) } },
                    style = MaterialTheme.typography.headlineSmall,
                    weight = FontWeight.Bold,
                )
                if (entry.username.isNotEmpty()) {
                    InlineValue(
                        value = entry.username,
                        placeholder = stringResource(R.string.field_username),
                        editing = editingField == USERNAME,
                        onStartEditing = { editingField = USERNAME },
                        onStopEditing = { editingField = -1 },
                        onCommit = { typed -> change { it.copy(username = typed) } },
                        style = MaterialTheme.typography.bodyLarge,
                    )
                }
                if (entry.password.isNotEmpty()) {
                    InlineSecret(
                        value = entry.password,
                        visible = passwordVisible,
                        editing = editingField == PASSWORD,
                        onToggleVisible = { passwordVisible = !passwordVisible },
                        onStartEditing = { editingField = PASSWORD },
                        onStopEditing = { editingField = -1 },
                        onCommit = { typed -> change { it.copy(password = typed) } },
                    )
                }
                for ((index, field) in entry.fields.withIndex()) {
                    CustomFieldRow(
                        field = field,
                        editing = editingField == FIELD_BASE + index,
                        onStartEditing = { editingField = FIELD_BASE + index },
                        onStopEditing = { editingField = -1 },
                        onCommit = { label, value ->
                            change { entry ->
                                entry.copy(
                                    fields = entry.fields.toMutableList().also { list ->
                                        list[index] = field.copy(label = label, value = value)
                                    },
                                )
                            }
                        },
                    )
                }
            }

            TextButton(
                onClick = { change { it.copy(fields = it.fields + EntryField("", "")) } },
            ) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Text(stringResource(R.string.add_field), Modifier.padding(start = 8.dp))
            }

            HorizontalDivider()

            if (entry.username.isNotEmpty()) {
                DetailRow(stringResource(R.string.field_username), entry.username)
            }
            if (entry.password.isNotEmpty()) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = stringResource(R.string.field_password),
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            text = if (passwordVisible) entry.password else EntryList.PASSWORD_MASK,
                            style = MaterialTheme.typography.bodyLarge,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    StrengthBadge(strengthOf(entry))
                    IconButton(onClick = { passwordVisible = !passwordVisible }) {
                        Icon(
                            imageVector = if (passwordVisible) {
                                Icons.Filled.VisibilityOff
                            } else {
                                Icons.Filled.Visibility
                            },
                            contentDescription = stringResource(
                                if (passwordVisible) R.string.hide_password else R.string.show_password
                            ),
                        )
                    }
                }
                HorizontalDivider()
            }

            Column(modifier = Modifier.fillMaxWidth().padding(top = 12.dp)) {
                formatStamp(entry.updatedAt).takeIf { it.isNotEmpty() }?.let {
                    Text(
                        text = stringResource(R.string.changed_at, it),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                formatStamp(entry.createdAt).takeIf { it.isNotEmpty() }?.let {
                    Text(
                        text = stringResource(R.string.created_at, it),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

private const val TITLE = 0
private const val USERNAME = 1
private const val PASSWORD = 2
private const val FIELD_BASE = 10

/**
 * A line of the card that turns into a text field when it is touched.
 *
 * The value is kept aside while the field is open and handed over when it closes, so the vault is
 * written once per edit rather than once per keystroke.
 */
@Composable
private fun InlineValue(
    value: String,
    placeholder: String,
    editing: Boolean,
    onStartEditing: () -> Unit,
    onStopEditing: () -> Unit,
    onCommit: (String) -> Unit,
    style: androidx.compose.ui.text.TextStyle,
    weight: FontWeight? = null,
) {
    var typed by remember(value, editing) { mutableStateOf(value) }
    if (editing) {
        androidx.compose.material3.OutlinedTextField(
            value = typed,
            onValueChange = { typed = it },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            TextButton(onClick = {
                onCommit(typed)
                onStopEditing()
            }) { Text(stringResource(R.string.save)) }
        }
    } else {
        Text(
            text = value.ifBlank { placeholder },
            style = style,
            fontWeight = weight,
            color = if (value.isBlank()) {
                MaterialTheme.colorScheme.onSurfaceVariant
            } else {
                MaterialTheme.colorScheme.onSurface
            },
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.fillMaxWidth().clickable(onClick = onStartEditing),
        )
    }
}

/** The password in the card: dots until asked otherwise, editable on a touch. */
@Composable
private fun InlineSecret(
    value: String,
    visible: Boolean,
    editing: Boolean,
    onToggleVisible: () -> Unit,
    onStartEditing: () -> Unit,
    onStopEditing: () -> Unit,
    onCommit: (String) -> Unit,
) {
    var typed by remember(value, editing) { mutableStateOf(value) }
    Row(
        modifier = Modifier.fillMaxWidth().clickable(enabled = !editing, onClick = onStartEditing),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (editing) {
            androidx.compose.material3.OutlinedTextField(
                value = typed,
                onValueChange = { typed = it },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                modifier = Modifier.weight(1f),
            )
            TextButton(onClick = {
                onCommit(typed)
                onStopEditing()
            }) { Text(stringResource(R.string.save)) }
        } else {
            Text(
                text = if (visible) value else EntryList.PASSWORD_MASK,
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
        }
        IconButton(onClick = onToggleVisible) {
            Icon(
                imageVector = if (visible) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                contentDescription = stringResource(
                    if (visible) R.string.hide_password else R.string.show_password
                ),
            )
        }
    }
}

/** A field of the record's own, with its name, both editable on a touch. */
@Composable
private fun CustomFieldRow(
    field: EntryField,
    editing: Boolean,
    onStartEditing: () -> Unit,
    onStopEditing: () -> Unit,
    onCommit: (String, String) -> Unit,
) {
    var label by remember(field, editing) { mutableStateOf(field.label) }
    var value by remember(field, editing) { mutableStateOf(field.value) }
    if (editing) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            androidx.compose.material3.OutlinedTextField(
                value = label,
                onValueChange = { label = it },
                singleLine = true,
                label = { Text(stringResource(R.string.field_name)) },
                modifier = Modifier.weight(1f),
            )
            androidx.compose.material3.OutlinedTextField(
                value = value,
                onValueChange = { value = it },
                singleLine = true,
                label = { Text(stringResource(R.string.field_value)) },
                modifier = Modifier.weight(1f),
            )
            TextButton(onClick = {
                onCommit(label, value)
                onStopEditing()
            }) { Text(stringResource(R.string.save)) }
        }
    } else {
        Column(
            modifier = Modifier.fillMaxWidth().clickable(onClick = onStartEditing),
        ) {
            Text(
                text = field.label.ifBlank { stringResource(R.string.field_unnamed) },
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = field.value.ifBlank { stringResource(R.string.field_empty) },
                style = MaterialTheme.typography.bodyLarge,
                color = if (field.value.isBlank()) {
                    MaterialTheme.colorScheme.onSurfaceVariant
                } else {
                    MaterialTheme.colorScheme.onSurface
                },
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun DetailRow(label: String, value: String) {
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(text = value, style = MaterialTheme.typography.bodyLarge, maxLines = 3)
    }
}

/**
 * The mark under the password.
 *
 * A pill rather than a line of text: it says how the password is without asking the eye to read it,
 * and the three marks are told apart by colour and by a word for anyone who cannot.
 */
@Composable
private fun StrengthBadge(strength: Strength) {
    val label = stringResource(
        when (strength) {
            Strength.STRONG -> R.string.strength_strong
            Strength.MEDIUM -> R.string.strength_medium
            Strength.WEAK -> R.string.strength_weak
        }
    )
    val background = when (strength) {
        Strength.STRONG -> MaterialTheme.colorScheme.tertiaryContainer
        Strength.MEDIUM -> MaterialTheme.colorScheme.secondaryContainer
        Strength.WEAK -> MaterialTheme.colorScheme.errorContainer
    }
    val foreground = when (strength) {
        Strength.STRONG -> MaterialTheme.colorScheme.onTertiaryContainer
        Strength.MEDIUM -> MaterialTheme.colorScheme.onSecondaryContainer
        Strength.WEAK -> MaterialTheme.colorScheme.onErrorContainer
    }
    Box(
        modifier = Modifier
            .background(background, RoundedCornerShape(50))
            .padding(horizontal = 10.dp, vertical = 4.dp),
    ) {
        Text(text = label, style = MaterialTheme.typography.labelMedium, color = foreground)
    }
}