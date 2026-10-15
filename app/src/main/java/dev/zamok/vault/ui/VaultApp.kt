package dev.zamok.vault.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.net.Uri
import android.os.Build
import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.zamok.vault.R
import dev.zamok.vault.crypto.BiometricBlob
import dev.zamok.vault.crypto.CharClass
import dev.zamok.vault.crypto.KeystoreVaultKey
import dev.zamok.vault.crypto.PasswordGenerator
import dev.zamok.vault.crypto.Totp
import dev.zamok.vault.data.PasswordAudit
import dev.zamok.vault.data.WeakReason
import dev.zamok.vault.model.Entry
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import kotlin.math.roundToInt

/**
 * The whole app: one screen when locked, one when open. No navigation library — there is nowhere
 * to navigate, and every other screen is a dialog on top of these two.
 *
 * The open screen is large enough to live in its own file; what stays here is the locked screen,
 * the dialogs they both open, and the pieces only the dialogs use.
 */
@Composable
fun VaultApp(controller: VaultController) {
    val state = controller.state
    if (state.unlocked) {
        VaultScreen(controller, state)
    } else {
        UnlockScreen(controller, state)
    }
}

@Composable
private fun UnlockScreen(controller: VaultController, state: VaultUiState) {
    var password by remember { mutableStateOf("") }
    var visible by remember { mutableStateOf(false) }
    val creating = !state.vaultExists

    val activity = LocalContext.current.findActivity()
    val promptTitle = stringResource(R.string.biometric_prompt_title)
    val cancelLabel = stringResource(R.string.cancel)
    val biometricsReady = !creating && state.biometricEnrolled && controller.biometricSupported

    // The fingerprint prompt opens on its own: a locked vault is entered with a finger, not by
    // tapping a button first. Appearing on screen is what triggers it, and the key only changes
    // when biometrics stop being offered — so a prompt the user just cancelled does not come
    // straight back at them.
    LaunchedEffect(biometricsReady) {
        if (biometricsReady && activity != null) {
            promptBiometricUnlock(activity, controller, promptTitle, cancelLabel)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
    ) {
        Text(
            text = stringResource(if (creating) R.string.create_title else R.string.unlock_title),
            style = MaterialTheme.typography.headlineSmall,
        )
        if (creating) {
            Text(stringResource(R.string.create_hint), style = MaterialTheme.typography.bodyMedium)
        }

        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text(stringResource(R.string.master_password)) },
            singleLine = true,
            enabled = !state.busy,
            visualTransformation = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
            modifier = Modifier.fillMaxWidth(),
        )

        TextButton(onClick = { visible = !visible }, enabled = !state.busy) {
            Text(stringResource(if (visible) R.string.hide_password else R.string.show_password))
        }

        ErrorText(state.error)

        Button(
            onClick = { if (creating) controller.create(password) else controller.unlock(password) },
            enabled = !state.busy && password.isNotEmpty(),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(stringResource(if (creating) R.string.create_vault else R.string.open_vault))
        }

        if (biometricsReady) {
            BiometricUnlockButton(controller, enabled = !state.busy)
            TextButton(onClick = { controller.forgetBiometricUnlock() }, enabled = !state.busy) {
                Text(stringResource(R.string.biometric_forget))
            }
        }

        if (state.busy) {
            CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
        }
    }
}

// ---- Biometric unlock ----
//
// The prompt lives here because it needs an Activity, which only the UI layer has. Everything it
// touches on the vault is reached through the controller, so no screen ever sees a key.

@Composable
private fun BiometricUnlockButton(controller: VaultController, enabled: Boolean) {
    val activity = LocalContext.current.findActivity()
    val promptTitle = stringResource(R.string.biometric_prompt_title)
    val cancelLabel = stringResource(R.string.cancel)

    Button(
        onClick = {
            if (activity != null) {
                promptBiometricUnlock(activity, controller, promptTitle, cancelLabel)
            }
        },
        enabled = enabled,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(stringResource(R.string.biometric_unlock))
    }
}

