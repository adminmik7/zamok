package dev.zamok.vault.ui

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.ContextWrapper
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import dev.zamok.vault.R
import dev.zamok.vault.crypto.BiometricBlob
import dev.zamok.vault.crypto.CharClass
import dev.zamok.vault.crypto.KeystoreVaultKey
import dev.zamok.vault.crypto.PasswordGenerator
import dev.zamok.vault.crypto.Totp
import dev.zamok.vault.model.Entry
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.time.LocalDate
import kotlin.math.roundToInt

/**
 * The whole app: one screen when locked, one when open. No navigation library — there is nowhere
 * to navigate, and the entry form is a dialog rather than a third destination.
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun VaultScreen(controller: VaultController, state: VaultUiState) {
    var editing by remember { mutableStateOf<Entry?>(null) }
    var adding by remember { mutableStateOf(false) }
    var backupMenuOpen by remember { mutableStateOf(false) }
    var restoreUri by remember { mutableStateOf<Uri?>(null) }

    val context = LocalContext.current
    val backupFileName = remember { "zamok-${LocalDate.now()}$BACKUP_FILE_EXTENSION" }

    // The picker hands back a uri, and turning it into a stream stays here: the repository has no
    // business knowing what a ContentResolver is.
    val saveBackup = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument(BACKUP_MIME_TYPE),
    ) { uri -> if (uri != null) controller.export { context.openOutput(uri) } }

    val pickBackup = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        // Picking a file only gets it asked about; nothing is read until the user confirms.
        if (uri != null) restoreUri = uri
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.app_name)) },
                actions = {
                    if (controller.biometricSupported && !state.biometricEnrolled) {
                        EnableBiometricAction(controller, enabled = !state.busy)
                    }
                    Box {
                        TextButton(onClick = { backupMenuOpen = true }, enabled = !state.busy) {
                            Text(stringResource(R.string.backup_menu))
                        }
                        DropdownMenu(
                            expanded = backupMenuOpen,
                            onDismissRequest = { backupMenuOpen = false },
                        ) {
                            DropdownMenuItem(
                                text = { Text(stringResource(R.string.backup_save)) },
                                onClick = {
                                    backupMenuOpen = false
                                    saveBackup.launch(backupFileName)
                                },
                            )
                            DropdownMenuItem(
                                text = { Text(stringResource(R.string.backup_restore)) },
                                onClick = {
                                    backupMenuOpen = false
                                    // Any type: a picker cannot know a Zamok backup, and the
                                    // file's own header is what decides whether it opens.
                                    pickBackup.launch(arrayOf("*/*"))
                                },
                            )
                        }
                    }
                    TextButton(onClick = { controller.lock() }) {
                        Text(stringResource(R.string.lock))
                    }
                },
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = { adding = true }) {
                Text(stringResource(R.string.add_entry))
            }
        },
    ) { innerPadding ->
        Column(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            ErrorText(state.error, onDismiss = { controller.dismissError() })

            if (state.entries.isEmpty()) {
                Text(
                    text = stringResource(R.string.empty_vault),
                    modifier = Modifier.padding(24.dp),
                    style = MaterialTheme.typography.bodyMedium,
                )
            } else {
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    items(state.entries, key = { it.id }) { entry ->
                        EntryRow(entry, onClick = { editing = entry })
                    }
                }
            }
        }
    }

    if (adding) {
        EntryDialog(
            initial = Entry(id = ""),
            onDismiss = { adding = false },
            onSave = { controller.add(it); adding = false },
            onDelete = null,
        )
    }

    editing?.let { entry ->
        EntryDialog(
            initial = entry,
            onDismiss = { editing = null },
            onSave = { controller.update(it); editing = null },
            onDelete = { controller.delete(entry.id); editing = null },
        )
    }

    restoreUri?.let { uri ->
        RestoreDialog(
            onDismiss = { restoreUri = null },
            onRestore = { password ->
                controller.restore({ context.openInput(uri) }, password)
                restoreUri = null
            },
        )
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
private fun promptBiometricUnlock(
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

@Composable
private fun EnableBiometricAction(controller: VaultController, enabled: Boolean) {
    val activity = LocalContext.current.findActivity()
    val promptTitle = stringResource(R.string.biometric_prompt_title)
    val cancelLabel = stringResource(R.string.cancel)

    TextButton(
        onClick = {
            if (activity == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return@TextButton

            val cipher = runCatching { KeystoreVaultKey.encryptionCipher() }.getOrNull()
            if (cipher != null) {
                BiometricPromptRunner.run(
                    activity = activity,
                    cipher = cipher,
                    title = promptTitle,
                    cancelLabel = cancelLabel,
                    onUnlocked = { unlocked ->
                        // The IV is read after the prompt rather than before: the Keystore sets it
                        // when the cipher is initialised, and it must be stored with the blob.
                        val iv = unlocked.iv
                        controller.enableBiometricUnlock { vaultKey ->
                            BiometricBlob.encode(iv, unlocked.doFinal(vaultKey))
                        }
                    },
                    onFailure = {},
                )
            }
        },
        enabled = enabled,
    ) {
        Text(stringResource(R.string.biometric_enable))
    }
}

/** `LocalContext` is not always the activity itself, so unwrap until one turns up. */
private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

/**
 * Opens the document the user picked. It lives in the UI because a `ContentResolver` does, and the
 * vault only ever sees the stream.
 */
private fun Context.openOutput(uri: Uri): OutputStream =
    contentResolver.openOutputStream(uri) ?: throw IOException("Cannot write to $uri")

private fun Context.openInput(uri: Uri): InputStream =
    contentResolver.openInputStream(uri) ?: throw IOException("Cannot read $uri")

/** Copies [text] for pasting. A one-time code expires in seconds, so it does not linger. */
private fun Context.copyToClipboard(text: String) {
    getSystemService(ClipboardManager::class.java)
        ?.setPrimaryClip(ClipData.newPlainText("Zamok", text))
}

@Composable
private fun EntryRow(entry: Entry, onClick: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp).clickable(onClick = onClick)) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = entry.title.ifBlank { stringResource(R.string.untitled) },
                style = MaterialTheme.typography.titleMedium,
            )
            if (entry.username.isNotBlank()) {
                Text(entry.username, style = MaterialTheme.typography.bodySmall)
            }
            if (entry.totpSecret.isNotBlank()) {
                TotpCode(entry.totpSecret)
            }
        }
    }
}

