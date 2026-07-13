package app.clipd.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

val Teal = Color(0xFF047A69)
val TealSoft = Color(0x1A047A69)

private val LightColors = lightColorScheme(
    primary = Teal,
    onPrimary = Color.White,
    primaryContainer = TealSoft,
    onPrimaryContainer = Teal,
    background = Color(0xFFF5F5F7),
    onBackground = Color(0xFF1D1D1F),
    surface = Color.White,
    onSurface = Color(0xFF1D1D1F),
    surfaceVariant = Color(0xFFF0F0F3),
    onSurfaceVariant = Color(0xFF6E6E73),
    outline = Color(0xFFE4E4E7),
    outlineVariant = Color(0xFFECECEF),
    error = Color(0xFFD70015),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF3FBFA8),
    onPrimary = Color(0xFF00201B),
    primaryContainer = Color(0x333FBFA8),
    onPrimaryContainer = Color(0xFF9FEFE0),
    background = Color(0xFF17181C),
    onBackground = Color(0xFFF2F2F5),
    surface = Color(0xFF202127),
    onSurface = Color(0xFFF2F2F5),
    surfaceVariant = Color(0xFF2A2B32),
    onSurfaceVariant = Color(0xFFA6A6B2),
    outline = Color(0xFF33343D),
    error = Color(0xFFFF6B6B),
)

private val AppType = Typography(
    headlineLarge = TextStyle(fontWeight = FontWeight.Bold, fontSize = 26.sp, letterSpacing = (-0.5).sp),
    titleLarge = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 20.sp),
    titleMedium = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 15.sp),
    bodyLarge = TextStyle(fontWeight = FontWeight.Normal, fontSize = 15.sp),
    bodyMedium = TextStyle(fontWeight = FontWeight.Normal, fontSize = 13.sp),
    labelLarge = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 14.sp),
    labelSmall = TextStyle(fontWeight = FontWeight.Medium, fontSize = 11.sp, letterSpacing = 0.4.sp),
)

@Composable
fun ClipdTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (isSystemInDarkTheme()) DarkColors else LightColors,
        typography = AppType,
        content = content,
    )
}
