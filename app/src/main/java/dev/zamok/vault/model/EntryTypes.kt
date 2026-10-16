package dev.zamok.vault.model

/**
 * The kinds of record the app knows.
 *
 * These strings are stored in the vault, so they are format rather than decoration: renaming one
 * would move every entry that carries it somewhere else. That is also why an unknown id is read as
 * a password record instead of being thrown away — a vault written by a later version still opens.
 */
object EntryTypes {

    const val PASSWORD = "password"
    const val CARD = "card"
    const val NOTE = "note"
    const val PASSPORT = "passport"

    /**
     * The kinds of record the app offers, in the order the list and the "add" menu show them in.
     *
     * There is no kind for a one-time code: a code belongs to the account it opens, and every record
     * already carries a code of its own. A vault that stored such records under the old id still
     * opens - normalise reads that id as an ordinary password record, with the code left in place.
     */
    val all = listOf(PASSWORD, CARD, NOTE, PASSPORT)

    /** What [id] counts as when drawing it: anything unknown is an ordinary record. */
    fun normalise(id: String): String = if (id in all) id else PASSWORD
}
