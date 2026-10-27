package dev.beacon.app.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import androidx.compose.material3.Shapes
import androidx.compose.foundation.shape.RoundedCornerShape

val Accent = Color(0xFFFF6A45)
val Ink = Color(0xFF0B0C0E)
val InkRaised = Color(0xFF14161A)
val InkLine = Color(0xFF25282E)
val Bone = Color(0xFFF4F1EA)
val BoneRaised = Color(0xFFFBF9F4)
val BoneLine = Color(0xFFE3DED2)
val MutedDark = Color(0xFF9EA3AC)
val MutedLight = Color(0xFF6F6C65)
val Positive = Color(0xFF58C08A)
val Warning = Color(0xFFE7B25C)
val Danger = Color(0xFFE45B5B)

private val DarkColors = darkColorScheme(
    primary = Accent,
    onPrimary = Ink,
    primaryContainer = Color(0xFF3A1D15),
    onPrimaryContainer = Color(0xFFFFD9CF),
    secondary = Bone,
    onSecondary = Ink,
    background = Ink,
    onBackground = Bone,
    surface = InkRaised,
    onSurface = Bone,
    surfaceVariant = Color(0xFF191C20),
    onSurfaceVariant = MutedDark,
    outline = InkLine,
    outlineVariant = InkLine,
    error = Danger,
    onError = Ink,
)

private val LightColors = lightColorScheme(
    primary = Accent,
    onPrimary = Ink,
    primaryContainer = Color(0xFFFFE2D9),
    onPrimaryContainer = Color(0xFF4A1709),
    secondary = Ink,
    onSecondary = Bone,
    background = Bone,
    onBackground = Ink,
    surface = BoneRaised,
    onSurface = Ink,
    surfaceVariant = Color(0xFFEDE9DF),
    onSurfaceVariant = MutedLight,
    outline = BoneLine,
    outlineVariant = BoneLine,
    error = Color(0xFFB93B3B),
    onError = Color.White,
)

private val BeaconTypography = Typography(
    displayLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 44.sp,
        lineHeight = 46.sp,
        letterSpacing = (-1.4).sp,
    ),
    headlineLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 32.sp,
        lineHeight = 36.sp,
        letterSpacing = (-0.8).sp,
    ),
    headlineMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 25.sp,
        lineHeight = 30.sp,
        letterSpacing = (-0.4).sp,
    ),
    titleLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 20.sp,
        lineHeight = 25.sp,
        letterSpacing = (-0.25).sp,
    ),
    titleMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 15.sp,
        lineHeight = 20.sp,
    ),
    bodyLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 15.sp,
        lineHeight = 23.sp,
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 13.5.sp,
        lineHeight = 20.sp,
    ),
    bodySmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 12.sp,
        lineHeight = 18.sp,
    ),
    labelLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 13.sp,
        lineHeight = 18.sp,
    ),
    labelMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 11.sp,
        lineHeight = 15.sp,
    ),
    labelSmall = TextStyle(
        fontFamily = FontFamily.Monospace,
        fontWeight = FontWeight.Medium,
        fontSize = 9.5.sp,
        lineHeight = 13.sp,
        letterSpacing = 1.3.sp,
    ),
)

private val BeaconShapes = Shapes(
    extraSmall = RoundedCornerShape(6.dp),
    small = RoundedCornerShape(9.dp),
    medium = RoundedCornerShape(13.dp),
    large = RoundedCornerShape(18.dp),
    extraLarge = RoundedCornerShape(24.dp),
)

@Composable
fun BeaconTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val activity = view.context as? Activity ?: return@SideEffect
            val window = activity.window
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = !darkTheme
                isAppearanceLightNavigationBars = !darkTheme
            }
        }
    }
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = BeaconTypography,
        shapes = BeaconShapes,
        content = content,
    )
}
