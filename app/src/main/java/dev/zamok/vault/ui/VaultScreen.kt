package dev.zamok.vault.ui

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.zamok.vault.R
import dev.zamok.vault.crypto.BiometricBlob
import dev.zamok.vault.crypto.KeystoreVaultKey
import dev.zamok.vault.crypto.Totp
import dev.zamok.vault.model.Entry
import java.time.LocalDate
import kotlinx.coroutines.launch

private const val BACKUP_MIME_TYPE = "application/octet-stream"
private const val BACKUP_FILE_EXTENSION = ".zmk"
private const val CSV_MIME_TYPE = "text/csv"

/** Room at the bottom of the list, so the button that adds an entry never covers the last row. */
private val FAB_CLEARANCE = 88.dp

/**
 * The open vault.
 *
 * Everything the screen shows is derived here from [VaultUiState] by [EntryList], which is pure and
 * tested: what is left in this file is layout and the actions behind the drawer.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun VaultScreen(controller: VaultController, state: VaultUiState) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val drawerState = rememberDrawerState(DrawerValue.Closed)

    val biometricTitle = stringResource(R.string.biometric_prompt_title)
    val cancelLabel = stringResource(R.string.cancel)

    var editing by remember { mutableStateOf<Entry?>(null) }
    var adding by remember { mutableStateOf(false) }
    var restoreUri by remember { mutableStateOf<Uri?>(null) }
    var auditOpen by remember { mutableStateOf(false) }
    var csvExportOpen by remember { mutableStateOf(false) }

    var query by remember { mutableStateOf("") }
    var selectedCategory by remember { mutableStateOf<String?>(null) }
    var favoritesOnly by remember { mutableStateOf(false) }
    var order by remember { mutableStateOf(SortOrder.TITLE) }
    var collapsed by remember { mutableStateOf(emptySet<String>()) }

    // The pickers hand back a uri, and turning it into a stream stays here: the repository has no
    // business knowing what a ContentResolver is.
    val backupFileName = remember { "zamok-${LocalDate.now()}$BACKUP_FILE_EXTENSION" }
    val csvFileName = remember { "zamok-${LocalDate.now()}.csv" }

    val saveBackup = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument(BACKUP_MIME_TYPE),
    ) { uri -> if (uri != null) controller.export { context.openOutput(uri) } }

    val pickBackup = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        // Picking a file only gets it asked about; nothing is read until the user confirms.
        if (uri != null) restoreUri = uri
    }

    val saveCsv = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument(CSV_MIME_TYPE),
    ) { uri -> if (uri != null) controller.exportCsv { context.openOutput(uri) } }

    val pickCsv = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            // Importing adds rather than replaces, so there is nothing to warn about, and the
            // counts are the whole outcome.
            controller.importCsv({ context.openInput(uri) }) { result ->
                Toast.makeText(
                    context,
                    context.getString(R.string.csv_imported, result.entries.size, result.skipped),
                    Toast.LENGTH_LONG,
                ).show()
            }
        }
    }

    val categories = remember(state.entries) { EntryList.categoriesOf(state.entries) }
    val shown = remember(state.entries, query, selectedCategory, favoritesOnly, order) {
        EntryList.apply(state.entries, query, selectedCategory, favoritesOnly, order)
    }
    val groups = remember(shown) { EntryList.group(shown) }

    // Closing after a choice, since the drawer covers the result: leaving it open would look like
    // the screen is still busy. A new entry keeps it open — that is a list of things to add,
    // not a place to be sent back from.
    fun choose(action: () -> Unit) {
        scope.launch { drawerState.close() }
        action()
    }

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet {
                Text(
                    text = stringResource(R.string.app_name),
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.padding(horizontal = 28.dp, vertical = 16.dp),
                )
                NavigationDrawerItem(
                    label = { Text(stringResource(R.string.all_entries)) },
                    selected = !favoritesOnly,
                    onClick = { choose { favoritesOnly = false } },
                )
                NavigationDrawerItem(
                    label = { Text(stringResource(R.string.favorites)) },
                    selected = favoritesOnly,
                    onClick = { choose { favoritesOnly = true } },
                )
                DrawerDivider()
                NavigationDrawerItem(
                    label = { Text(stringResource(R.string.audit_title)) },
                    selected = false,
                    onClick = { choose { auditOpen = true } },
                )
                NavigationDrawerItem(
                    label = { Text(stringResource(R.string.backup_save)) },
                    selected = false,
                    onClick = { choose { saveBackup.launch(backupFileName) } },
                )
                NavigationDrawerItem(
                    label = { Text(stringResource(R.string.backup_restore)) },
                    selected = false,
                    onClick = { choose { pickBackup.launch(arrayOf("*/*")) } },
                )
                NavigationDrawerItem(
                    label = { Text(stringResource(R.string.csv_export)) },
                    selected = false,
                    onClick = { choose { csvExportOpen = true } },
                )
                NavigationDrawerItem(
                    label = { Text(stringResource(R.string.csv_import)) },
                    selected = false,
                    onClick = { choose { pickCsv.launch(arrayOf("*/*")) } },
                )
                if (controller.biometricSupported && !state.biometricEnrolled) {
                    NavigationDrawerItem(
                        label = { Text(stringResource(R.string.biometric_enable)) },
                        selected = false,
                        onClick = {
                            val activity = context.findActivity()
                            choose { if (activity != null) enableBiometric(activity, controller, biometricTitle, cancelLabel) }
                        },
                    )
                }
                DrawerDivider()
                NavigationDrawerItem(
                    label = { Text(stringResource(R.string.lock)) },
                    selected = false,
                    onClick = { controller.lock() },
                )
            }
        },
    ) {
        Scaffold(
            topBar = {
                Column {
                    TopAppBar(
                        navigationIcon = {
                            IconButton(onClick = { scope.launch { drawerState.open() } }) {
                                Icon(
                                    imageVector = Icons.Filled.Menu,
                                    contentDescription = stringResource(R.string.cd_menu),
                                )
                            }
                        },
                        title = {
                            Column {
                                Text(
                                    stringResource(
                                        if (favoritesOnly) R.string.favorites else R.string.all_entries
                                    )
                                )
                                Text(
                                    // The count is of what is on screen, so a search says how much
                                    // it found rather than how much was hidden.
                                    text = pluralStringResource(
                                        R.plurals.entries_count,
                                        shown.size,
                                        shown.size,
                                    ),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        },
                        actions = {
                            IconButton(onClick = { favoritesOnly = !favoritesOnly }) {
                                Icon(
                                    imageVector = Icons.Filled.Star,
                                    contentDescription = stringResource(R.string.cd_favorites),
                                    tint = if (favoritesOnly) {
                                        MaterialTheme.colorScheme.tertiary
                                    } else {
                                        MaterialTheme.colorScheme.onSurfaceVariant
                                    },
                                )
                            }
                        },
                    )
                    VaultSearchField(
                        query = query,
                        onQueryChange = { query = it },
                        order = order,
                        onOrderChange = { order = it },
                    )
                    CategoryChipRow(
                        categories = categories,
                        selected = selectedCategory,
                        onSelect = { selectedCategory = it },
                    )
                }
            },
            floatingActionButton = {
                FloatingActionButton(onClick = { adding = true }) {
                    Icon(
                        imageVector = Icons.Filled.Add,
                        contentDescription = stringResource(R.string.add_entry),
                    )
                }
            },
        ) { innerPadding ->
            Column(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
                ErrorText(state.error, onDismiss = { controller.dismissError() })

                when {
                    state.entries.isEmpty() -> CenteredMessage(R.string.empty_vault)
                    // Entries exist, so an empty list means the search or the filter hid them all.
                    groups.isEmpty() -> CenteredMessage(R.string.nothing_found)
                    else -> LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(bottom = FAB_CLEARANCE),
                    ) {
                        for (group in groups) {
                            item(key = "category:${group.category}") {
                                SectionHeader(
                                    category = group.category,
                                    collapsed = group.category in collapsed,
                                    onToggle = {
                                        collapsed = if (group.category in collapsed) {
                                            collapsed - group.category
                                        } else {
                                            collapsed + group.category
                                        }
                                    },
                                )
                            }
                            if (group.category !in collapsed) {
                                items(group.entries, key = { it.id }) { entry ->
                                    EntryRow(entry, onClick = { editing = entry })
                                }
                            }
                        }
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

    if (auditOpen) {
        AuditDialog(
            entries = state.entries,
            onOpenEntry = { entry ->
                auditOpen = false
                editing = entry
            },
            onDismiss = { auditOpen = false },
        )
    }

    if (csvExportOpen) {
        CsvExportDialog(
            onDismiss = { csvExportOpen = false },
            onConfirm = {
                csvExportOpen = false
                saveCsv.launch(csvFileName)
            },
        )
    }
}

@Composable
private fun DrawerDivider() {
    HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
}

/**
 * Hands the open vault's key to the Keystore under a fresh fingerprint.
 *
 * The IV is read after the prompt rather than before: the Keystore sets it when the cipher is
 * initialised, and it has to be stored with the blob.
 */
private fun enableBiometric(
    activity: Activity,
    controller: VaultController,
    title: String,
    cancelLabel: String,
) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return

    val cipher = runCatching { KeystoreVaultKey.encryptionCipher() }.getOrNull() ?: return
    BiometricPromptRunner.run(
        activity = activity,
        cipher = cipher,
        title = title,
        cancelLabel = cancelLabel,
        onUnlocked = { unlocked ->
            val iv = unlocked.iv
            controller.enableBiometricUnlock { vaultKey ->
                BiometricBlob.encode(iv, unlocked.doFinal(vaultKey))
            }
        },
        onFailure = {},
    )
}

// ---- The list ----

@Composable
private fun VaultSearchField(
    query: String,
    onQueryChange: (String) -> Unit,
    order: SortOrder,
    onOrderChange: (SortOrder) -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }

    OutlinedTextField(
        value = query,
        onValueChange = onQueryChange,
        singleLine = true,
        placeholder = { Text(stringResource(R.string.search_hint)) },
        leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
        trailingIcon = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (query.isNotEmpty()) {
                    IconButton(onClick = { onQueryChange("") }) {
                        Icon(
                            imageVector = Icons.Filled.Clear,
                            contentDescription = stringResource(R.string.cd_clear_search),
                        )
                    }
                }
                Box {
                    IconButton(onClick = { menuOpen = true }) {
                        Icon(
                            imageVector = Icons.Filled.MoreVert,
                            contentDescription = stringResource(R.string.cd_sort),
                        )
                    }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.sort_by_title)) },
                            onClick = {
                                menuOpen = false
                                onOrderChange(SortOrder.TITLE)
                            },
                        )
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.sort_by_recent)) },
                            onClick = {
                                menuOpen = false
                                onOrderChange(SortOrder.RECENT)
                            },
                        )
                    }
                }
            }
        },
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
    )
}

