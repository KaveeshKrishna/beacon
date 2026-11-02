package dev.beacon.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.beacon.app.ui.components.BeaconButton
import dev.beacon.app.ui.components.FieldColors
import dev.beacon.app.ui.components.GeofenceMap
import dev.beacon.app.ui.theme.Accent
import dev.beacon.app.ui.theme.Danger
import kotlin.math.roundToInt

/**
 * Full-screen fence editor. The map is the primary control: tap to place the
 * centre, drag the handle on the circle to change the radius. The slider is a
 * precise, accessible fallback and works even when map tiles cannot load.
 */
@Composable
fun GeofenceEditor(
    state: GeofenceUiState,
    onCenterChange: (Double, Double) -> Unit,
    onCreate: (String, Int) -> Unit,
    onClose: () -> Unit,
) {
    var name by rememberSaveable { mutableStateOf("") }
    var radius by rememberSaveable { mutableIntStateOf(250) }
    val latitude = state.latitude
    val longitude = state.longitude

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        if (latitude != null && longitude != null) {
            GeofenceMap(
                latitude = latitude,
                longitude = longitude,
                radiusM = radius,
                onCenterChange = onCenterChange,
                onRadiusChange = { radius = it.coerceIn(50, 5_000) },
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        strokeWidth = 2.dp,
                        color = Accent,
                    )
                    Spacer(Modifier.height(12.dp))
                    Text(
                        if (state.locating) {
                            "Finding your location…"
                        } else {
                            "No location fix yet"
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surface.copy(alpha = 0.94f),
                border = androidx.compose.foundation.BorderStroke(
                    1.dp,
                    MaterialTheme.colorScheme.outline,
                ),
            ) {
                TextButton(
                    onClick = onClose,
                    enabled = !state.creating,
                ) {
                    Text("Cancel", style = MaterialTheme.typography.labelMedium)
                }
            }
            Spacer(Modifier.width(10.dp))
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surface.copy(alpha = 0.94f),
                border = androidx.compose.foundation.BorderStroke(
                    1.dp,
                    MaterialTheme.colorScheme.outline,
                ),
            ) {
                Text(
                    "New geofence",
                    style = MaterialTheme.typography.labelMedium,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                )
            }
        }

        Surface(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth(),
            shape = RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp),
            color = MaterialTheme.colorScheme.surface,
            border = androidx.compose.foundation.BorderStroke(
                1.dp,
                MaterialTheme.colorScheme.outline,
            ),
        ) {
            Column(
                modifier = Modifier
                    .navigationBarsPadding()
                    .imePadding()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 18.dp, vertical = 16.dp),
            ) {
                Text("Draw the fence", style = MaterialTheme.typography.titleLarge)
                Spacer(Modifier.height(4.dp))
                Text(
                    "Tap the map to move the centre. Drag the orange dot on the circle to resize it. Automatic check-in uses the inside interval here and the outside interval everywhere else.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(14.dp))
                OutlinedTextField(
                    value = name,
                    onValueChange = { if (it.length <= 60) name = it },
                    label = { Text("Place name") },
                    placeholder = { Text("Home, work, school") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    colors = FieldColors(),
                )
                Spacer(Modifier.height(14.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text("Radius", style = MaterialTheme.typography.titleSmall)
                    Text(
                        mapRadiusLabel(radius),
                        style = MaterialTheme.typography.bodyMedium,
                        color = Accent,
                    )
                }
                Slider(
                    value = radius.toFloat(),
                    onValueChange = {
                        radius = ((it / 10f).roundToInt() * 10).coerceIn(50, 5_000)
                    },
                    valueRange = 50f..5_000f,
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    listOf(100, 250, 500, 1_000, 2_000).forEach { option ->
                        Surface(
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(9.dp),
                            color = if (radius == option) {
                                Accent.copy(alpha = 0.14f)
                            } else {
                                MaterialTheme.colorScheme.surface
                            },
                            border = androidx.compose.foundation.BorderStroke(
                                1.dp,
                                if (radius == option) {
                                    Accent.copy(alpha = 0.55f)
                                } else {
                                    MaterialTheme.colorScheme.outline
                                },
                            ),
                        ) {
                            TextButton(
                                onClick = { radius = option },
                                contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp),
                            ) {
                                Text(
                                    mapRadiusLabel(option),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = if (radius == option) {
                                        Accent
                                    } else {
                                        MaterialTheme.colorScheme.onSurfaceVariant
                                    },
                                    maxLines = 1,
                                )
                            }
                        }
                    }
                }

                if (state.error != null) {
                    Spacer(Modifier.height(10.dp))
                    Text(
                        state.error,
                        style = MaterialTheme.typography.bodySmall,
                        color = Danger,
                    )
                }

                Spacer(Modifier.height(14.dp))
                BeaconButton(
                    text = if (state.creating) "Creating…" else "Create geofence",
                    onClick = { onCreate(name, radius) },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !state.creating &&
                        !state.locating &&
                        latitude != null &&
                        longitude != null &&
                        name.isNotBlank(),
                    loading = state.creating,
                )
                if (latitude != null && longitude != null) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Centre ${"%.5f".format(java.util.Locale.US, latitude)}, " +
                            "${"%.5f".format(java.util.Locale.US, longitude)}" +
                            (state.accuracyM?.let { "  (±${it.toInt()} m)" } ?: ""),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace,
                    )
                }
            }
        }
    }
}

private fun mapRadiusLabel(meters: Int): String = when {
    meters >= 1000 && meters % 1000 == 0 -> "${meters / 1000} km"
    meters >= 1000 -> "${"%.1f".format(java.util.Locale.US, meters / 1000.0)} km"
    else -> "$meters m"
}
