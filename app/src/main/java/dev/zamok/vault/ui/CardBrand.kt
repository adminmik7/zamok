package dev.zamok.vault.ui

import dev.zamok.vault.model.EntryField

/** The payment networks a card number can belong to, and how a card is drawn for each. */
enum class CardBrand(val label: String, val lengths: IntRange, val groupSize: Int) {
    VISA("Visa", 13..19, 4),
    MASTERCARD("Mastercard", 16..16, 4),
    MIR("МИР", 16..19, 4),
    AMEX("American Express", 15..15, 4),
    JCB("JCB", 16..19, 4),
    DISCOVER("Discover", 16..19, 4),
    UNION_PAY("UnionPay", 16..19, 4),
    UNKNOWN("", 12..19, 4),
}

/**
 * The network a card number belongs to, worked out from its leading digits.
 *
 * The same way a bank works it out: the first few digits of a number are issued to one network, and
 * every number issued to it starts the same way. Nothing is asked of the network and nothing is sent
 * anywhere - this is arithmetic over the digits on the screen, which is why a card can say what it
 * is while the phone is in a pocket.
 *
 * The prefixes are the ranges the networks publish, not a list of numbers seen in the wild, so a
 * number this build has never seen still lands on the right network. When the leading digits say
 * nothing - a number half typed, or one from a network that did not exist when this was written -
 * the answer is [CardBrand.UNKNOWN] and the card is drawn without a name on it.
 */
fun brandOf(number: String): CardBrand {
    val digits = number.filter { it.isDigit() }
    return when {
        digits.isEmpty() -> CardBrand.UNKNOWN
        digits.startsWith("4") -> CardBrand.VISA
        digits.length in 2..3 && digits.take(2).toInt() in 51..55 -> CardBrand.MASTERCARD
        digits.length in 4..6 && digits.take(4).toIntOrNull() in 2221..2720 -> CardBrand.MASTERCARD
        digits.length in 4..6 && digits.take(4).toIntOrNull() in 2200..2204 -> CardBrand.MIR
        digits.length in 2..3 && digits.take(2) in listOf("34", "37") -> CardBrand.AMEX
        digits.length in 2..3 && digits.startsWith("35") -> CardBrand.JCB
        digits.length >= 4 && (digits.startsWith("6011") || digits.take(2) in listOf("65", "64")) -> CardBrand.DISCOVER
        digits.length >= 2 && digits.startsWith("62") -> CardBrand.UNION_PAY
        else -> CardBrand.UNKNOWN
    }
}

/**
 * Whether a number is a card number at all, by the checksum every network writes into it.
 *
 * The check exists to catch a mistyped digit, not to prove anything about the card: a number can pass
 * and still be nobody's. It is only asked about a number long enough for the answer to mean anything.
 */
fun passesLuhn(number: String): Boolean {
    val digits = number.filter { it.isDigit() }
    if (digits.length < 12) return false
    var sum = 0
    var double = false
    for (index in digits.length - 1 downTo 0) {
        var digit = digits[index] - '0'
        if (double) {
            digit *= 2
            if (digit > 9) digit -= 9
        }
        sum += digit
        double = !double
    }
    return sum % 10 == 0
}

/**
 * A card number as it is shown: the last four digits, and a dot for every one before them.
 *
 * The last four are what someone reads off the plastic to recognise a card, and they are what a
 * receipt quotes; everything else is a length. The dots keep the length, so a wrong number still
 * looks wrong.
 */
fun maskCardNumber(number: String): String {
    val digits = number.filter { it.isDigit() }
    if (digits.isEmpty()) return ""
    if (digits.length <= 4) return "•".repeat(digits.length)
    return "•".repeat(digits.length - 4) + digits.takeLast(4)
}

/**
 * The digits as they are typed, in the groups a card is printed in.
 *
 * American Express prints fifteen digits in groups of four rather than in the usual fours and three,
 * and a number that is already grouped is left alone, so pasting a written-out number works.
 */
fun groupCardNumber(number: String, brand: CardBrand = brandOf(number)): String {
    if (number.any { !it.isDigit() && it != ' ' }) return number
    val digits = number.filter { it.isDigit() }
    val size = if (brand == CardBrand.AMEX) 4 else brand.groupSize
    return digits.chunked(size).joinToString(" ")
}

/** The card's expiry, as the two short numbers it is printed as. */
fun formatExpiry(text: String): String {
    val digits = text.filter { it.isDigit() }.take(4)
    return when {
        digits.length <= 2 -> digits
        else -> digits.take(2) + "/" + digits.drop(2)
    }
}

/** The value of the field called [name], or "" when this record has no such field. */
fun fieldValue(fields: List<EntryField>, name: String): String =
    fields.firstOrNull { it.label.equals(name, ignoreCase = true) }?.value.orEmpty()