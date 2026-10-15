package dev.zamok.vault.ui

import dev.zamok.vault.model.Entry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The list screen's whole behaviour, with no device in sight: what the search finds, what the
 * filters keep, the order things come out in, and how a row is described.
 */
class EntryListTest {

    private fun entry(
        id: String,
        title: String = "",
        username: String = "",
        password: String = "",
        url: String = "",
        notes: String = "",
        category: String = "",
        tags: List<String> = emptyList(),
        favorite: Boolean = false,
        updatedAt: Long = 0L,
    ) = Entry(
        id = id,
        title = title,
        username = username,
        password = password,
        url = url,
        notes = notes,
        category = category,
        tags = tags,
        favorite = favorite,
        updatedAt = updatedAt,
    )

    // ---- search ----

    @Test
    fun `search looks in the title, the login and the address`() {
        val entries = listOf(
            entry("1", title = "Chase", username = "emily@example.com"),
            entry("2", title = "Dropbox", url = "https://dropbox.com/login"),
            entry("3", title = "Почта", notes = "рабочий ящик"),
        )

        assertEquals(listOf("1"), EntryList.apply(entries, query = "cha").map { it.id })
        assertEquals(listOf("1"), EntryList.apply(entries, query = "emily").map { it.id })
        assertEquals(listOf("2"), EntryList.apply(entries, query = "dropbox.com").map { it.id })
        assertEquals(listOf("3"), EntryList.apply(entries, query = "рабочий").map { it.id })
    }

    @Test
    fun `search finds an entry by one of its tags`() {
        val entries = listOf(entry("1", title = "Банк", tags = listOf("финансы")))

        assertEquals(listOf("1"), EntryList.apply(entries, query = "финанс").map { it.id })
    }

    @Test
    fun `search ignores case and surrunding spaces`() {
        val entries = listOf(entry("1", title = "Netflix"))

        assertEquals(listOf("1"), EntryList.apply(entries, query = "  NETFLIX  ").map { it.id })
    }

    @Test
    fun `an empty search keeps everything`() {
        val entries = listOf(entry("1", title = "A"), entry("2", title = "B"))

        assertEquals(2, EntryList.apply(entries, query = "   ").size)
    }

    @Test
    fun `a search that matches nothing returns nothing`() {
        val entries = listOf(entry("1", title = "Netflix"))

        assertTrue(EntryList.apply(entries, query = "нет-такого").isEmpty())
    }

    // ---- filters ----

    @Test
    fun `the favorites filter keeps only the starred entries`() {
        val entries = listOf(
            entry("1", title = "A", favorite = true),
            entry("2", title = "B"),
        )

        val shown = EntryList.apply(entries, favoritesOnly = true)

        assertEquals(listOf("1"), shown.map { it.id })
    }

    @Test
    fun `the category filter keeps only that category`() {
        val entries = listOf(
            entry("1", title = "A", category = "Банк"),
            entry("2", title = "B", category = "Почта"),
            entry("3", title = "C"),
        )

        assertEquals(listOf("1"), EntryList.apply(entries, category = "Банк").map { it.id })
    }

    @Test
    fun `the search and the filters apply together`() {
        val entries = listOf(
            entry("1", title = "Chase", category = "Банк", favorite = true),
            entry("2", title = "Chase", category = "Банк"),
            entry("3", title = "Chase", category = "Почта", favorite = true),
        )

        val shown = EntryList.apply(entries, query = "chase", category = "Банк", favoritesOnly = true)

        assertEquals(listOf("1"), shown.map { it.id })
    }

    @Test
    fun `categories are listed once each and without the blank ones`() {
        val entries = listOf(
            entry("1", category = "Почта"),
            entry("2", category = "Банк"),
            entry("3", category = "Почта"),
            entry("4"),
            entry("5", category = "   "),
        )

        assertEquals(listOf("Банк", "Почта"), EntryList.categoriesOf(entries))
    }

    // ---- order ----

    @Test
    fun `sorting by title ignores case`() {
        val entries = listOf(
            entry("1", title = "banana"),
            entry("2", title = "Apple"),
            entry("3", title = "cherry"),
        )

        assertEquals(listOf("2", "1", "3"), EntryList.apply(entries).map { it.id })
    }

    @Test
    fun `sorting by title breaks ties with the login`() {
        val entries = listOf(
            entry("1", title = "Google", username = "zzz@example.com"),
            entry("2", title = "Google", username = "aaa@example.com"),
        )

        assertEquals(listOf("2", "1"), EntryList.apply(entries).map { it.id })
    }