/**
 * The entry's current one-time code, counting down to the next one.
 *
 * The one-second clock lives in here rather than in the screen, so a tick redraws this card and
 * nothing else. It is a Handler rather than a coroutine because the project has no coroutine
 * dependency, and this is the same shape its background work already uses.
 */
@Composable
private fun TotpCode(secretText: String) {
    val secret = remember(secretText) { Totp.parse(secretText) } ?: return
    val context = LocalContext.current
    val copiedMessage = stringResource(R.string.totp_copied)

    var now by remember { mutableStateOf(System.currentTimeMillis()) }
    DisposableEffect(Unit) {
        val handler = Handler(Looper.getMainLooper())
        val tick = object : Runnable {
            override fun run() {
                now = System.currentTimeMillis()
                handler.postDelayed(this, 1_000)
            }
        }
        handler.postDelayed(tick, 1_000)
        onDispose { handler.removeCallbacks(tick) }
    }

    val code = remember(secret, now) { secret.codeAt(now) }
    val remaining = secret.secondsRemainingAt(now)

    // A click target of its own: tapping the card opens the entry, tapping the code copies it.
    Column(
        modifier = Modifier.padding(top = 4.dp).clickable {
            context.copyToClipboard(code)
            Toast.makeText(context, copiedMessage, Toast.LENGTH_SHORT).show()
        },
    ) {
        Text(
            // Grouped to be read off the screen; the clipboard gets the bare digits.
            text = code.chunked(if (code.length == 6) 3 else 4).joinToString(" "),
            style = MaterialTheme.typography.titleMedium,
            fontFamily = FontFamily.Monospace,
        )
        Text(
            text = stringResource(R.string.totp_seconds_left, remaining),
            style = MaterialTheme.typography.bodySmall,
        )
    }
}

@Composable
private fun ErrorText(error: VaultError?, onDismiss: (() -> Unit)? = null) {
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
private fun EntryDialog(
    initial: Entry,
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
    var passwordVisible by remember { mutableStateOf(false) }
    var generatorOpen by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(if (initial.id.isEmpty()) R.string.new_entry else R.string.edit_entry)) },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
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
                Field(R.string.field_category, category) { category = it }
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

private const val BACKUP_MIME_TYPE = "application/octet-stream"
private const val BACKUP_FILE_EXTENSION = ".zmk"

/**
 * Asks for the backup's own password before anything is read.
 *
 * The warning is not decoration: this is the one action in the app that can replace every password
 * at once. What it promises is true — the vault file is only overwritten once the backup has been
 * opened and decoded.
 */
@Composable
private fun RestoreDialog(onDismiss: () -> Unit, onRestore: (String) -> Unit) {
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