/**
 * Shows the fingerprint prompt and opens the vault when it succeeds.
 *
 * Shared by the button and by the prompt that opens on its own when the locked screen appears, so
 * that both go through exactly the same path.
 */
internal fun promptBiometricUnlock(
    activity: Activity,
    controller: VaultController,
    title: String,
    cancelLabel: String,
) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return

    // The stored blob carries the IV, because the Keystore generated it and only the Keystore
    // knows it. It is not secret, so reading it here is harmless. The read is guarded because this
    // now runs on its own when the screen appears: a copy that vanished or got corrupted must
    // leave the password field working, not take the app down from inside a composable.
    val iv = runCatching { controller.biometricIv() }.getOrNull()
    val cipher = iv?.let { runCatching { KeystoreVaultKey.decryptionCipher(it) }.getOrNull() }

    when {
        // The Keystore key is gone — the platform destroys it when a fingerprint is added — so the
        // stored copy can never open anything again.
        iv != null && cipher == null -> controller.onBiometricKeyLost()

        cipher != null -> BiometricPromptRunner.run(
            activity = activity,
            cipher = cipher,
            title = title,
            cancelLabel = cancelLabel,
            onUnlocked = { unlocked ->
                controller.unlockWithBiometrics { blob ->
                    unlocked.doFinal(BiometricBlob.decode(blob).ciphertext)
                }
            },
            // A cancelled or failed prompt already told the user in the system dialog.
            onFailure = {},
        )
    }
}

/** `LocalContext` is not always the activity itself, so unwrap until one turns up. */
internal tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

/**
 * Opens the document the user picked. It lives in the UI because a `ContentResolver` does, and the
 * vault only ever sees the stream.
 */
internal fun Context.openOutput(uri: Uri): OutputStream =
    contentResolver.openOutputStream(uri) ?: throw IOException("Cannot write to $uri")

internal fun Context.openInput(uri: Uri): InputStream =
    contentResolver.openInputStream(uri) ?: throw IOException("Cannot read $uri")

@Composable
internal fun ErrorText(error: VaultError?, onDismiss: (() -> Unit)? = null) {
    if (error == null) return
    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            text = stringResource(
                when (error) {
                    VaultError.WRONG_PASSWORD_OR_DAMAGED -> R.string.error_wrong_password
                    VaultError.PASSWORD_TOO_SHORT -> R.string.error_password_too_short
                    VaultError.STORAGE -> R.string.error_storage
                    VaultError.BIOMETRIC_LOST -> R.string.error_biometric_lost
                    VaultError.UNEXPECTED -> R.string.error_unexpected
                }
            ),
            color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.bodyMedium,
        )
        if (onDismiss != null) {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.dismiss)) }
        }
    }
}

/**
 * Add or edit one entry. [onDelete] is null when there is nothing to delete yet.
 *
 * Nothing here is worth validating beyond blank text: an entry with an empty title is still a
 * password the user meant to keep.
 */
