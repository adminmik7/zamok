package dev.zamok.vault.data

import dev.zamok.vault.model.Vault
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json

/**
 * Maps the decrypted payload of a vault file to a [Vault] and back.
 *
 * The result of [encode] is handed straight to the crypto layer and never written to disk on its
 * own, so the vault text is only ever readable while the vault is unlocked.
 */
object VaultCodec {

    private val json = Json {
        // Write defaults too: the file stays readable, and a field that exists is never a surprise.
        encodeDefaults = true
        // A vault written by a newer build may carry fields this one knows nothing about. Read past
        // them instead of refusing to open the vault.
        ignoreUnknownKeys = true
    }

    fun encode(vault: Vault): ByteArray =
        json.encodeToString(Vault.serializer(), vault).toByteArray(Charsets.UTF_8)

    /**
     * @throws SerializationException if [bytes] are not vault JSON. Decryption has already
     * succeeded by the time this runs, so this signals a bug or a format change, not tampering.
     */
    fun decode(bytes: ByteArray): Vault =
        json.decodeFromString(Vault.serializer(), String(bytes, Charsets.UTF_8))
}
