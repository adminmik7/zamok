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
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable

import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
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
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.zamok.vault.R
import dev.zamok.vault.crypto.BiometricBlob
import dev.zamok.vault.crypto.KeystoreVaultKey
import dev.zamok.vault.crypto.Totp
import dev.zamok.vault.model.Entry
import dev.zamok.vault.model.EntryTypes
import java.time.LocalDate
import kotlin.math.abs
import kotlinx.coroutines.launch

private const val BACKUP_MIME_TYPE = "application/octet-stream"
private const val BACKUP_FILE_EXTENSION = ".zmk"
private const val CSV_MIME_TYPE = "text/csv"

/** Room at the bottom of the list, so the button that adds an entry never covers the last row. */
private val FAB_CLEARANCE = 88.dp

/** Where the four items of the bottom bar lead. */
private enum class VaultTab(val label: Int, val icon: ImageVector) {
    VAULT(R.string.nav_vault, Icons.Filled.Lock),
    SECURITY(R.string.nav_security, Icons.Filled.Warning),
    TOOLS(R.string.nav_tools, Icons.Filled.Settings),
    SEARCH(R.string.nav_search, Icons.Filled.Search),
}

/**
 * The open vault.
 *
 * Everything the screen shows is derived here from [VaultUiState] by [EntryList], which is pure and
 * tested: what is left in this file is layout and the actions behind the drawer and the bottom bar.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun VaultScreen(controller: VaultController, state: VaultUiState) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val drawerState = rememberDrawerState(DrawerValue.Closed)

    val biometricTitle = stringResource(R.string.biometric_prompt_title)
    val cancelLabel = stringResource(R.string.cancel)

    var tab by remember { mutableStateOf(VaultTab.VAULT) }
    var editing by remember { mutableStateOf<Entry?>(null) }
    var adding by remember { mutableStateOf(false) }
    var newType by remember { mutableStateOf(EntryTypes.PASSWORD) }
    var typeMenuOpen by remember { mutableStateOf(false) }
    var restoreUri by remember { mutableStateOf<Uri?>(null) }
    var csvExportOpen by remember { mutableStateOf(false) }

    var query by remember { mutableStateOf("") }
    var favoritesOnly by remember { mutableStateOf(false) }
    var order by remember { mutableStateOf(SortOrder.TITLE) }

    val searchFocus = remember { FocusRequester() }
    var exitAsk by remember { mutableStateOf(false) }

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
    val sections = remember(state.entries, query, favoritesOnly, order) {
        EntryList.sections(
            entries = state.entries,
            query = query,
            favoritesOnly = favoritesOnly,
            order = order,
        )
    }
    val shownCount = remember(sections) { sections.sumOf { it.entries.size } }

    // Closing after a choice, since the drawer covers the result: leaving it open would look like
    // the screen is still busy. A new entry keeps it open — that is a list of things to add,
    // not a place to be sent back from.
    fun choose(action: () -> Unit) {
        scope.launch { drawerState.close() }
        action()
    }

    // Back from the list leaves the app, and a password manager is an app someone walks away from in
    // the middle of something - so it asks. On the other tabs back does what the tab does.
    BackHandler(enabled = tab != VaultTab.SECURITY && tab != VaultTab.TOOLS) {
        exitAsk = true
    }

    Box(modifier = Modifier.fillMaxSize()) {
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
                        selected = tab == VaultTab.SECURITY,
                        onClick = { choose { tab = VaultTab.SECURITY } },
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
                                        shownCount,
                                        shownCount,
                                    ),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        },
                    )
                },
                bottomBar = {
                    NavigationBar {
                        for (item in VaultTab.entries) {
                            NavigationBarItem(
                                selected = tab == item,
                                onClick = { tab = item },
                                icon = {
                                    Icon(
                                        imageVector = item.icon,
                                        contentDescription = null,
                                    )
                                },
                                label = { Text(stringResource(item.label)) },
                            )
                        }
                    }
                },
                floatingActionButton = {
                    // The keyboard-less way to add: the plus opens the list of record types, the way
                    // the app this screen is modelled on does it, rather than assuming a password.
                    if (!typeMenuOpen && (tab == VaultTab.VAULT || tab == VaultTab.SEARCH)) {
                        FloatingActionButton(onClick = { typeMenuOpen = true }) {
                            Icon(
                                imageVector = Icons.Filled.Add,
                                contentDescription = stringResource(R.string.add_entry),
                            )
                        }
                    }
                },
            ) { innerPadding ->
                Column(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
                    ErrorText(state.error, onDismiss = { controller.dismissError() })

                    when (tab) {
                        VaultTab.SECURITY -> AuditContent(
                            entries = state.entries,
                            onOpenEntry = { entry ->
                                tab = VaultTab.VAULT
                                editing = entry
                            },
                            modifier = Modifier.padding(16.dp),
                        )

                        VaultTab.TOOLS -> ToolsContent(
                            biometricSupported = controller.biometricSupported,
                            biometricEnrolled = state.biometricEnrolled,
                            onSaveBackup = { saveBackup.launch(backupFileName) },
                            onRestoreBackup = { pickBackup.launch(arrayOf("*/*")) },
                            onExportCsv = { csvExportOpen = true },
                            onImportCsv = { pickCsv.launch(arrayOf("*/*")) },
                            onToggleBiometric = {
                                if (state.biometricEnrolled) {
                                    controller.forgetBiometricUnlock()
                                } else {
                                    val activity = context.findActivity()
                                    if (activity != null) {
                                        enableBiometric(activity, controller, biometricTitle, cancelLabel)
                                    }
                                }
                            },
                            onLock = { controller.lock() },
                        )

                        VaultTab.VAULT, VaultTab.SEARCH -> {
                            VaultSearchRow(
                                query = query,
                                onQueryChange = { query = it },
                                order = order,
                                onOrderChange = { order = it },
                                favoritesOnly = favoritesOnly,
                                onFavoritesChange = { favoritesOnly = it },
                                focus = searchFocus,
                            )
                            when {
                                state.entries.isEmpty() -> CenteredMessage(R.string.empty_vault)
                                // Entries exist, so an empty list means a search or a filter hid them.
                                sections.isEmpty() -> CenteredMessage(R.string.nothing_found)
                                else -> LazyColumn(
                                    modifier = Modifier.fillMaxSize(),
                                    contentPadding = PaddingValues(bottom = FAB_CLEARANCE),
                                ) {
                                    for (section in sections) {
                                        item(key = "head-${section.type}") {
                                            SectionHeader(
                                                label = EntryTypeUi.label(section.type),
                                                count = section.entries.size,
                                            )
                                        }
                                        items(section.entries, key = { it.id }) { entry ->
                                            EntryRow(entry, onClick = { editing = entry })
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // The search tab is the same list with the caret already in the field.
                LaunchedEffect(tab) {
                    if (tab == VaultTab.SEARCH) {
                        // The field may not be attached to the window yet on the first frame.
                        runCatching { searchFocus.requestFocus() }
                    }
                }
            }
        }

        if (typeMenuOpen) {
            RecordTypeMenu(
                onPick = { type ->
                    typeMenuOpen = false
                    newType = type ?: EntryTypes.PASSWORD
                    adding = true
                },
                onDismiss = { typeMenuOpen = false },
            )
        }
    }

    if (adding) {
        EntryDialog(
            // A new entry lands in the type that was picked and in the category that is being
            // filtered, if one is. Both pickers are still there to change it — they just start
            // where the user is looking.
            initial = Entry(
                id = "",
                type = newType,
                category = "",
            ),
            categories = categories,
            onDismiss = { adding = false },
            onSave = { controller.add(it); adding = false },
            onDelete = null,
        )
    }

    editing?.let { entry ->
        EntryDialog(
            initial = entry,
            categories = categories,
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

    if (csvExportOpen) {
        CsvExportDialog(
            onDismiss = { csvExportOpen = false },
            onConfirm = {
                csvExportOpen = false
                saveCsv.launch(csvFileName)
            },
        )
    }

    if (exitAsk) {
        AlertDialog(
            onDismissRequest = { exitAsk = false },
            title = { Text(stringResource(R.string.exit_title)) },
            text = { Text(stringResource(R.string.exit_message)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        exitAsk = false
                        context.findActivity()?.finish()
                    },
                ) { Text(stringResource(R.string.exit_confirm)) }
            },
            dismissButton = {
                TextButton(onClick = { exitAsk = false }) {
                    Text(stringResource(R.string.cancel))
                }
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

    val cipher = runCatching { KeystoreVaultKey.encryptionCipher() }.getOrNull()
    if (cipher == null) {
        // Said out loud rather than by doing nothing: a toggle that silently does nothing is
        // indistinguishable from a feature that does not work.
        Toast.makeText(
            activity,
            activity.getString(R.string.biometric_cannot_enable),
            Toast.LENGTH_LONG,
        ).show()
        return
    }

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
        onFailure = { message ->
            if (message != null) {
                Toast.makeText(activity, message, Toast.LENGTH_LONG).show()
            }
        },
    )
}

// ---- The list ----

/**
 * Search and favourites, in one line.
 *
 * The sort order lives inside the search field rather than in the bar: it changes what the same
 * list looks like, which is what the field is for. A category filter sat here too, and went with it:
 * with the list grouped by kind of record, narrowing it to one category is the editor's business.
 */
@Composable
private fun VaultSearchRow(
    query: String,
    onQueryChange: (String) -> Unit,
    order: SortOrder,
    onOrderChange: (SortOrder) -> Unit,
    favoritesOnly: Boolean,
    onFavoritesChange: (Boolean) -> Unit,
    focus: FocusRequester,
) {
    var sortOpen by remember { mutableStateOf(false) }

    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
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
                        IconButton(onClick = { sortOpen = true }) {
                            Icon(
                                imageVector = Icons.Filled.MoreVert,
                                contentDescription = stringResource(R.string.cd_sort),
                            )
                        }
                        DropdownMenu(expanded = sortOpen, onDismissRequest = { sortOpen = false }) {
                            DropdownMenuItem(
                                text = { Text(stringResource(R.string.sort_by_title)) },
                                onClick = {
                                    sortOpen = false
                                    onOrderChange(SortOrder.TITLE)
                                },
                            )
                            DropdownMenuItem(
                                text = { Text(stringResource(R.string.sort_by_recent)) },
                                onClick = {
                                    sortOpen = false
                                    onOrderChange(SortOrder.RECENT)
                                },
                            )
                        }
                    }
                }
            },
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier.weight(1f).focusRequester(focus),
        )

        IconButton(onClick = { onFavoritesChange(!favoritesOnly) }) {
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

    }
}

