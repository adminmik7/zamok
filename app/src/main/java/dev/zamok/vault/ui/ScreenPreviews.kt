package dev.zamok.vault.ui

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.material3.MaterialTheme
import dev.zamok.vault.model.Entry
import dev.zamok.vault.model.EntryField
import dev.zamok.vault.model.EntryTypes

@Composable
private fun VaultPreview(content: @Composable () -> Unit) {
    ZamokTheme {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = MaterialTheme.colorScheme.background,
            contentColor = MaterialTheme.colorScheme.onBackground,
        ) {
            content()
        }
    }
}

/** The list screen: empty, populated with one record of each kind, and with a search typed. */
@Preview(showBackground = false, name = "Список — пустой")
@Composable
fun PreviewListEmpty() = VaultPreview {
    EntryListScreen(
        entries = emptyList(),
        query = "",
        onQueryChange = {},
        order = SortOrder.TITLE,
        onOrderChange = {},
        favoritesOnly = false,
        onFavoritesChange = {},
        onEntryClick = {},
        onAdd = { },
        focus = remember { FocusRequester() },
    )
}

@Preview(showBackground = false, name = "Список — пароли, карты, паспорт, заметка")
@Composable
fun PreviewList() = VaultPreview {
    EntryListScreen(
        entries = listOf(
            Entry(id = "1", title = "Почта", username = "galakoshka235@gmail.com", password = "hunter2", favorite = true),
            Entry(id = "2", title = "Банк", username = "user77", password = "q1w2e3r4"),
            Entry(id = "c1", type = EntryTypes.CARD, title = "Золотая", fields = listOf(
                EntryField("Номер", "•••• •••• •••• 4567"),
                EntryField("Владелец", "СПОБИНГ"),
                EntryField("Срок действия", "12/72"),
                EntryField("CVV", "•••"),
                EntryField("PIN", "••••"),
            )),
            Entry(id = "p1", type = EntryTypes.PASSPORT, title = "Загранпаспорт", fields = listOf(
                EntryField("Фамилия", "ИВАНОВ"),
                EntryField("Имя", "ИВАН"),
                EntryField("Отчество", "ИВАНОВИЧ"),
                EntryField("Номер", "1234 № 567890"),
                EntryField("Кем выдан", "ОВД Москвы"),
                EntryField("Когда выдан", "01.09.2010"),
            )),
            Entry(id = "3", title = "Заметка", type = EntryTypes.NOTE, notes = "Код от гаража: 1122"),
        ),
        query = "",
        onQueryChange = {},
        order = SortOrder.TITLE,
        onOrderChange = {},
        favoritesOnly = false,
        onFavoritesChange = {},
        onEntryClick = {},
        onAdd = { },
        focus = remember { FocusRequester() },
    )
}

@Preview(showBackground = false, name = "Список — поиск карт")
@Composable
fun PreviewListSearch() = VaultPreview {
    EntryListScreen(
        entries = listOf(
            Entry(id = "c1", type = EntryTypes.CARD, title = "Золотая", fields = listOf(
                EntryField("Номер", "•••• •••• •••• 4567"),
                EntryField("Владелец", "СПОБИНГ"),
                EntryField("Срок действия", "12/72"),
                EntryField("CVV", "•••"),
                EntryField("PIN", "••••"),
            )),
        ),
        query = "карта",
        onQueryChange = {},
        order = SortOrder.TITLE,
        onOrderChange = {},
        favoritesOnly = false,
        onFavoritesChange = {},
        onEntryClick = {},
        onAdd = { },
        focus = remember { FocusRequester() },
    )
}

/** The viewing screen: password, card, passport, note. */
@Preview(showBackground = false, name = "Просмотр — пароль")
@Composable
fun PreviewEntryPassword() = VaultPreview {
    EntryView(
        entry = Entry(
            id = "1",
            title = "Почта",
            username = "galakoshka235@gmail.com",
            password = "hunter2",
            url = "https://mail.example.com",
            notes = "Двухфакторная проверка включена",
        ),
        onChange = { },
        onEdit = { },
        onDelete = { },
        onBack = { },
    )
}

@Preview(showBackground = false, name = "Просмотр — платёжная карта")
@Composable
fun PreviewEntryCard() = VaultPreview {
    EntryView(
        entry = Entry(
            id = "c1",
            type = EntryTypes.CARD,
            title = "Золотая",
            fields = listOf(
                EntryField("Номер", "4111 1111 1111 1111"),
                EntryField("Владелец", "СПОБИНГ"),
                EntryField("Срок действия", "12/72"),
                EntryField("CVV", "737"),
                EntryField("PIN", "3141"),
            ),
        ),
        onChange = { },
        onEdit = { },
        onDelete = { },
        onBack = { },
    )
}

@Preview(showBackground = false, name = "Просмотр — паспорт")
@Composable
fun PreviewEntryPassport() = VaultPreview {
    EntryView(
        entry = Entry(
            id = "p1",
            type = EntryTypes.PASSPORT,
            title = "Загранпаспорт",
            fields = listOf(
                EntryField("Фамилия", "ИВАНОВ"),
                EntryField("Имя", "ИВАН"),
                EntryField("Отчество", "ИВАНОВИЧ"),
                EntryField("Номер", "1234 № 567890"),
                EntryField("Кем выдан", "ОВД Москвы"),
                EntryField("Когда выдан", "01.09.2010"),
            ),
        ),
        onChange = { },
        onEdit = { },
        onDelete = { },
        onBack = { },
    )
}

@Preview(showBackground = false, name = "Просмотр — заметка")
@Composable
fun PreviewEntryNote() = VaultPreview {
    EntryView(
        entry = Entry(id = "3", type = EntryTypes.NOTE, title = "Заметка", notes = "Код от гаража: 1122"),
        onChange = { },
        onEdit = { },
        onDelete = { },
        onBack = { },
    )
}

/** The full form: creating a card and editing a password. */
@Preview(showBackground = false, name = "Форма — новая карта")
@Composable
fun PreviewDialogNewCard() = VaultPreview {
    EntryDialog(
        initial = Entry(id = "", type = EntryTypes.CARD, title = ""),
        categories = emptyList(),
        onDismiss = { },
        onSave = { },
        onDelete = null,
    )
}

@Preview(showBackground = false, name = "Форма — правка пароля")
@Composable
fun PreviewDialogEdit() = VaultPreview {
    EntryDialog(
        initial = Entry(
            id = "1",
            title = "Почта",
            username = "galakoshka235@gmail.com",
            password = "hunter2",
            url = "https://mail.example.com",
            notes = "Двухфакторная проверка включена",
            favorite = true,
        ),
        categories = listOf("Личное", "Работа"),
        onDismiss = { },
        onSave = { },
        onDelete = { },
    )
}
