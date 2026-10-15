package dev.zamok.vault.model

import kotlinx.serialization.Serializable
import java.net.URI

/**
 * One record in the vault.
 *
 * Every field except [id] has a default on purpose: kotlinx.serialization fills missing fields in
 * from these defaults, so a vault written by an older build still opens after a field is added.
 * Dropping a field is what needs a format version bump.
 *
 * Secrets here are plain [String]s and therefore immutable copies that Kotlin cannot wipe. They
 * only ever exist while the vault is unlocked, and they never reach disk in this form — the whole
 * vault is encrypted as one blob. Making them wipeable would mean byte arrays and a lot of manual
 * lifetime management; not worth it at this scale.
 */
@Serializable
data class Entry(
    val id: String,
    /**
     * What kind of record this is, an id from [EntryTypes].
     *
     * A plain string rather than an enum, and carrying a default: the file is written by whichever
     * version of the app is installed, so a type this build has never heard of has to load and keep
     * its value rather than fail the whole vault. [EntryTypes.normalise] decides how to draw one.
     */
    val type: String = EntryTypes.PASSWORD,
    val title: String = "",
    val username: String = "",
    val password: String = "",
    val url: String = "",
    val notes: String = "",
    val category: String = "",
    val tags: List<String> = emptyList(),
    /**
     * The record's own fields, for the kinds of record that have their own set of them.
     *
     * A list of labelled values rather than one named property per document type: a card and a
     * passport want different things, and named properties would mean every entry carrying every
     * type's fields, each needing its own plumbing, for values most entries never fill in.
     */
    val fields: List<EntryField> = emptyList(),
    val totpSecret: String = "",
    val favorite: Boolean = false,
    val createdAt: Long = 0L,
    val updatedAt: Long = 0L,
)

/**
 * One labelled box on a record: what it is called, and what is in it.
 *
 * The label is stored text rather than an id from [EntryTypes], so a field imported from another
 * program keeps whatever it was called there.
 */
@Serializable
data class EntryField(
    val label: String = "",
    val value: String = "",
)

/**
 * The host of [url], without the scheme or a leading `www.`, or "" when there is no address.
 *
 * A computed property rather than a field, so nothing about the stored format changes. It is
 * deliberately forgiving: people paste `example.com`, `https://example.com/login` and
 * `www.example.com` and mean the same site by all three.
 */
val Entry.host: String
    get() {
        if (url.isBlank()) return ""
        // A host only comes back when the address carries a scheme; otherwise the leading part.
        val parsed = runCatching { URI(url).host }.getOrNull()
        val host = parsed ?: url.substringBefore('/').substringAfter("://")
        return host.removePrefix("www.")
    }
