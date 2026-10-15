package dev.zamok.vault.ui

import dev.zamok.vault.model.Entry
import dev.zamok.vault.model.host

/** How the list is ordered. */
enum class SortOrder { TITLE, RECENT }

/** One heading in the list: the entries sharing a category, in the order they are shown. */
data class EntryGroup(val category: String, val entries: List<Entry>)

/** Which of an entry's fields the second line of a row came from. */
enum class SubtitleKind { USERNAME, ADDRESS, PASSWORD, NONE }

data class Subtitle(val kind: SubtitleKind, val value: String)

/**
 * Everything the list screen derives from the entries.
 *
 * Pure on purpose: the screen holds the query, the chosen category and the sort order, and this
 * turns them into what is drawn. That is what makes the whole of it testable without a device —
 * and a list is exactly where the mistakes are easy to make and hard to notice.
 */
object EntryList {

    /**
     * What a password looks like on the list. Fixed width, so its real length never leaks: the list
     * is what anyone glancing at the screen sees.
     */
    const val PASSWORD_MASK = "••••••••"

    /**
     * Avatar colours, picked by title so a site keeps the same colour everywhere.
     *
     * Chosen to be readable under white text on the dark background rather than to be a rainbow.
     */
    private val AVATAR_COLORS = listOf(
        0xFF3B82F6, 0xFF8B5CF6, 0xFFEC4899, 0xFFF97316,
        0xFF10B981, 0xFF06B6D4, 0xFFEF4444, 0xFFEAB308,
    )

    /** Categories that actually occur, without blanks, each once, in a stable order. */
    fun categoriesOf(entries: List<Entry>): List<String> =
        entries.map { it.category.trim() }.filter { it.isNotEmpty() }.distinct().sorted()

    /**
     * The entries to draw, in the order to draw them.
     *
     * [category] is null for "all of them". A blank [query] matches everything; anything else is
     * searched across the title, login, address, notes and tags, which is what someone types when
     * they cannot quite remember how they named an entry.
     */
    fun apply(
        entries: List<Entry>,
        query: String = "",
        category: String? = null,
        favoritesOnly: Boolean = false,
        order: SortOrder = SortOrder.TITLE,
    ): List<Entry> {
        val needle = query.trim().lowercase()
        val matched = entries.filter { entry ->
            (!favoritesOnly || entry.favorite) &&
                (category == null || entry.category.trim() == category) &&
                (needle.isEmpty() || entry.matches(needle))
        }
        return when (order) {
            // The login breaks ties so that two entries with the same name do not swap places
            // between redraws.
            SortOrder.TITLE -> matched.sortedWith(
                compareBy({ it.title.lowercase() }, { it.username.lowercase() })
            )
            // Newest first: the entry changed most recently is usually the one being looked for.
            SortOrder.RECENT -> matched.sortedByDescending { it.updatedAt }
        }
    }

    /**
     * [entries] split under category headings.
     *
     * Groups keep the order [entries] already has. The uncategorised group — the empty category —
     * is always last: it is a leftover, not a place someone chose to put anything.
     */
    fun group(entries: List<Entry>): List<EntryGroup> {
        val byCategory = entries.groupBy { it.category.trim() }
        val named = byCategory.keys.filter { it.isNotEmpty() }.sorted()
        val groups = named.map { EntryGroup(it, byCategory.getValue(it)) }
        val uncategorized = byCategory[""].orEmpty()
        return if (uncategorized.isEmpty()) groups else groups + EntryGroup("", uncategorized)
    }

    /** The second line of a row: the login, else the address, else a masked password. */
    fun subtitleOf(entry: Entry): Subtitle = when {
        entry.username.isNotBlank() -> Subtitle(SubtitleKind.USERNAME, entry.username)
        entry.host.isNotBlank() -> Subtitle(SubtitleKind.ADDRESS, entry.host)
        entry.password.isNotEmpty() -> Subtitle(SubtitleKind.PASSWORD, PASSWORD_MASK)
        else -> Subtitle(SubtitleKind.NONE, "")
    }

    /** The letter in the avatar, or a placeholder for an entry that has no name yet. */
    fun initialOf(entry: Entry): String =
        entry.title.trim().take(1).uppercase().ifEmpty { "?" }

    /**
     * A colour for the avatar, depending only on the title.
     *
     * The sum of the code points rather than `hashCode()`, because this value decides what the user
     * sees: it has to be the same on every device and every run, and adding up characters is a
     * promise that is easy to keep.
     */
    fun avatarColorOf(entry: Entry): Long = colorFor(entry.title)

    /** The same colour by name, so a category dot matches the circle its entries get in the list. */
    fun colorFor(name: String): Long {
        val key = name.trim().lowercase()
        if (key.isEmpty()) return AVATAR_COLORS.first()
        val total = key.fold(0) { sum, character -> sum + character.code }
        return AVATAR_COLORS[total % AVATAR_COLORS.size]
    }

    /**
     * What the category picker offers: the categories already in use, plus the one this entry is in.
     *
     * A category nothing uses yet still has to be offered — an entry imported with a category the
     * user never typed keeps it that way. Sorted and without blanks, because a blank category is
     * "Без категории", which is a heading, not a choice.
     */
    fun categoryOptions(known: List<String>, current: String): List<String> =
        (known + current.trim()).filter { it.isNotEmpty() }.distinct().sorted()

    private fun Entry.matches(needle: String): Boolean =
        title.lowercase().contains(needle) ||
            username.lowercase().contains(needle) ||
            url.lowercase().contains(needle) ||
            notes.lowercase().contains(needle) ||
            tags.any { it.lowercase().contains(needle) }
}
