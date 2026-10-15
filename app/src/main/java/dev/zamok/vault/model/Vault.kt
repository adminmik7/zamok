package dev.zamok.vault.model

import kotlinx.serialization.Serializable

/**
 * Everything the vault holds, as it looks once decrypted.
 *
 * This wrapper exists so the payload is a self-describing object rather than a bare array: new
 * top-level data (settings, vault name) can be added later with a default and old files still open.
 */
@Serializable
data class Vault(
    val entries: List<Entry> = emptyList(),
)
