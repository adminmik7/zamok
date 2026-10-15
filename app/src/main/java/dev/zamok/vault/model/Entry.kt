package dev.zamok.vault.model

import kotlinx.serialization.Serializable

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
    val title: String = "",
    val username: String = "",
    val password: String = "",
    val url: String = "",
    val notes: String = "",
    val category: String = "",
    val tags: List<String> = emptyList(),
    val totpSecret: String = "",
    val favorite: Boolean = false,
    val createdAt: Long = 0L,
    val updatedAt: Long = 0L,
)
