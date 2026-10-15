package dev.zamok.vault.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.os.Build
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import dev.zamok.vault.R
import dev.zamok.vault.crypto.BiometricBlob
import dev.zamok.vault.crypto.KeystoreVaultKey
import dev.zamok.vault.model.Entry

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

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.app_name)) },
                actions = {
                    if (controller.biometricSupported && !state.biometricEnrolled) {
                        EnableBiometricAction(controller, enabled = !state.busy)
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
        }
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
    var passwordVisible by remember { mutableStateOf(false) }

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
                if (password.isNotEmpty()) {
                    TextButton(onClick = { passwordVisible = !passwordVisible }) {
                        Text(stringResource(if (passwordVisible) R.string.hide_password else R.string.show_password))
                    }
                }
                Field(R.string.field_url, url) { url = it }
                Field(R.string.field_category, category) { category = it }
                Field(R.string.field_tags, tags) { tags = it }
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
