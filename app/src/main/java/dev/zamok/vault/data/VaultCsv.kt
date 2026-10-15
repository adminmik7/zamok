package dev.zamok.vault.data

import dev.zamok.vault.model.Entry

/**
 * The mechanics of comma-separated values, RFC 4180.
 *
 * Written out rather than pulled in: the app has no CSV library, and the whole format is quoting.
 * What bites is quoted commas, doubled quotes and newlines inside a quoted field — the three cases
 * a `split(",")` gets wrong, and the three that get their own tests.
 */
internal object Csv {

    private const val BOM = '\uFEFF'

    /** Encodes [rows], quoting what has to be quoted and ending every row with CRLF. */
    fun encode(rows: List<List<String>>): String {
        val text = StringBuilder()
        for (row in rows) {
            text.append(row.joinToString(",") { escape(it) }).append("\r\n")
        }
        return text.toString()
    }

    /**
     * Reads [text] into rows, one list of cells per row.
     *
     * Accepts CRLF, LF and bare CR as the end of a row, keeps newlines that sit inside quotes,
     * ignores a byte order mark, and drops blank lines — which is what a trailing newline leaves.
     */
    fun parse(text: String): List<List<String>> {
        val body = if (text.startsWith(BOM)) text.substring(1) else text
        val rows = mutableListOf<List<String>>()
        var row = mutableListOf<String>()
        var field = StringBuilder()
        var quoted = false
        var index = 0

        fun endField() {
            row.add(field.toString())
            field = StringBuilder()
        }

        fun endRow() {
            endField()
            if (row.size > 1 || row[0].isNotEmpty()) rows.add(row)
            row = mutableListOf()
        }

        while (index < body.length) {
            val character = body[index]
            when {
                quoted && character != '"' -> {
                    field.append(character)
                    index++
                }
                // A quote inside a quoted field is written twice.
                quoted && index + 1 < body.length && body[index + 1] == '"' -> {
                    field.append('"')
                    index += 2
                }
                quoted -> {
                    quoted = false
                    index++
                }
                character == '"' -> {
                    quoted = true
                    index++
                }
                character == ',' -> {
                    endField()
                    index++
                }
                character == '\r' -> {
                    endRow()
                    index += if (index + 1 < body.length && body[index + 1] == '\n') 2 else 1
                }
                character == '\n' -> {
                    endRow()
                    index++
                }
                else -> {
                    field.append(character)
                    index++
                }
            }
        }
        if (field.isNotEmpty() || row.isNotEmpty()) endRow()

        return rows
    }

    private fun escape(field: String): String {
        // Quoted when the format demands it, and also when there is a space at either end: readers
        // are free to trim those away.
        val necessary = field.any { it == '"' || it == ',' || it == '\r' || it == '\n' } ||
            field != field.trim()
        return if (necessary) "\"${field.replace("\"", "\"\"")}\"" else field
    }
}

/** The entries an import produced, and how many rows were already in the vault. */
data class CsvImport(val entries: List<Entry>, val skipped: Int)

/**
 * The vault as a spreadsheet, for getting passwords in and out of other managers.
 *
 * This is the opposite of a backup in every way that matters: the [VaultFile][dev.zamok.vault.crypto.VaultFile]
 * backup is ciphertext that only Zamok can read, and this is plain text that anything can. That is
 * the point of it, and the reason the UI asks before writing one.
 */
object VaultCsv {

    /** The columns [export] writes, in order, and the fallback order for a file without a header. */
    private val COLUMNS = listOf(
        "title", "username", "password", "url", "notes", "category", "tags", "totp", "favorite",
    )

    /** Columns read when a file has no header row at all. */
    private val POSITIONAL = COLUMNS.take(5)