/**
 * The categories that actually occur, as filters.
 *
 * Named rather than drawn as icons, unlike the app this screen takes its shape from: those are its
 * own fixed set of categories, and there is no icon to pick for a word somebody typed themselves.
 */
@Composable
private fun CategoryChipRow(
    categories: List<String>,
    selected: String?,
    onSelect: (String?) -> Unit,
) {
    if (categories.isEmpty()) return

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 12.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        CategoryChip(
            label = stringResource(R.string.all_entries),
            selected = selected == null,
            onClick = { onSelect(null) },
        )
        for (category in categories) {
            CategoryChip(
                label = category,
                selected = selected == category,
                onClick = { onSelect(category) },
            )
        }
    }
}

@Composable
private fun CategoryChip(label: String, selected: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(
                if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 8.dp),
    ) {
        Text(
            text = label,
            color = if (selected) {
                MaterialTheme.colorScheme.onPrimary
            } else {
                MaterialTheme.colorScheme.onSurfaceVariant
            },
            style = MaterialTheme.typography.labelLarge,
            maxLines = 1,
        )
    }
}

@Composable
private fun SectionHeader(category: String, collapsed: Boolean, onToggle: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onToggle)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = category.ifEmpty { stringResource(R.string.uncategorized) },
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        Icon(
            imageVector = if (collapsed) {
                Icons.Filled.KeyboardArrowRight
            } else {
                Icons.Filled.KeyboardArrowDown
            },
            contentDescription = stringResource(
                if (collapsed) R.string.cd_expand else R.string.cd_collapse
            ),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun EntryRow(entry: Entry, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        EntryAvatar(entry)

        Column(modifier = Modifier.weight(1f).padding(start = 14.dp)) {
            Text(
                text = entry.title.ifBlank { stringResource(R.string.untitled) },
                style = MaterialTheme.typography.titleMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            val subtitle = EntryList.subtitleOf(entry)
            if (subtitle.kind != SubtitleKind.NONE) {
                Text(
                    text = subtitleLabel(subtitle),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (entry.totpSecret.isNotBlank()) {
                TotpCode(entry.totpSecret)
            }
        }

        // Shown only when it is set, rather than as an empty outline on every row.
        if (entry.favorite) {
            Icon(
                imageVector = Icons.Filled.Star,
                contentDescription = stringResource(R.string.cd_favorite_mark),
                tint = MaterialTheme.colorScheme.tertiary,
                modifier = Modifier.size(18.dp),
            )
        }
    }
    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
}

/**
 * The letter in the circle next to an entry.
 *
 * A letter rather than the site's real icon: those are trademarks, and fetching them would mean
 * asking the network about every entry in the vault — which this app does not do, on purpose.
 */
@Composable
private fun EntryAvatar(entry: Entry) {
    Box(
        modifier = Modifier
            .size(44.dp)
            .clip(CircleShape)
            .background(Color(EntryList.avatarColorOf(entry))),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = EntryList.initialOf(entry),
            style = MaterialTheme.typography.titleMedium,
            color = Color.White,
        )
    }
}

/** A label where one helps; a bare host already reads as an address. */
@Composable
private fun subtitleLabel(subtitle: Subtitle): String = when (subtitle.kind) {
    SubtitleKind.USERNAME -> stringResource(R.string.subtitle_username, subtitle.value)
    SubtitleKind.ADDRESS -> subtitle.value
    SubtitleKind.PASSWORD -> stringResource(R.string.subtitle_password, subtitle.value)
    SubtitleKind.NONE -> ""
}

@Composable
private fun CenteredMessage(text: Int) {
    Box(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = stringResource(text),
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center,
        )
    }
}

/**
 * The entry's current one-time code, counting down to the next one.
 *
 * The one-second clock lives in here rather than in the screen, so a tick redraws this row and
 * nothing else. It is a Handler rather than a coroutine because a tick needs no scope; coroutines
 * are used only where Compose's own API asks for one, which so far is the drawer.
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

    // A click target of its own: tapping the row opens the entry, tapping the code copies it.
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
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/** Copies [text] for pasting. A one-time code expires in seconds, so it does not linger. */
private fun Context.copyToClipboard(text: String) {
    getSystemService(ClipboardManager::class.java)
        ?.setPrimaryClip(ClipData.newPlainText("Zamok", text))
}
