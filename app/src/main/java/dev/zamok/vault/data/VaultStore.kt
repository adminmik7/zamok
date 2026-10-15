package dev.zamok.vault.data

import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.nio.file.Files
import java.nio.file.StandardCopyOption

/**
 * Reads and writes the encrypted vault file.
 *
 * A write lands in a temporary file in the same directory and is then moved into place, so an
 * interruption can never leave a half-written vault: either the old file or the complete new one
 * is there. Losing a vault means losing every password in it, so this is not a place to save code.
 *
 * `java.nio.file` is available from API 26, which is this app's `minSdk`.
 */
class VaultStore(private val file: File) {

    /** True when a vault is present and not empty. */
    fun exists(): Boolean = file.isFile && file.length() > 0L

    /** @throws IOException if there is no vault to read. */
    fun read(): ByteArray {
        if (!file.isFile) throw IOException("No vault at ${file.absolutePath}")
        return file.readBytes()
    }

    /** Replaces the vault in one step. @throws IOException if it cannot be written. */
    fun write(bytes: ByteArray) {
        val directory = file.parentFile ?: throw IOException("Vault file has no directory: $file")
        if (!directory.isDirectory && !directory.mkdirs()) {
            throw IOException("Cannot create vault directory $directory")
        }

        val temporary = File(directory, file.name + ".tmp")
        try {
            FileOutputStream(temporary).use { output ->
                output.write(bytes)
                output.flush()
                // The rename below can otherwise be committed before the bytes are.
                output.fd.sync()
            }
            Files.move(
                temporary.toPath(),
                file.toPath(),
                StandardCopyOption.REPLACE_EXISTING,
                StandardCopyOption.ATOMIC_MOVE,
            )
        } finally {
            // A no-op once the move succeeded; cleanup when anything above threw.
            temporary.delete()
        }
    }
}