    /**
     * Column names seen in the wild, mapped to ours. The last three groups are what Chrome, KeePass
     * and Bitwarden write on export, so those files import without being edited first.
     */
    private val COLUMN_OF: Map<String, String> = buildMap {
        fun aliases(canonical: String, vararg names: String) {
            for (name in names) put(name, canonical)
        }
        aliases("title", "title", "name", "account")
        aliases("username", "username", "user", "user name", "login", "login name", "login_username")
        aliases("password", "password", "pass", "login_password")
        aliases("url", "url", "website", "web site", "login_uri", "site")
        aliases("notes", "notes", "note", "comment", "comments", "extra")
        aliases("category", "category", "folder", "grouping", "group")
        aliases("tags", "tags", "tag")
        aliases("totp", "totp", "otp", "otpauth", "login_totp", "2fa")
        aliases("favorite", "favorite", "favourite", "fav", "starred")
    }

    private val TRUE_VALUES = setOf("1", "true", "yes", "y", "t", "да")

    /**
     * Every entry as a row, with the password in the clear.
     *
     * The byte order mark is on purpose: without it Excel on Windows reads UTF-8 as the local code
     * page and Cyrillic comes out as gibberish. Every other reader skips it.
     */
    fun export(entries: List<Entry>): String {
        val rows = mutableListOf<List<String>>()
        rows.add(COLUMNS)
        for (entry in entries) {
            rows.add(
                listOf(
                    entry.title,
                    entry.username,
                    entry.password,
                    entry.url,
                    entry.notes,
                    entry.category,
                    entry.tags.joinToString("; "),
                    entry.totpSecret,
                    if (entry.favorite) "1" else "0",
                )
            )
        }
        return "\uFEFF" + Csv.encode(rows)
    }

    /**
     * Reads [text] into entries, skipping any that [existing] or an earlier row of the same file
     * already holds.
     *
     * Two rows are the same account when the title, login, address and password all match. The
     * point is that importing the same file twice is harmless, rather than a vault full of
     * duplicates that has to be cleaned by hand.
     */
    fun parse(text: String, existing: List<Entry> = emptyList()): CsvImport {
        val rows = Csv.parse(text)
        if (rows.isEmpty()) return CsvImport(emptyList(), 0)

        val header = rows.first().map { it.trim().lowercase() }
        val hasHeader = header.any { it in COLUMN_OF }
        val columnAt: Map<String, Int> = if (hasHeader) {
            header.mapIndexedNotNull { index, name -> COLUMN_OF[name]?.let { it to index } }.toMap()
        } else {
            POSITIONAL.mapIndexed { index, name -> name to index }.toMap()
        }

        val seen = existing.map { it.identity() }.toMutableSet()
        val entries = mutableListOf<Entry>()
        var skipped = 0

        for (row in if (hasHeader) rows.drop(1) else rows) {
            val entry = entryOf(row, columnAt)
            // A row with nothing in it is what a stray separator leaves behind, not an account.
            if (entry.title.isBlank() && entry.username.isBlank() && entry.password.isEmpty()) continue
            if (!seen.add(entry.identity())) {
                skipped++
                continue
            }
            entries.add(entry)
        }

        return CsvImport(entries, skipped)
    }

    private fun entryOf(cells: List<String>, columnAt: Map<String, Int>): Entry {
        // The password is the one cell that is never trimmed: a space can be part of it.
        fun cell(name: String): String = columnAt[name]?.let { cells.getOrNull(it) }?.trim().orEmpty()
        fun raw(name: String): String = columnAt[name]?.let { cells.getOrNull(it) }.orEmpty()

        return Entry(
            id = "",
            title = cell("title"),
            username = cell("username"),
            password = raw("password"),
            url = cell("url"),
            notes = cell("notes"),
            category = cell("category"),
            tags = raw("tags").split(';', ',').map { it.trim() }.filter { it.isNotEmpty() },
            totpSecret = cell("totp"),
            favorite = cell("favorite").lowercase() in TRUE_VALUES,
        )
    }

    /** What makes two rows the same account. Trimmed, because a spreadsheet pads. */
    private fun Entry.identity(): List<String> =
        listOf(title.trim(), username.trim(), url.trim(), password)
}
