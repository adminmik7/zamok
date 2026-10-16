package dev.zamok.vault.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * What a card number says about itself: which network issued it, whether the digits add up, and how
 * it is drawn. All of it is arithmetic over the number on the screen - nothing is asked of anybody.
 */
class CardBrandTest {

    @Test
    fun `a number that starts with the issued range is read as that network`() {
        assertEquals(CardBrand.VISA, brandOf("4276 3800 1234 5678"))
        assertEquals(CardBrand.MASTERCARD, brandOf("5536 9113 1234 5678"))
        assertEquals(CardBrand.MIR, brandOf("2200 1234 5678 9012"))
        assertEquals(CardBrand.AMEX, brandOf("3782 8224 6310 005"))
        assertEquals(CardBrand.JCB, brandOf("3536 1111 1111 1111"))
        assertEquals(CardBrand.DISCOVER, brandOf("6011 1111 1111 1117"))
        assertEquals(CardBrand.UNION_PAY, brandOf("6212 3456 7890 1234"))
    }

    @Test
    fun `a mastercard of the twenty-something range is still a mastercard`() {
        assertEquals(CardBrand.MASTERCARD, brandOf("2223 0012 3456 7890"))
    }

    @Test
    fun `a number too short to be told apart is not guessed at`() {
        assertEquals(CardBrand.UNKNOWN, brandOf(""))
        assertEquals(CardBrand.UNKNOWN, brandOf("9"))
        assertEquals(CardBrand.UNKNOWN, brandOf("9999 9999 9999 9999"))
    }

    @Test
    fun `one digit is enough where it settles it`() {
        assertEquals(CardBrand.VISA, brandOf("4"))
    }

    @Test
    fun `the checksum catches a mistyped digit`() {
        assertTrue(passesLuhn("4111111111111111"))
        assertFalse(passesLuhn("4111111111111112"))
    }

    @Test
    fun `a number too short to be a card is not judged by the checksum`() {
        assertFalse(passesLuhn("4276"))
    }

    @Test
    fun `a card is drawn with dots and the last four digits`() {
        assertEquals("••••••••••••5678", maskCardNumber("4276380012345678"))
    }

    @Test
    fun `four digits or fewer are all dots, since there is no last four to keep`() {
        assertEquals("••••", maskCardNumber("5678"))
    }

    @Test
    fun `an amex is typed in fours, and the rest in fours with a last three`() {
        assertEquals("3782 8224 6310 005", groupCardNumber("378282246310005"))
        assertEquals("4276 3800 1234 5678", groupCardNumber("4276380012345678"))
    }

    @Test
    fun `an expiry is shortened to its two pairs as it is typed`() {
        assertEquals("0", formatExpiry("0"))
        assertEquals("09", formatExpiry("09"))
        assertEquals("09/2", formatExpiry("092"))
        assertEquals("09/28", formatExpiry("0928"))
    }

    @Test
    fun `an expiry typed with a slash comes out the same`() {
        assertEquals("09/28", formatExpiry("09/28"))
    }
}