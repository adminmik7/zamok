package dev.zamok.vault.data

import dev.zamok.vault.model.Entry
import java.net.URI

/** Why a stored password is worth changing. */
enum class WeakReason {
    /** A password that appears on every list of what people actually pick. */
    COMMON,

    /** Short enough that it falls to guessing regardless of what is in it. */
    TOO_SHORT,

    /** One character, repeated. */
    REPEATED,

    /** A straight run: 1234, abcd, qwerty. */
    SEQUENCE,

    /** Contains the site, the login or part of the address it belongs to. */
    PERSONAL,
}

/** An entry whose password one of the rules disliked, and which ones. */
data class WeakPassword(val entry: Entry, val reasons: Set<WeakReason>)

/**
 * Entries sharing one password.
 *
 * The password itself is deliberately not carried: this report is built for the screen, and there
 * is no reason to hand the text around any further than the grouping needs.
 */
data class ReusedPassword(val entries: List<Entry>)

data class AuditReport(val weak: List<WeakPassword>, val reused: List<ReusedPassword>) {
    val isEmpty: Boolean get() = weak.isEmpty() && reused.isEmpty()
}

/**
 * Judges the passwords already in the vault.
 *
 * ponytail: this is a set of explainable rules, not a strength estimator. It answers "is this one of
 * the obvious mistakes", which is what a person can act on, and it never says a password is strong —
 * only that none of the rules had anything to say. A real estimator (zxcvbn and friends) needs a
 * large frequency corpus and a new dependency; that is the upgrade path if the verdict ever has to
 * be trusted rather than used as a nudge.
 */
object PasswordAudit {

    /** Below this, no amount of variety survives a guessing attack. */
    const val MIN_LENGTH = 8

    /** Shorter terms than this match too much by accident to be evidence of anything. */
    private const val MIN_TERM_LENGTH = 4

    /** A run has to be at least this long before it is worth mentioning. */
    private const val MIN_RUN_LENGTH = 4

    private const val KEYBOARD_ROWS = "qwertyuiop|asdfghjkl|zxcvbnm|1234567890"

    /**
     * A short list of what people actually type, not a cracking dictionary.
     *
     * ponytail: hand-listed, so it only catches the famous ones. Ceiling: no coverage of passwords
     * leaked in some particular breach. Upgrade path: a bundled Bloom filter of a leaked-password
     * corpus, checked offline.
     */
    private val COMMON_PASSWORDS = setOf(
        "1234", "12345", "123456", "1234567", "12345678", "123456789", "1234567890",
        "000000", "111111", "121212", "123123", "654321", "666666", "7777777",
        "abc123", "abcd1234", "admin", "administrator", "asdfgh", "asdfghjkl",
        "baseball", "batman", "dragon", "football", "freedom", "hello", "iloveyou",
        "letmein", "login", "love", "master", "michael", "monkey", "passw0rd",
        "password", "password1", "password123", "p@ssw0rd", "princess", "qazwsx",
        "qwerty", "qwerty123", "qwertyuiop", "root", "shadow", "starwars",
        "sunshine", "superman", "trustno1", "welcome", "whatever", "zaq12wsx",
    )

    fun report(entries: List<Entry>): AuditReport {
        val weak = entries.mapNotNull { entry ->
            val reasons = assess(entry)
            if (reasons.isEmpty()) null else WeakPassword(entry, reasons)
        }

        val reused = entries
            .filter { it.password.isNotEmpty() }
            .groupBy { it.password }
            .values
            .filter { it.size > 1 }
            .map { ReusedPassword(it) }

        return AuditReport(weak, reused)
    }

    /**
     * The reasons [entry]'s password is worth changing. Empty means none of the rules applied.
     *
     * An empty password is not judged: an entry that only holds a code, or one just created, has
     * nothing to change.
     */
    fun assess(entry: Entry): Set<WeakReason> {
        val password = entry.password
        if (password.isEmpty()) return emptySet()

        val lowered = password.lowercase()
        val reasons = mutableSetOf<WeakReason>()

        if (lowered in COMMON_PASSWORDS) reasons += WeakReason.COMMON
        if (password.length < MIN_LENGTH) reasons += WeakReason.TOO_SHORT
        if (isRepeated(password)) reasons += WeakReason.REPEATED
        if (isRun(lowered)) reasons += WeakReason.SEQUENCE
        if (mentionsItsOwnEntry(entry, lowered)) reasons += WeakReason.PERSONAL

        return reasons
    }

    private fun isRepeated(password: String): Boolean = password.all { it == password[0] }

    /** A monotone run of adjacent characters, or a walk along one row of the keyboard. */
    private fun isRun(lowered: String): Boolean {
        if (lowered.length < MIN_RUN_LENGTH) return false

        val deltas = lowered.zipWithNext { previous, next -> next.code - previous.code }
        if (deltas.all { it == 1 } || deltas.all { it == -1 }) return true

        // Rows are joined with a separator so a run cannot span two of them.
        return KEYBOARD_ROWS.split('|').any { row -> row.contains(lowered) || row.reversed().contains(lowered) }
    }

    private fun mentionsItsOwnEntry(entry: Entry, lowered: String): Boolean =
        termsOf(entry).any { lowered.contains(it) }

    /**
     * The words inside the password that would give it away: what the entry is called, the login,
     * and each part of the address.
     *
     * The address contributes its separate labels rather than the whole host, so that a password
     * built around "example" is caught in `example.com` — nobody puts the dot in.
     */
    private fun termsOf(entry: Entry): List<String> {
        val labels = hostOf(entry.url).split('.').filter { it.isNotEmpty() }
        return (listOf(entry.title, entry.username) + labels)
            .map { it.trim().lowercase() }
            .filter { it.length >= MIN_TERM_LENGTH }
    }

    private fun hostOf(url: String): String {
        if (url.isBlank()) return ""
        // A host only comes back when the address carries a scheme; otherwise take the leading part.
        val host = runCatching { URI(url).host }.getOrNull()
            ?: url.substringBefore('/').substringAfter("://")
        return host.removePrefix("www.")
    }
}
