package dev.zamok.vault.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * The app's only palette: a dark screen with one blue accent.
 *
 * Dark and fixed rather than following the system. A vault gets opened at night as often as in
 * daylight, and one palette means one set of contrast decisions to get right instead of two.
 *
 * Every surface role is spelled out because Material3's defaults are greys: a partly overridden
 * scheme would give menus, dialogs and cards a colour that belongs to no part of this design.
 */
private val ZamokColors = darkColorScheme(
    primary = Color(0xFF3B82F6),
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFF1D3A6B),
    onPrimaryContainer = Color(0xFFD7E5FF),
    secondary = Color(0xFF4C8DF6),
    onSecondary = Color(0xFFFFFFFF),
    // The star that marks a favourite, and nothing else.
    tertiary = Color(0xFFF0B429),
    onTertiary = Color(0xFF2A1D00),
    background = Color(0xFF101A28),
    onBackground = Color(0xFFE7EEF9),
    surface = Color(0xFF101A28),
    onSurface = Color(0xFFE7EEF9),
    surfaceVariant = Color(0xFF1B2739),
    onSurfaceVariant = Color(0xFF97A5BC),
    surfaceContainerLowest = Color(0xFF0B131E),
    surfaceContainerLow = Color(0xFF141F2E),
    surfaceContainer = Color(0xFF182535),
    surfaceContainerHigh = Color(0xFF1E2C3E),
    surfaceContainerHighest = Color(0xFF243347),
    outline = Color(0xFF33445C),
    outlineVariant = Color(0xFF233246),
    error = Color(0xFFFF6B6B),
    onError = Color(0xFF2A0000),
)

@Composable
fun ZamokTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = ZamokColors, content = content)
}