@Composable
internal fun EntryDialog(
    initial: Entry,
    categories: List<String>,
    onDismiss: () -> Unit,
    onSave: (Entry) -> Unit,
    onDelete: (() -> Unit)?,
) {
    var title by remember { mutableStateOf(initial.title) }
    var username by remember { mutableStateOf(initial.username) }
    var password by remember { mutableStateOf(initial.password) }
    var url by remember { mutableStateOf(initial.url) }
    var notes by remember { mutableStateOf(initial.notes) }
    var category by remember { mutableStateOf(initial.category) }
    var tags by remember { mutableStateOf(initial.tags.joinToString(", ")) }
    var totpSecret by remember { mutableStateOf(initial.totpSecret) }
    var favorite by remember { mutableStateOf(initial.favorite) }
    var passwordVisible by remember { mutableStateOf(false) }
    var generatorOpen by remember { mutableStateOf(false) }

    // Recomputed while a new category is being typed, which costs nothing: a handful of strings.
    val categoryChoices = remember(categories, category) {
        EntryList.categoryOptions(categories, category)
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(if (initial.id.isEmpty()) R.string.new_entry else R.string.edit_entry)) },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                // The category first, the way the screen this is modelled on does it: it is the
                // choice that decides where the entry lands, and the list is grouped by it.
                CategoryField(
                    category = category,
                    options = categoryChoices,
                    onCategoryChange = { category = it },
                )
                Field(R.string.field_title, title) { title = it }
                Field(R.string.field_username, username) { username = it }
                Field(
                    label = R.string.field_password,
                    value = password,
                    onValueChange = { password = it },
                    visualTransformation = if (passwordVisible) {
                        VisualTransformation.None
                    } else {
                        PasswordVisualTransformation()
                    },
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (password.isNotEmpty()) {
                        TextButton(onClick = { passwordVisible = !passwordVisible }) {
                            Text(stringResource(if (passwordVisible) R.string.hide_password else R.string.show_password))
                        }
                    }
                    TextButton(onClick = { generatorOpen = true }) {
                        Text(stringResource(R.string.generate_password))
                    }
                }
                Field(R.string.field_url, url) { url = it }
                Field(R.string.field_tags, tags) { tags = it }
                Field(R.string.field_totp, totpSecret) { totpSecret = it }
                if (totpSecret.isNotBlank() && Totp.parse(totpSecret) == null) {
                    // Said here rather than by a missing code in the list later: a key that was
                    // pasted wrong would otherwise just quietly never produce a code.
                    Text(
                        text = stringResource(R.string.totp_invalid),
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                Field(R.string.field_notes, notes, singleLine = false) { notes = it }

                // A password manager is where a password gets picked, so marking one matters more
                // here than the field deserves on its own.
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(
                        checked = favorite,
                        onCheckedChange = { favorite = it },
                    )
                    Text(stringResource(R.string.field_favorite))
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    onSave(
                        initial.copy(
                            title = title,
                            username = username,
                            password = password,
                            url = url,
                            notes = notes,
                            category = category,
                            tags = tags.split(',').map { it.trim() }.filter { it.isNotEmpty() },
                            totpSecret = totpSecret,
                            favorite = favorite,
                        )
                    )
                },
            ) { Text(stringResource(R.string.save)) }
        },
        dismissButton = {
            Column {
                if (onDelete != null) {
                    TextButton(onClick = onDelete) { Text(stringResource(R.string.delete)) }
                }
                TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) }
            }
        },
    )

    if (generatorOpen) {
        PasswordGeneratorDialog(
            onDismiss = { generatorOpen = false },
            onUse = { generated ->
                password = generated
                generatorOpen = false
            },
        )
    }
}

@Composable
private fun Field(
    label: Int,
    value: String,
    singleLine: Boolean = true,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    onValueChange: (String) -> Unit,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(stringResource(label)) },
        singleLine = singleLine,
        visualTransformation = visualTransformation,
        modifier = Modifier.fillMaxWidth(),
    )
}

/**
 * Picking a category, the way the app this screen takes its shape from does it: a select box that
 * offers the categories already in use, with "новая" at the end for one that does not exist yet.
 *
 * Offered rather than typed from memory, because a vault ends up with "Банк" and "банк" as two
 * separate groups otherwise — and every group in the list is one this box handed out.
 */
