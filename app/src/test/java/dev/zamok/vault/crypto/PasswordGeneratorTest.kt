package dev.zamok.vault.crypto

import java.util.Random
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class PasswordGeneratorTest {

    private val allClasses = CharClass.entries.toSet()

    @Test
    fun `has the requested length`() {
        for (length in 8..40) {
            assertEquals(length, PasswordGenerator.generate(length, allClasses).length)
        }
    }

    @Test
    fun `uses nothing but the chosen classes`() {
        val chosen = setOf(CharClass.LOWERCASE, CharClass.DIGITS)

        repeat(50) {
            val password = PasswordGenerator.generate(32, chosen)
            assertTrue(password.all { it in CharClass.LOWERCASE.chars || it in CharClass.DIGITS.chars })
        }
    }

    @Test
    fun `always contains every chosen class`() {
        // This is the promise the whole generator rests on: a site that demands a digit and a
        // symbol must never be handed a password without them.
        repeat(200) {
            val password = PasswordGenerator.generate(16, allClasses)
            for (charClass in allClasses) {
                assertTrue(
                    "missing ${charClass.name} in $password",
                    password.any { it in charClass.chars },
                )
            }
        }
    }

    @Test
    fun `the first character is not tied to one class`() {
        // Guards the rejected implementation: forcing one character per class and filling the rest
        // would make the first character always come from the first class. Over a hundred draws,
        // a digit or a symbol turning up first is close to certain for a fair generator.
        val firstCharacters = List(100) { PasswordGenerator.generate(16, allClasses).first() }

        assertTrue(firstCharacters.any { it.isDigit() })
        assertTrue(firstCharacters.any { it in CharClass.SYMBOLS.chars })
    }

    @Test
    fun `one class alone gives that class alone`() {
        repeat(20) {
            val password = PasswordGenerator.generate(20, setOf(CharClass.DIGITS))
            assertTrue(password.all { it in CharClass.DIGITS.chars })
        }
    }

    @Test
    fun `turning a class off keeps it out`() {
        val chosen = allClasses - CharClass.SYMBOLS

        repeat(50) {
            val password = PasswordGenerator.generate(24, chosen)
            assertTrue(password.none { it in CharClass.SYMBOLS.chars })
        }
    }

    @Test
    fun `does not produce the same password twice`() {
        val passwords = List(100) { PasswordGenerator.generate(16, allClasses) }

        assertTrue("only ${passwords.toSet().size} distinct", passwords.toSet().size > 90)
    }

    @Test
    fun `is repeatable when the source is seeded`() {
        // The injectable source exists for tests; this pins that it is really the one used.
        assertEquals(
            PasswordGenerator.generate(24, allClasses, Random(7)),
            PasswordGenerator.generate(24, allClasses, Random(7)),
        )
        assertNotEquals(
            PasswordGenerator.generate(24, allClasses, Random(7)),
            PasswordGenerator.generate(24, allClasses, Random(8)),
        )
    }

    @Test
    fun `refuses a length that cannot hold one of each class`() {
        assertThrows(IllegalArgumentException::class.java) {
            PasswordGenerator.generate(3, allClasses)
        }
    }

    @Test
    fun `refuses to generate from no classes at all`() {
        assertThrows(IllegalArgumentException::class.java) {
            PasswordGenerator.generate(16, emptySet())
        }
    }

    @Test
    fun `the shortest length is enough for every class`() {
        assertEquals(
            PasswordGenerator.MIN_LENGTH,
            PasswordGenerator.generate(PasswordGenerator.MIN_LENGTH, allClasses).length,
        )
    }
}
