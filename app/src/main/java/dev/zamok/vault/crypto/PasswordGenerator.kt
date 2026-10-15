package dev.zamok.vault.crypto

import java.security.SecureRandom
import java.util.Random

/**
 * The kinds of character a generated password can be built from.
 *
 * The symbol set leaves out quotes, backslashes, spaces, commas and semicolons on purpose: these
 * passwords get pasted into shells, URLs and spreadsheets, and a password that breaks the thing it
 * is pasted into is not a stronger password, just a lost one.
 */
enum class CharClass(val chars: String) {
    LOWERCASE("abcdefghijklmnopqrstuvwxyz"),
    UPPERCASE("ABCDEFGHIJKLMNOPQRSTUVWXYZ"),
    DIGITS("0123456789"),
    SYMBOLS("!@#\$%^&*()-_=+[]{}<>?"),
}

/**
 * Builds random passwords from the platform's [SecureRandom].
 *
 * [random] can be swapped for a seeded [Random] so a test can ask for a repeatable sequence.
 * Nothing but [SecureRandom] belongs in that argument in the app itself.
 */
object PasswordGenerator {

    /** The shortest password worth generating; below this, length stops being the point. */
    const val MIN_LENGTH = 8

    /** One instance, kept: re-seeding a fresh [SecureRandom] per password buys nothing. */
    private val secureRandom = SecureRandom()

    /**
     * A password of [length] characters that contains at least one character of every class in
     * [classes].
     *
     * Whole candidates are drawn uniformly from the combined pool and thrown away until one has a
     * character of each class. The alternative — place one character per class, fill the rest,
     * shuffle — is a well-known source of bias, because it favours the class with the fewest
     * characters; this way every password that satisfies the constraint is equally likely. At any
     * length a person would actually choose, the retry costs microseconds.
     */
    fun generate(
        length: Int,
        classes: Set<CharClass>,
        random: Random = secureRandom,
    ): String {
        require(classes.isNotEmpty()) { "A password needs at least one character class" }
        require(length >= classes.size) { "Too short to hold one character of each class" }

        val pool = classes.joinToString("") { it.chars }
        while (true) {
            val candidate = CharArray(length) { pool[random.nextInt(pool.length)] }
            if (classes.all { wanted -> candidate.any { it in wanted.chars } }) {
                return String(candidate)
            }
        }
    }
}
