package dev.zamok.vault.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The format mechanics on their own.
 *
 * These are exactly the cases a `split(",")` gets wrong, which is the whole reason this exists
 * rather than one line of string handling.
 */
class CsvTest {

    @Test
    fun `a plain table round trips`() {
        val rows = listOf(listOf("a", "b"), listOf("c", "d"))
        assertEquals(rows, Csv.parse(Csv.encode(rows)))
    }

    @Test
    fun `every row ends with crlf`() {
        // What RFC 4180 says, and what spreadsheets expect.
        assertEquals("a,b\r\nc,d\r\n", Csv.encode(listOf(listOf("a", "b"), listOf("c", "d"))))
    }

    @Test
    fun `a comma inside a field does not split it`() {
        val rows = listOf(listOf("Почта, личная", "b"))

        assertEquals("\"Почта, личная\",b\r\n", Csv.encode(rows))
        assertEquals(rows, Csv.parse(Csv.encode(rows)))
    }

    @Test
    fun `a quote inside a field is doubled and read back`() {
        val rows = listOf(listOf("он сказал \"привет\""))

        assertTrue(Csv.encode(rows).contains("он сказал \"\"привет\"\""))
        assertEquals(rows, Csv.parse(Csv.encode(rows)))
    }

    @Test
    fun `a newline inside a field survives`() {
        val rows = listOf(listOf("первая\nвторая"), listOf("после"))

        assertEquals(rows, Csv.parse(Csv.encode(rows)))
    }

    @Test
    fun `spaces at the ends of a field survive`() {
        // Quoted on the way out: a reader is free to trim an unquoted field.
        val rows = listOf(listOf(" secret "))

        assertEquals("\" secret \"\r\n", Csv.encode(rows))
        assertEquals(rows, Csv.parse(Csv.encode(rows)))
    }

    @Test
    fun `an empty field is kept`() {
        assertEquals(listOf(listOf("a", "", "c")), Csv.parse("a,,c"))
    }

    @Test
    fun `crlf, lf and cr all end a row`() {
        val expected = listOf(listOf("a", "b"), listOf("c", "d"))

        assertEquals(expected, Csv.parse("a,b\r\nc,d"))
        assertEquals(expected, Csv.parse("a,b\nc,d"))
        assertEquals(expected, Csv.parse("a,b\rc,d"))
    }

    @Test
    fun `the last row needs no line ending`() {
        assertEquals(listOf(listOf("a", "b")), Csv.parse("a,b"))
    }

    @Test
    fun `blank lines are not rows`() {
        assertEquals(listOf(listOf("a", "b"), listOf("c", "d")), Csv.parse("a,b\r\n\r\nc,d\r\n"))
    }

    @Test
    fun `a byte order mark is ignored`() {
        assertEquals(listOf(listOf("a", "b")), Csv.parse("\uFEFFa,b"))
    }

    @Test
    fun `empty input is no rows`() {
        assertEquals(emptyList<List<String>>(), Csv.parse(""))
        assertEquals(emptyList<List<String>>(), Csv.parse("\r\n"))
    }
}