    @Test
    fun `sorting by recent puts the entry changed last on top`() {
        val entries = listOf(
            entry("1", title = "старая", updatedAt = 100),
            entry("2", title = "новая", updatedAt = 300),
            entry("3", title = "средняя", updatedAt = 200),
        )

        val shown = EntryList.apply(entries, order = SortOrder.RECENT)

        assertEquals(listOf("2", "3", "1"), shown.map { it.id })
    }

    // ---- groups ----

    @Test
    fun `entries are grouped by category and the uncategorised ones come last`() {
        val entries = listOf(
            entry("1", title = "A", category = "Почта"),
            entry("2", title = "B", category = "Банк"),
            entry("3", title = "C"),
        )

        val groups = EntryList.group(entries)

        assertEquals(listOf("Банк", "Почта", ""), groups.map { it.category })
    }

    @Test
    fun `a group holds its own entries, keeping the order they arrived in`() {
        val entries = listOf(
            entry("1", title = "A", category = "Банк"),
            entry("2", title = "B", category = "Банк"),
            entry("3", title = "C"),
        )

        val groups = EntryList.group(entries)

        assertEquals(listOf("1", "2"), groups.first().entries.map { it.id })
    }

    @Test
    fun `with no categories at all there is one group and it is the uncategorised one`() {
        val entries = listOf(entry("1", title = "A"), entry("2", title = "B"))

        val groups = EntryList.group(entries)

        assertEquals(1, groups.size)
        assertEquals("", groups.first().category)
    }

    // ---- a row ----

    @Test
    fun `the second line prefers the login, then the address, then the password`() {
        val withLogin = entry("1", username = "emily@example.com", url = "https://chase.com", password = "x")
        val withAddressOnly = entry("2", url = "https://www.chase.com/login", password = "x")
        val passwordOnly = entry("3", password = "x")

        assertEquals(SubtitleKind.USERNAME, EntryList.subtitleOf(withLogin).kind)
        assertEquals("emily@example.com", EntryList.subtitleOf(withLogin).value)

        // The host, not the whole address, and without the `www.`.
        assertEquals("chase.com", EntryList.subtitleOf(withAddressOnly).value)

        assertEquals(SubtitleKind.PASSWORD, EntryList.subtitleOf(passwordOnly).kind)
    }

    @Test
    fun `the password is never shown on the list`() {
        val subtitle = EntryList.subtitleOf(entry("1", password = "hunter2"))

        assertEquals(EntryList.PASSWORD_MASK, subtitle.value)
        assertTrue("the real password must not be on screen", !subtitle.value.contains("hunter2"))
    }

    @Test
    fun `an entry with nothing but a title has no second line`() {
        assertEquals(SubtitleKind.NONE, EntryList.subtitleOf(entry("1", title = "A")).kind)
    }

    // ---- avatar ----

    @Test
    fun `the same title always gets the same colour`() {
        val again = entry("2", title = "Google", username = "other@example.com")

        assertEquals(
            EntryList.avatarColorOf(entry("1", title = "Google")),
            EntryList.avatarColorOf(again),
        )
    }

    @Test
    fun `the colour depends on nothing but the title`() {
        val plain = entry("1", title = "Google")
        val starred = entry("2", title = "Google", favorite = true, category = "Почта", updatedAt = 5)

        assertEquals(EntryList.avatarColorOf(plain), EntryList.avatarColorOf(starred))
    }

    @Test
    fun `two different titles can still be told apart`() {
        // Not a guarantee of the hash, just a check that it is not a constant.
        assertNotEquals(
            EntryList.avatarColorOf(entry("1", title = "Google")),
            EntryList.avatarColorOf(entry("2", title = "Netflix")),
        )
    }

    @Test
    fun `the initial is the first letter, uppercased`() {
        assertEquals("G", EntryList.initialOf(entry("1", title = "google")))
        assertEquals("П", EntryList.initialOf(entry("2", title = "Почта")))
    }

    @Test
    fun `an entry without a title still shows something`() {
        assertEquals("?", EntryList.initialOf(entry("1", title = "   ")))
    }

    // ---- the category picker ----

    @Test
    fun `the category options offer what is in use plus the one being edited`() {
        assertEquals(listOf("Банк", "Работа"), EntryList.categoryOptions(listOf("Банк"), "Работа"))
    }

    @Test
    fun `the category options are sorted, unique and without blanks`() {
        assertEquals(
            listOf("Банк", "Почта"),
            EntryList.categoryOptions(listOf("Почта", "Банк", "Почта"), "   "),
        )
    }

    @Test
    fun `an empty vault offers no categories`() {
        assertTrue(EntryList.categoryOptions(emptyList(), "").isEmpty())
    }

    @Test
    fun `the same name gives the same colour on an avatar and on a category dot`() {
        assertEquals(EntryList.avatarColorOf(entry("1", title = "Банк")), EntryList.colorFor("банк"))
    }
}