@Composable
private fun CategoryField(
    category: String,
    options: List<String>,
    onCategoryChange: (String) -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    var typing by remember { mutableStateOf(false) }

    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            text = stringResource(R.string.field_category),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        if (typing) {
            OutlinedTextField(
                value = category,
                onValueChange = onCategoryChange,
                singleLine = true,
                placeholder = { Text(stringResource(R.string.category_new_hint)) },
                trailingIcon = {
                    IconButton(onClick = { typing = false }) {
                        Icon(
                            imageVector = Icons.Filled.KeyboardArrowDown,
                            contentDescription = stringResource(R.string.cd_pick_category),
                        )
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            )
        } else {
            Box {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .clickable { menuOpen = true }
                        .padding(horizontal = 12.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    // The colour the entry's own circle gets in the list when it shares the name.
                    Box(
                        modifier = Modifier
                            .size(18.dp)
                            .clip(CircleShape)
                            .background(Color(EntryList.colorFor(category))),
                    )
                    Text(
                        text = category.ifBlank { stringResource(R.string.uncategorized) },
                        style = MaterialTheme.typography.bodyLarge,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f).padding(start = 10.dp),
                    )
                    Icon(
                        imageVector = Icons.Filled.KeyboardArrowDown,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                    DropdownMenuItem(
                        text = { Text(stringResource(R.string.uncategorized)) },
                        onClick = {
                            onCategoryChange("")
                            menuOpen = false
                        },
                    )
                    for (option in options) {
                        DropdownMenuItem(
                            text = { Text(option) },
                            onClick = {
                                onCategoryChange(option)
                                menuOpen = false
                            },
                        )
                    }
                    HorizontalDivider()
                    DropdownMenuItem(
                        text = { Text(stringResource(R.string.category_new)) },
                        onClick = {
                            // Emptied rather than prefilled: "новая" means a name that is not
                            // there yet, and editing the old one into the new one is not the job.
                            onCategoryChange("")
                            typing = true
                            menuOpen = false
                        },
                    )
                }
            }
        }
    }
}

private const val MAX_GENERATED_LENGTH = 64

/** The label of a class is a resource id, so the enum itself stays free of Android. */
private val CharClass.label: Int
    get() = when (this) {
        CharClass.LOWERCASE -> R.string.class_lowercase
        CharClass.UPPERCASE -> R.string.class_uppercase
        CharClass.DIGITS -> R.string.class_digits
        CharClass.SYMBOLS -> R.string.class_symbols
    }

/**
 * Picks a password for the entry being edited and hands it back through [onUse].
 *
 * The password is recomputed rather than kept: changing a setting and asking for another one are
 * the same thing, so there is no second copy of it to fall out of step.
 */
@Composable
private fun PasswordGeneratorDialog(onDismiss: () -> Unit, onUse: (String) -> Unit) {
    var length by remember { mutableStateOf(16) }
    var classes by remember { mutableStateOf(CharClass.entries.toSet()) }
    var nonce by remember { mutableStateOf(0) }

    val password = remember(length, classes, nonce) { PasswordGenerator.generate(length, classes) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.generate_password)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                // Selectable so the password can be copied out to wherever it is needed next.
                SelectionContainer {
                    Text(
                        text = password,
                        style = MaterialTheme.typography.bodyLarge,
                        fontFamily = FontFamily.Monospace,
                    )
                }
                Text(
                    text = stringResource(R.string.password_length, length),
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = 8.dp),
                )
                Slider(
                    value = length.toFloat(),
                    onValueChange = { length = it.roundToInt() },
                    valueRange = PasswordGenerator.MIN_LENGTH.toFloat()..MAX_GENERATED_LENGTH.toFloat(),
                    steps = MAX_GENERATED_LENGTH - PasswordGenerator.MIN_LENGTH - 1,
                )
                for (charClass in CharClass.entries) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(
                            checked = charClass in classes,
                            onCheckedChange = { checked ->
                                // The last class standing cannot be switched off: a password has to
                                // be built from something.
                                classes = when {
                                    checked -> classes + charClass
                                    classes.size > 1 -> classes - charClass
                                    else -> classes
                                }
                            },
                        )
                        Text(stringResource(charClass.label))
                    }
                }
            }
        },
        confirmButton = {
            Row {
                TextButton(onClick = { nonce++ }) { Text(stringResource(R.string.another_password)) }
                TextButton(onClick = { onUse(password) }) { Text(stringResource(R.string.use_password)) }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) }
        },
    )
}

