package dev.zamok.vault.ui

import dev.zamok.vault.data.PasswordAudit
import dev.zamok.vault.model.Entry
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** How much a stored password is to be trusted, as far as this app can tell. */
enum class Strength { STRONG, MEDIUM, WEAK }

/**
 * The badge shown next to a password.
 *
 * The rules in [PasswordAudit] answer the only question worth asking here: is this one of the obvious
 * mistakes. Anything they did not flag is called strong rather than safe, because no list of rules
 * can say a password is unbreakable, and a badge that says so would be lying.
 *
 * The middle mark is for a password the rules had nothing to say about, yet which is short enough to
 * be worth replacing one day.
 */
fun strengthOf(entry: Entry): Strength {
    if (entry.password.isEmpty()) return Strength.STRONG
    if (PasswordAudit.assess(entry).isNotEmpty()) return Strength.WEAK
    return if (entry.password.length < MEDIUM_LENGTH) Strength.MEDIUM else Strength.STRONG
}

/** Below this a password passes the rules but is still short enough to be replaced one day. */
private const val MEDIUM_LENGTH = 12

private val STAMP: DateTimeFormatter = DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm")

/**
 * When something happened to a record, in the time of the phone reading it.
 *
 * Zero is left as an empty string rather than shown as 01.01.1970: it means the field was never set,
 * which is what an entry written by an older build carries.
 */
fun formatStamp(millis: Long): String =
    if (millis <= 0L) "" else STAMP.format(Instant.ofEpochMilli(millis).atZone(ZoneId.systemDefault()))