package dev.zamok.vault.data

import dev.zamok.vault.crypto.VaultCryptoException
import dev.zamok.vault.crypto.VaultFile
import dev.zamok.vault.crypto.VaultSession
import dev.zamok.vault.crypto.wipe
import dev.zamok.vault.model.Entry
import dev.zamok.vault.model.Vault
import java.io.File
import java.security.GeneralSecurityException
import java.util.UUID

private const val BIOMETRIC_FILE_SUFFIX = ".bio"

/**
 * The vault and everything that can be done to it.
 *
 * Every change is written to disk immediately, so there is no "save" the UI can forget and no
 * draft state to lose. Rewriting the file costs milliseconds at this scale.
 *
 * Nothing here is thread safe, and every call touches the disk — [create] and [unlock] also run
 * PBKDF2, about a second at the production iteration count. Call them off the main thread.
 */
class VaultRepository(
    private val store: VaultStore,
    private val biometricStore: VaultStore = VaultStore(
        File(store.file.parentFile, store.file.name + BIOMETRIC_FILE_SUFFIX)
    ),
    private val iterations: Int = VaultFile.DEFAULT_ITERATIONS,
    private val now: () -> Long = System::currentTimeMillis,
) {

    private var file: VaultFile? = null
    private var session: VaultSession? = null

    /** Entries of the unlocked vault, in stored order. Empty while locked. */
    var entries: List<Entry> = emptyList()
        private set

    val isUnlocked: Boolean get() = session != null

    fun vaultExists(): Boolean = store.exists()

    /**
     * Creates an empty vault and leaves it unlocked.
     *
     * @throws IllegalStateException if a vault is already there — an existing vault must never be
     * overwritten, that would take every password in it with it.
     */
    fun create(masterPassword: CharArray) {
        check(!vaultExists()) { "A vault already exists" }
        // A new vault gets a new vault key, so any biometric copy belongs to the old one.
        forgetBiometricUnlock()
        store.write(VaultFile.create(masterPassword, VaultCodec.encode(Vault()), iterations).encode())
        // Reopen what was just written instead of trusting the in-memory copy. It costs one extra
        // KDF run, once per vault, and proves the file on disk is really there and really opens.
        unlock(masterPassword)
    }

    /**
     * Opens the vault and loads its entries.
     *
     * @throws VaultCryptoException if the password is wrong or the file was altered.
     * @throws java.io.IOException if there is no vault to open.
     */
    fun unlock(masterPassword: CharArray) {
        lock()
        val openedFile = VaultFile.parse(store.read())
        val openedSession = openedFile.unlock(masterPassword)
        adopt(openedFile, openedSession)
    }

    /** Drops the vault key and the entries. Safe to call when already locked. */
    fun lock() {
        session?.close()
        session = null
        file = null
        entries = emptyList()
    }

    /**
     * Adds [entry] and returns it as stored. The id and timestamps it arrives with are ignored:
     * this is the one place that decides them, so ids cannot collide by accident.
     */
    fun add(entry: Entry): Entry {
        val activeSession = requireSession()
        val timestamp = now()
        val stored = entry.copy(
            id = UUID.randomUUID().toString(),
            createdAt = timestamp,
            updatedAt = timestamp,
        )
        commit(activeSession, entries + stored)
        return stored
    }

    /**
     * Replaces the entry carrying the same id, keeping its createdAt and refreshing updatedAt.
     *
     * @return the entry as stored.
     * @throws IllegalArgumentException if no entry has that id.
     */
    fun update(entry: Entry): Entry {
        val activeSession = requireSession()
        val index = entries.indexOfFirst { it.id == entry.id }
        require(index >= 0) { "No entry with id ${entry.id}" }

        val stored = entry.copy(createdAt = entries[index].createdAt, updatedAt = now())
        val updated = entries.toMutableList().also { it[index] = stored }
        commit(activeSession, updated)
        return stored
    }

    /** @throws IllegalArgumentException if no entry with that id exists. */
    fun delete(id: String) {
        val activeSession = requireSession()
        val remaining = entries.filterNot { it.id == id }
        require(remaining.size < entries.size) { "No entry with id $id" }
        commit(activeSession, remaining)
    }

    fun find(id: String): Entry? = entries.firstOrNull { it.id == id }

    /**
     * Re-wraps the vault key under [new]. Entries are not re-encrypted, so this stays quick.
     *
     * [current] is demanded even though the vault is already open, so that somebody holding an
     * unlocked phone cannot quietly take the vault over.
     *
     * @throws VaultCryptoException if [current] is wrong; the vault is then left untouched.
     */
    fun changePassword(current: CharArray, new: CharArray) {
        val currentFile = file ?: throw IllegalStateException("Vault is locked")
        val rotated = currentFile.changePassword(current, new, iterations)
        store.write(rotated.encode())
        // The vault key did not change, so the open session and any biometric copy stay good.
        file = rotated
    }

    // ---- Biometric unlock ----
    //
    // The vault key is also kept encrypted under a Keystore key that needs a fresh biometric
    // unlock. Everything Keystore-shaped stays out of this class: the caller performs the prompt
    // and passes two functions, so what is left here — which key gets stored, when it is dropped,
    // and what happens when it no longer fits — is the part worth testing.

    /** True when a biometric copy of the vault key is on disk. */
    fun biometricUnlockEnrolled(): Boolean = biometricStore.exists()

    /**
     * Stores a biometric-protected copy of the open vault's key.
     *
     * [seal] receives the raw vault key and returns the bytes to persist. It only runs while the
     * vault is unlocked, and what it produces is usable only after a biometric unlock.
     */
    fun enableBiometricUnlock(seal: (ByteArray) -> ByteArray) {
        val activeSession = requireSession()
        val vaultKey = activeSession.vaultKeyCopy()
        try {
            biometricStore.write(seal(vaultKey))
        } finally {
            vaultKey.wipe()
        }
    }

    /** Removes the biometric copy. The vault itself is untouched and still needs its password. */
    fun forgetBiometricUnlock() {
        biometricStore.delete()
    }

    /** The IV the stored copy was encrypted with, needed to build the decrypt cipher. Not secret. */
    fun biometricIv(): ByteArray =
        dev.zamok.vault.crypto.BiometricBlob.decode(biometricStore.read()).iv

    /**
     * Opens the vault with the vault key recovered by [open] from the stored biometric copy.
     *
     * @throws VaultCryptoException if the recovered key does not match this vault.
     * @throws java.security.GeneralSecurityException if the Keystore refused to release the key.
     */
    fun unlockWithBiometrics(open: (ByteArray) -> ByteArray) {
        lock()
        val vaultKey = try {
            open(biometricStore.read())
        } catch (failure: GeneralSecurityException) {
            // The Keystore refused to release the key — it was invalidated, usually because a new
            // fingerprint was enrolled. The copy can never be opened again.
            forgetBiometricUnlock()
            throw failure
        }

        try {
            val openedFile = VaultFile.parse(store.read())
            adopt(openedFile, openedFile.unlockWithVaultKey(vaultKey))
        } catch (failure: VaultCryptoException) {
            // The key came out of the Keystore but does not match this vault's payload: the copy
            // is for an older vault. Keeping it would leave the screen offering an unlock that is
            // guaranteed to fail. A plain I/O failure is different — the copy may still be good —
            // and that path rethrows without dropping anything.
            forgetBiometricUnlock()
            throw failure
        } finally {
            vaultKey.wipe()
        }
    }

    private fun requireSession(): VaultSession =
        session ?: throw IllegalStateException("Vault is locked")

    /**
     * Writes [updated] to disk and only then adopts it, so a failed write leaves the in-memory
     * state exactly as it was instead of showing the user a change that was never stored.
     */
    private fun commit(activeSession: VaultSession, updated: List<Entry>) {
        val written = activeSession.writePayload(VaultCodec.encode(Vault(updated)))
        store.write(written.encode())
        file = written
        entries = updated
    }

    /** Takes a freshly opened session into use, dropping it again if its payload cannot be read. */
    private fun adopt(openedFile: VaultFile, openedSession: VaultSession) {
        entries = try {
            VaultCodec.decode(openedSession.readPayload()).entries
        } catch (failure: Throwable) {
            // The session owns the vault key; do not leave it in memory because decoding failed.
            openedSession.close()
            throw failure
        }
        file = openedFile
        session = openedSession
    }
}