/**
 * The heading over one kind of record: what it is, and how much of it there is.
 *
 * The count is of what is on screen, so a search says how much it found under that kind rather than
 * how much the vault holds in total.
 */
@Composable
private fun SectionHeader(label: Int, count: Int) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = stringResource(label),
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f),
            maxLines = 1,
        )
        Text(
            text = count.toString(),
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

// ---- Adding an entry ----

/**
 * The record types, fanned out above the button that was pressed.
 *
 * A stack rather than a menu: choosing the kind of record is the first thing that happens when
 * adding one, and the app this screen copies makes the choice the shape of the button's answer.
 */
@Composable
private fun RecordTypeMenu(onPick: (String?) -> Unit, onDismiss: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.72f))
            // Tapping away closes it, with no ripple spreading across the whole screen.
            .clickable(interactionSource = interaction, indication = null) { onDismiss() },
    ) {
        Column(
            modifier = Modifier.align(Alignment.BottomEnd).padding(end = 20.dp, bottom = 96.dp),
            horizontalAlignment = Alignment.End,
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            val count = EntryTypes.all.size + 1
            for ((index, type) in EntryTypes.all.withIndex()) {
                RecordTypePill(
                    label = stringResource(EntryTypeUi.label(type)),
                    icon = EntryTypeUi.icon(type),
                    offset = fanOffset(index, count),
                    onClick = { onPick(type) },
                )
            }
            // Everything the dialog's own type picker offers, for a kind of record that is none of
            // the five above.
            RecordTypePill(
                label = stringResource(R.string.type_more),
                icon = Icons.Filled.MoreVert,
                offset = fanOffset(EntryTypes.all.size, count),
                onClick = { onPick(null) },
            )
        }

        FloatingActionButton(
            onClick = onDismiss,
            modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp),
        ) {
            Icon(
                imageVector = Icons.Filled.Close,
                contentDescription = stringResource(R.string.cancel),
            )
        }
    }
}