/**
 * Asks for the backup's own password before anything is read.
 *
 * The warning is not decoration: this is the one action in the app that can replace every password
 * at once. What it promises is true — the vault file is only overwritten once the backup has been
 * opened and decoded.
 */
@Composable
internal fun RestoreDialog(onDismiss: () -> Unit, onRestore: (String) -> Unit) {
    var password by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.backup_restore)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(stringResource(R.string.backup_restore_warning))
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text(stringResource(R.string.backup_password)) },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            TextButton(onClick = { onRestore(password) }, enabled = password.isNotEmpty()) {
                Text(stringResource(R.string.backup_restore))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) }
        },
    )
}

/**
 * What the rules make of the passwords already in the vault.
 *
 * Only entries with something wrong are listed, and tapping one opens it for editing: a warning
 * that does not lead to the thing to change is just noise. The hint at the bottom says what this is
 * and, more importantly, what it is not.
 */
@Composable
internal fun AuditDialog(entries: List<Entry>, onOpenEntry: (Entry) -> Unit, onDismiss: () -> Unit) {
    // A pure function of the entries, so it runs when the dialog opens rather than being watched.
    val report = remember(entries) { PasswordAudit.report(entries) }
    val untitled = stringResource(R.string.untitled)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.audit_title)) },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (report.isEmpty) {
                    Text(stringResource(R.string.audit_clean))
                }

                if (report.reused.isNotEmpty()) {
                    Text(
                        text = stringResource(R.string.audit_reused),
                        style = MaterialTheme.typography.titleSmall,
                    )
                    for (group in report.reused) {
                        Text(
                            // One group can be several entries; opening the first of them is enough
                            // of a lead to work out what to split apart.
                            text = group.entries.joinToString(", ") { it.title.ifBlank { untitled } },
                            modifier = Modifier.clickable { onOpenEntry(group.entries.first()) },
                        )
                    }
                }

                if (report.weak.isNotEmpty()) {
                    Text(
                        text = stringResource(R.string.audit_weak),
                        style = MaterialTheme.typography.titleSmall,
                    )
                    for (finding in report.weak) {
                        Column(modifier = Modifier.clickable { onOpenEntry(finding.entry) }) {
                            Text(
                                text = finding.entry.title.ifBlank { untitled },
                                style = MaterialTheme.typography.bodyLarge,
                            )
                            Text(
                                // `map` is inline, so resolving the labels here is allowed.
                                text = finding.reasons.map { stringResource(reasonLabel(it)) }
                                    .joinToString(", "),
                                color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }
                }

                Text(
                    text = stringResource(R.string.audit_hint),
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.dismiss)) }
        },
    )
}

private fun reasonLabel(reason: WeakReason): Int = when (reason) {
    WeakReason.COMMON -> R.string.audit_reason_common
    WeakReason.TOO_SHORT -> R.string.audit_reason_short
    WeakReason.REPEATED -> R.string.audit_reason_repeated
    WeakReason.SEQUENCE -> R.string.audit_reason_sequence
    WeakReason.PERSONAL -> R.string.audit_reason_personal
}

/**
 * Says out loud what a CSV export is, before it happens.
 *
 * The backup is the safe copy; this one can be read by anything that opens the file, and this
 * dialog is the last moment at which that can still change the user's mind.
 */
@Composable
internal fun CsvExportDialog(onDismiss: () -> Unit, onConfirm: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.csv_export_title)) },
        text = { Text(stringResource(R.string.csv_export_warning)) },
        confirmButton = {
            TextButton(onClick = onConfirm) { Text(stringResource(R.string.csv_export_confirm)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) }
        },
    )
}
