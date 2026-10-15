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
    const val ONE_TIME_CODE = "otp"
    const val CARD = "card"
    const val NOTE = "note"
    const val PASSPORT = "passport"

    /** The order the tabs and the "add" menu show them in. */
    val all = listOf(PASSWORD, ONE_TIME_CODE, CARD, NOTE, PASSPORT)

    /** What [id] counts as when drawing it: anything unknown is an ordinary record. */
    fun normalise(id: String): String = if (id in all) id else PASSWORD
}