/**
 * How far left a pill in the fan sits.
 *
 * The middle of the stack stays furthest right and the ends pull left, which is what turns a column
 * of buttons into the curve the screen it copies shows. Pure arithmetic on two integers, so it needs
 * nothing from Compose but the unit.
 */
private fun fanOffset(index: Int, count: Int): Dp = -(abs(index - (count - 1) / 2f) * 12f).dp

@Composable
private fun RecordTypePill(
    label: String,
    icon: ImageVector,
    offset: Dp,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .offset(x = offset)
            .clip(RoundedCornerShape(50))
            .background(MaterialTheme.colorScheme.primary)
            .clickable(onClick = onClick)
            .padding(horizontal = 20.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimary)
        Text(
            text = label,
            color = MaterialTheme.colorScheme.onPrimary,
            style = MaterialTheme.typography.titleMedium,
            maxLines = 1,
        )
    }
}

// ---- The other two tabs ----

/**
 * Backup, export and the fingerprint, in one place.
 *
 * The same actions the drawer offers, which is where the app this is modelled on keeps them too:
 * the drawer is the shortcut, this is the page.
 */
@Composable
private fun ToolsContent(
    biometricSupported: Boolean,
    biometricEnrolled: Boolean,
    onSaveBackup: () -> Unit,
    onRestoreBackup: () -> Unit,
    onExportCsv: () -> Unit,
    onImportCsv: () -> Unit,
    onToggleBiometric: () -> Unit,
    onLock: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        ToolRow(R.string.backup_save, onSaveBackup)
        ToolRow(R.string.backup_restore, onRestoreBackup)
        ToolRow(R.string.csv_export, onExportCsv)
        ToolRow(R.string.csv_import, onImportCsv)
        if (biometricSupported) {
            ToolRow(
                label = if (biometricEnrolled) R.string.biometric_forget else R.string.biometric_enable,
                onClick = onToggleBiometric,
            )
        }
        ToolRow(R.string.lock, onLock)
    }
}

@Composable
private fun ToolRow(label: Int, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 20.dp, vertical = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = stringResource(label),
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.weight(1f),
        )
        Icon(
            imageVector = Icons.Filled.KeyboardArrowRight,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
}

// ---- A row ----

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
 * The circle next to an entry: the icon of its kind, on the colour its title hashes to.
 *
 * The kind rather than the service's real logo. Those are other people's trademarks, and fetching
 * one would mean asking the network about every record in the vault — which this app never does.
 * The colour is worked out from the title, so the same record looks the same on every device.
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
        Icon(
            imageVector = EntryTypeUi.icon(entry.type),
            contentDescription = stringResource(EntryTypeUi.label(entry.type)),
            tint = Color.White,
            modifier = Modifier.size(22.dp),
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
