package dev.beacon.app.ui

import android.content.Context
import android.content.Intent
import android.hardware.GeomagneticField
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.BatteryFull
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Explore
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material.icons.rounded.LinkOff
import androidx.compose.material.icons.rounded.LocationOff
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Map
import androidx.compose.material.icons.rounded.MyLocation
import androidx.compose.material.icons.rounded.Navigation
import androidx.compose.material.icons.rounded.PhoneAndroid
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleStartEffect
import dev.beacon.app.core.GeofenceMath
import dev.beacon.app.network.LinkedDevice
import dev.beacon.app.network.LinkedDeviceLocation
import dev.beacon.app.ui.components.BeaconButton
import dev.beacon.app.ui.components.BeaconCard
import dev.beacon.app.ui.components.BeaconOutlinedButton
import dev.beacon.app.ui.components.EmptyNote
import dev.beacon.app.ui.components.ErrorBanner
import dev.beacon.app.ui.components.FieldColors
import dev.beacon.app.ui.components.MonoLabel
import dev.beacon.app.ui.components.SectionHeader
import dev.beacon.app.ui.components.StatusDot
import dev.beacon.app.ui.components.WarningBanner
import dev.beacon.app.ui.components.relativeTime
import dev.beacon.app.ui.theme.Accent
import dev.beacon.app.ui.theme.Danger
import dev.beacon.app.ui.theme.MutedDark
import dev.beacon.app.ui.theme.Positive
import dev.beacon.app.ui.theme.Warning
import java.util.Locale
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

private const val LOCATION_STALE_MS = 10 * 60_000L
private const val RECOVERY_CONFIRM_WORD = "RESET"

/**
 * Home summary for the narrow account link. Linking is deliberately started
 * from the phone and approved in a browser, so this card explains the handoff
 * instead of pretending it can happen inline.
 */
@Composable
fun AccountSection(
    account: AccountUiState,
    onLink: () -> Unit,
    onCancelLink: () -> Unit,
    onOpenAccountScreen: () -> Unit,
    modifier: Modifier = Modifier,
) {
    BeaconCard(modifier) {
        Column(modifier = Modifier.padding(16.dp)) {
            if (account.linked) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Rounded.PhoneAndroid,
                        contentDescription = null,
                        tint = Accent,
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(Modifier.width(10.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            account.accountName.ifBlank { "Your Beacon account" },
                            style = MaterialTheme.typography.titleMedium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            account.accountEmailMasked.ifBlank { "Linked to this phone" },
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                    StatusDot(Positive)
                }
                Spacer(Modifier.height(10.dp))
                Text(
                    "See where your other devices are, get a direction arrow to them, and prepare account recovery.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(10.dp))
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    MonoLabel(
                        if (account.recoveryEligible) {
                            "Recovery ready"
                        } else {
                            "Recovery in ${account.recoveryDaysRemaining} " +
                                if (account.recoveryDaysRemaining == 1) "day" else "days"
                        },
                        color = if (account.recoveryEligible) Positive else Warning,
                    )
                    Spacer(Modifier.weight(1f))
                    MonoLabel("Linked ${relativeTime(account.linkedAt)}")
                }
                Spacer(Modifier.height(12.dp))
                BeaconButton(
                    text = "Open linked phones",
                    onClick = onOpenAccountScreen,
                    modifier = Modifier.fillMaxWidth(),
                    icon = Icons.Rounded.PhoneAndroid,
                )
            } else {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Rounded.Link,
                        contentDescription = null,
                        tint = Accent,
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(Modifier.width(10.dp))
                    Text(
                        "Link this phone to your account",
                        style = MaterialTheme.typography.titleMedium,
                    )
                }
                Spacer(Modifier.height(8.dp))
                Text(
                    "Approving in a browser lets this phone see the other devices on your account and, after seven days, reset a lost authenticator. The app never receives your password.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                if (account.busy == "link") {
                    Spacer(Modifier.height(12.dp))
                    Surface(
                        shape = RoundedCornerShape(11.dp),
                        color = Accent.copy(alpha = 0.08f),
                        border = BorderStroke(1.dp, Accent.copy(alpha = 0.3f)),
                    ) {
                        Column(modifier = Modifier.padding(13.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(15.dp),
                                    strokeWidth = 2.dp,
                                    color = Accent,
                                )
                                Spacer(Modifier.width(9.dp))
                                Text(
                                    "Approve this phone in the browser",
                                    style = MaterialTheme.typography.titleMedium,
                                )
                            }
                            Spacer(Modifier.height(4.dp))
                            Text(
                                "Finish there, then return to Beacon. This card updates when the link is approved.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            TextButton(
                                onClick = onCancelLink,
                                contentPadding = androidx.compose.foundation.layout.PaddingValues(
                                    horizontal = 0.dp,
                                    vertical = 0.dp,
                                ),
                            ) {
                                Text("Cancel", style = MaterialTheme.typography.labelMedium)
                            }
                        }
                    }
                } else {
                    Spacer(Modifier.height(12.dp))
                    BeaconButton(
                        text = "Link this phone",
                        onClick = onLink,
                        modifier = Modifier.fillMaxWidth(),
                        icon = Icons.Rounded.Link,
                    )
                }

                if (account.error != null) {
                    Spacer(Modifier.height(10.dp))
                    ErrorBanner(account.error)
                }
            }
        }
    }
}

/**
 * Full linked-device list plus recovery controls. The list is read-only: a
 * mobile session can see names, battery and the latest fix, but it cannot send
 * commands or change any tracking setting.
 */
@Composable
fun AccountScreen(
    account: AccountUiState,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onRequestLocation: () -> Unit,
    onSelectDirection: (String) -> Unit,
    onCloseDirection: () -> Unit,
    onUnlink: () -> Unit,
    onRequestBiometric: (() -> Unit) -> Unit,
    onRecover: (String) -> Unit,
    onDismissRecovery: () -> Unit,
    onDismissError: () -> Unit,
) {
    val directionDevice = account.directionDeviceId?.let { id ->
        account.devices.firstOrNull { it.id == id }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp),
    ) {
        Spacer(Modifier.height(10.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back")
            }
            Spacer(Modifier.width(4.dp))
            Column(modifier = Modifier.weight(1f)) {
                MonoLabel("Account")
                Text("Linked phones", style = MaterialTheme.typography.titleLarge)
            }
            if (account.loading) {
                CircularProgressIndicator(
                    modifier = Modifier.size(20.dp),
                    strokeWidth = 2.dp,
                    color = Accent,
                )
            } else {
                IconButton(onClick = onRefresh) {
                    Icon(Icons.Rounded.Refresh, contentDescription = "Refresh devices")
                }
            }
        }

        Spacer(Modifier.height(8.dp))
        BeaconCard {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Rounded.Shield,
                        contentDescription = null,
                        tint = Accent,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(Modifier.width(9.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            account.accountName.ifBlank { "Your Beacon account" },
                            style = MaterialTheme.typography.titleMedium,
                        )
                        Text(
                            account.accountEmailMasked.ifBlank { "Signed in through the browser" },
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                Spacer(Modifier.height(8.dp))
                Text(
                    "Linked ${relativeTime(account.linkedAt)}. This phone can read names, battery and the latest location of every device below.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        if (account.error != null) {
            Spacer(Modifier.height(10.dp))
            ErrorBanner(account.error)
            TextButton(
                onClick = onDismissError,
                contentPadding = androidx.compose.foundation.layout.PaddingValues(
                    horizontal = 0.dp,
                    vertical = 0.dp,
                ),
            ) {
                Text("Dismiss", style = MaterialTheme.typography.labelMedium)
            }
        }

        if (directionDevice != null) {
            Spacer(Modifier.height(14.dp))
            DirectionView(
                device = directionDevice,
                originLatitude = account.originLatitude,
                originLongitude = account.originLongitude,
                originAccuracyM = account.originAccuracyM,
                onBack = onCloseDirection,
                onRefresh = onRefresh,
                onRequestLocation = onRequestLocation,
            )
        } else {
            Spacer(Modifier.height(20.dp))
            SectionHeader("Devices", "${account.devices.size}")
            Spacer(Modifier.height(9.dp))

            when {
                account.devices.isEmpty() && account.loading -> {
                    BeaconCard {
                        Row(
                            modifier = Modifier.padding(18.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(17.dp),
                                strokeWidth = 2.dp,
                                color = Accent,
                            )
                            Spacer(Modifier.width(10.dp))
                            Text(
                                "Loading your devices\u2026",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
                account.devices.isEmpty() -> {
                    BeaconCard {
                        Column(modifier = Modifier.padding(18.dp)) {
                            EmptyNote("No active devices are on this account.")
                            Spacer(Modifier.height(6.dp))
                            Text(
                                "Pair another phone from the dashboard and it will appear here.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
                else -> {
                    account.devices.forEach { device ->
                        DeviceCard(
                            device = device,
                            isCurrent = device.id == account.currentDeviceId,
                            originLatitude = account.originLatitude,
                            originLongitude = account.originLongitude,
                            onOpenDirection = { onSelectDirection(device.id) },
                        )
                        Spacer(Modifier.height(9.dp))
                    }
                }
            }

            Spacer(Modifier.height(20.dp))
            SectionHeader("Account recovery")
            Spacer(Modifier.height(9.dp))
            RecoveryCard(
                account = account,
                onRequestBiometric = onRequestBiometric,
                onRecover = onRecover,
                onDismissRecovery = onDismissRecovery,
            )

            Spacer(Modifier.height(20.dp))
            SectionHeader("This phone")
            Spacer(Modifier.height(9.dp))
            UnlinkCard(
                busy = account.busy == "unlink",
                onUnlink = onUnlink,
            )
        }

        Spacer(Modifier.height(30.dp))
    }

    RecoverySuccessDialog(
        message = account.recoveryDone,
        onDismiss = onDismissRecovery,
    )
}

@Composable
private fun DeviceCard(
    device: LinkedDevice,
    isCurrent: Boolean,
    originLatitude: Double?,
    originLongitude: Double?,
    onOpenDirection: () -> Unit,
) {
    val context = LocalContext.current
    val location = device.lastLocation
    val distance = if (
        !isCurrent &&
        location != null &&
        originLatitude != null &&
        originLongitude != null
    ) {
        GeofenceMath.distanceMeters(
            originLatitude,
            originLongitude,
            location.latitude,
            location.longitude,
        )
    } else {
        null
    }
    val bearing = if (
        distance != null &&
        location != null &&
        originLatitude != null &&
        originLongitude != null
    ) {
        GeofenceMath.bearingDegrees(
            originLatitude,
            originLongitude,
            location.latitude,
            location.longitude,
        )
    } else {
        null
    }
    val stale = location != null &&
        System.currentTimeMillis() - location.recordedAt > LOCATION_STALE_MS
    val presenceColor = when (device.presence) {
        "online" -> Positive
        "stale" -> Warning
        else -> MutedDark
    }

    BeaconCard {
        Column(modifier = Modifier.padding(15.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .background(
                            if (isCurrent) {
                                Accent.copy(alpha = 0.14f)
                            } else {
                                MaterialTheme.colorScheme.surfaceVariant
                            },
                            RoundedCornerShape(10.dp),
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        Icons.Rounded.PhoneAndroid,
                        contentDescription = null,
                        tint = if (isCurrent) Accent else MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(18.dp),
                    )
                }
                Spacer(Modifier.width(11.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            device.name,
                            style = MaterialTheme.typography.titleMedium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false),
                        )
                        if (isCurrent) {
                            Spacer(Modifier.width(7.dp))
                            Surface(
                                shape = CircleShape,
                                color = Accent.copy(alpha = 0.12f),
                                border = BorderStroke(1.dp, Accent.copy(alpha = 0.3f)),
                            ) {
                                Text(
                                    "This phone",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = Accent,
                                    modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
                                )
                            }
                        }
                    }
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(5.dp),
                    ) {
                        StatusDot(presenceColor)
                        Text(
                            listOfNotNull(
                                device.model.takeIf { it.isNotBlank() },
                                presenceLabel(device.presence),
                                device.lastSeenAt?.let { relativeTime(it) },
                            ).joinToString("  ·  "),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                device.batteryLevel?.let { battery ->
                    Spacer(Modifier.width(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Rounded.BatteryFull,
                            contentDescription = null,
                            tint = if (battery <= 15) Warning else MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(14.dp),
                        )
                        Spacer(Modifier.width(3.dp))
                        Text(
                            "$battery%",
                            style = MaterialTheme.typography.labelMedium,
                            color = if (battery <= 15) Warning else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            Spacer(Modifier.height(10.dp))
            if (device.status == "lost") {
                WarningBanner("Lost mode is active on this device.")
                Spacer(Modifier.height(7.dp))
            }
            if (location == null) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Rounded.LocationOff,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(15.dp),
                    )
                    Spacer(Modifier.width(7.dp))
                    Text(
                        "No location has been uploaded yet.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
                Text(
                    locationSummary(location, distance, bearing),
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(Modifier.height(3.dp))
                Text(
                    "${providerLabel(location.provider)}  ·  \u00b1${accuracyLabel(location.accuracyM)}  ·  " +
                        relativeTime(location.recordedAt),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (stale) {
                    Spacer(Modifier.height(7.dp))
                    WarningBanner(
                        if (device.presence == "offline") {
                            "This device has not checked in recently, so the location may be out of date."
                        } else {
                            "The last location is more than ten minutes old."
                        },
                    )
                }
                if (location.isMocked) {
                    Spacer(Modifier.height(7.dp))
                    WarningBanner(
                        "This device reports a mocked location. Treat this position as unverified.",
                    )
                }

                if (!isCurrent) {
                    Spacer(Modifier.height(11.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        BeaconButton(
                            text = "Direction",
                            onClick = onOpenDirection,
                            modifier = Modifier.weight(1f),
                            icon = Icons.Rounded.Navigation,
                        )
                        BeaconOutlinedButton(
                            text = "Maps",
                            onClick = { openMaps(context, device) },
                            modifier = Modifier.weight(1f),
                            icon = Icons.Rounded.Map,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DirectionView(
    device: LinkedDevice,
    originLatitude: Double?,
    originLongitude: Double?,
    originAccuracyM: Double?,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onRequestLocation: () -> Unit,
) {
    val context = LocalContext.current
    val location = device.lastLocation
    val distance = if (
        location != null &&
        originLatitude != null &&
        originLongitude != null
    ) {
        GeofenceMath.distanceMeters(
            originLatitude,
            originLongitude,
            location.latitude,
            location.longitude,
        )
    } else {
        null
    }
    val bearing = if (
        location != null &&
        originLatitude != null &&
        originLongitude != null
    ) {
        GeofenceMath.bearingDegrees(
            originLatitude,
            originLongitude,
            location.latitude,
            location.longitude,
        )
    } else {
        null
    }
    val heading = rememberDeviceHeading(originLatitude, originLongitude)

    Row(verticalAlignment = Alignment.CenterVertically) {
        TextButton(
            onClick = onBack,
            contentPadding = androidx.compose.foundation.layout.PaddingValues(
                horizontal = 0.dp,
                vertical = 0.dp,
            ),
        ) {
            Icon(
                Icons.AutoMirrored.Rounded.ArrowBack,
                contentDescription = null,
                modifier = Modifier.size(15.dp),
            )
            Spacer(Modifier.width(5.dp))
            Text("All devices", style = MaterialTheme.typography.labelMedium)
        }
        Spacer(Modifier.weight(1f))
        IconButton(onClick = onRefresh) {
            Icon(
                Icons.Rounded.Refresh,
                contentDescription = "Refresh direction",
                modifier = Modifier.size(19.dp),
            )
        }
    }

    BeaconCard {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(18.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            MonoLabel("Direction to", color = Accent)
            Spacer(Modifier.height(6.dp))
            Text(
                device.name,
                style = MaterialTheme.typography.headlineMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (location != null) {
                Text(
                    "Last fix ${relativeTime(location.recordedAt)}  ·  \u00b1${accuracyLabel(location.accuracyM)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Spacer(Modifier.height(16.dp))
            CompassDial(
                bearing = bearing,
                heading = heading,
                hasOrigin = originLatitude != null && originLongitude != null,
                modifier = Modifier.size(228.dp),
            )
            Spacer(Modifier.height(14.dp))

            if (distance != null && bearing != null) {
                Text(
                    distanceLabel(distance),
                    style = MaterialTheme.typography.displayLarge,
                )
                Text(
                    "${cardinal(bearing)} of you",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else if (originLatitude == null || originLongitude == null) {
                WarningBanner(
                    "This phone has no location fix. Allow location access to draw the direction arrow.",
                )
            } else {
                WarningBanner(
                    "The destination has no usable location yet. Try refreshing after the device checks in.",
                )
            }

            Spacer(Modifier.height(8.dp))
            Text(
                if (heading == null) {
                    "No compass on this phone. The arrow points from true north, so hold the top of the phone toward north for a true reading."
                } else {
                    "Hold the phone flat with its top edge pointing ahead. The arrow follows the compass; accuracy is limited by both devices' location fixes."
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            if (originLatitude == null || originLongitude == null) {
                Spacer(Modifier.height(10.dp))
                BeaconButton(
                    text = "Allow location",
                    onClick = onRequestLocation,
                    modifier = Modifier.fillMaxWidth(),
                    icon = Icons.Rounded.MyLocation,
                )
            }

            if (location != null) {
                Spacer(Modifier.height(12.dp))
                BeaconButton(
                    text = "Open in Maps",
                    onClick = { openMaps(context, device) },
                    modifier = Modifier.fillMaxWidth(),
                    icon = Icons.Rounded.Map,
                )
            }
        }
    }

    if (location != null && System.currentTimeMillis() - location.recordedAt > LOCATION_STALE_MS) {
        Spacer(Modifier.height(10.dp))
        WarningBanner(
            "This location is not live. Follow the arrow for the last known position only, and use Maps for the final approach.",
        )
    }
    if (location?.isMocked == true) {
        Spacer(Modifier.height(10.dp))
        WarningBanner(
            "The destination reports a mocked location. The arrow can point anywhere the other device chooses.",
        )
    }

    Spacer(Modifier.height(12.dp))
    Text(
        "A straight-line bearing, not a walking route. Maps is the right tool for streets, doors and public transport.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun CompassDial(
    bearing: Double?,
    heading: Float?,
    hasOrigin: Boolean,
    modifier: Modifier = Modifier,
) {
    val ring = MaterialTheme.colorScheme.outline
    val tick = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.55f)
    val centerColor = MaterialTheme.colorScheme.onSurfaceVariant

    Canvas(modifier) {
        val radius = size.minDimension / 2f
        val center = Offset(size.width / 2f, size.height / 2f)
        val phoneHeading = heading?.toDouble() ?: 0.0

        drawCircle(
            color = ring,
            radius = radius - 1.dp.toPx(),
            center = center,
            style = Stroke(width = 1.dp.toPx()),
        )
        drawCircle(
            color = ring.copy(alpha = 0.5f),
            radius = radius * 0.7f,
            center = center,
            style = Stroke(width = 1.dp.toPx()),
        )

        // Every ten degrees, with a stronger mark at each cardinal point.
        for (angle in 0 until 360 step 10) {
            val relative = Math.toRadians(angle - phoneHeading)
            val outer = radius - 7.dp.toPx()
            val inner = outer - if (angle % 90 == 0) 11.dp.toPx() else 5.dp.toPx()
            drawLine(
                color = if (angle == 0) Accent else tick,
                start = center + Offset(
                    (sin(relative) * outer).toFloat(),
                    (-cos(relative) * outer).toFloat(),
                ),
                end = center + Offset(
                    (sin(relative) * inner).toFloat(),
                    (-cos(relative) * inner).toFloat(),
                ),
                strokeWidth = if (angle == 0) 2.dp.toPx() else 1.dp.toPx(),
            )
        }

        if (hasOrigin) {
            // North marker: it stays on the ring while the phone turns.
            val north = Math.toRadians(-phoneHeading)
            val markerCenter = center + Offset(
                (sin(north) * radius * 0.83f).toFloat(),
                (-cos(north) * radius * 0.83f).toFloat(),
            )
            drawCircle(color = tick, radius = 2.5.dp.toPx(), center = markerCenter)
        }

        if (bearing != null && hasOrigin) {
            val relative = Math.toRadians(bearing - phoneHeading)
            val tip = center + Offset(
                (sin(relative) * radius * 0.58f).toFloat(),
                (-cos(relative) * radius * 0.58f).toFloat(),
            )
            val baseCenter = center + Offset(
                (sin(relative) * radius * 0.14f).toFloat(),
                (-cos(relative) * radius * 0.14f).toFloat(),
            )
            val perpendicular = Offset(
                (cos(relative) * radius * 0.12f).toFloat(),
                (sin(relative) * radius * 0.12f).toFloat(),
            )
            val arrow = Path().apply {
                moveTo(tip.x, tip.y)
                lineTo(baseCenter.x + perpendicular.x, baseCenter.y + perpendicular.y)
                lineTo(baseCenter.x - perpendicular.x, baseCenter.y - perpendicular.y)
                close()
            }
            drawPath(arrow, Accent)
            drawCircle(color = Accent, radius = 4.dp.toPx(), center = center)
        } else {
            drawCircle(color = centerColor, radius = 3.dp.toPx(), center = center)
        }
    }
}

@Composable
private fun RecoveryCard(
    account: AccountUiState,
    onRequestBiometric: (() -> Unit) -> Unit,
    onRecover: (String) -> Unit,
    onDismissRecovery: () -> Unit,
) {
    var showDialog by rememberSaveable { mutableStateOf(false) }
    var password by rememberSaveable { mutableStateOf("") }
    var confirmation by rememberSaveable { mutableStateOf("") }
    val busy = account.busy == "recovery"

    LaunchedEffect(account.recoveryDone) {
        if (account.recoveryDone != null) {
            showDialog = false
            password = ""
            confirmation = ""
        }
    }

    BeaconCard {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Rounded.Lock,
                    contentDescription = null,
                    tint = if (account.recoveryEligible) Accent else Warning,
                    modifier = Modifier.size(19.dp),
                )
                Spacer(Modifier.width(9.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        "Two-factor recovery",
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Text(
                        if (account.recoveryEligible) {
                            "Available on this phone"
                        } else {
                            "Unlocks in ${account.recoveryDaysRemaining} " +
                                if (account.recoveryDaysRemaining == 1) "day" else "days"
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = if (account.recoveryEligible) Positive else Warning,
                    )
                }
            }
            Spacer(Modifier.height(9.dp))
            Text(
                if (account.recoveryEligible) {
                    "If the authenticator is lost, this linked phone can remove it after a biometric check and your account password. Every browser and every other linked phone is signed out, and a new authenticator must be enrolled."
                } else {
                    "A phone becomes trusted for recovery after seven days of continuous linking. Keep this phone linked so a lost authenticator does not lock you out. Your password is always required."
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            if (account.recoveryEligible) {
                Spacer(Modifier.height(12.dp))
                BeaconOutlinedButton(
                    text = "Reset two-factor authentication",
                    onClick = { onRequestBiometric { showDialog = true } },
                    modifier = Modifier.fillMaxWidth(),
                    loading = busy,
                    icon = Icons.Rounded.Shield,
                )
            } else {
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    CheckCircleHint()
                    Spacer(Modifier.width(6.dp))
                    Text(
                        "Recovery is deliberately unavailable from a brand-new link.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }

    if (showDialog) {
        AlertDialog(
            onDismissRequest = {
                if (!busy) {
                    showDialog = false
                    onDismissRecovery()
                }
            },
            shape = RoundedCornerShape(16.dp),
            containerColor = MaterialTheme.colorScheme.surface,
            title = {
                Text("Reset two-factor authentication?", style = MaterialTheme.typography.titleLarge)
            },
            text = {
                Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                    WarningBanner(
                        "This signs out every browser and every other linked phone. Only this phone stays linked, and the account will require a new authenticator on the next web sign-in.",
                    )
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it.take(256) },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Account password") },
                        singleLine = true,
                        enabled = !busy,
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        colors = FieldColors(),
                    )
                    Spacer(Modifier.height(10.dp))
                    OutlinedTextField(
                        value = confirmation,
                        onValueChange = { confirmation = it.uppercase().take(5) },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Type $RECOVERY_CONFIRM_WORD to confirm") },
                        singleLine = true,
                        enabled = !busy,
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Ascii,
                        ),
                        colors = FieldColors(),
                    )
                    if (account.recoveryError != null) {
                        Spacer(Modifier.height(10.dp))
                        ErrorBanner(account.recoveryError)
                    }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = { onRecover(password) },
                    enabled = password.isNotBlank() &&
                        confirmation == RECOVERY_CONFIRM_WORD &&
                        !busy,
                    colors = ButtonDefaults.textButtonColors(contentColor = Danger),
                ) {
                    if (busy) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(14.dp),
                            strokeWidth = 2.dp,
                            color = Danger,
                        )
                    } else {
                        Text("Reset")
                    }
                }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        showDialog = false
                        onDismissRecovery()
                    },
                    enabled = !busy,
                ) {
                    Text("Cancel")
                }
            },
        )
    }
}

@Composable
private fun RecoverySuccessDialog(message: String?, onDismiss: () -> Unit) {
    if (message == null) return
    AlertDialog(
        onDismissRequest = onDismiss,
        shape = RoundedCornerShape(16.dp),
        containerColor = MaterialTheme.colorScheme.surface,
        icon = {
            Icon(
                Icons.Rounded.CheckCircle,
                contentDescription = null,
                tint = Positive,
                modifier = Modifier.size(26.dp),
            )
        },
        title = {
            Text("Two-factor authentication reset", style = MaterialTheme.typography.titleLarge)
        },
        text = {
            Text(
                message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text("Done")
            }
        },
    )
}

@Composable
private fun UnlinkCard(
    busy: Boolean,
    onUnlink: () -> Unit,
) {
    var showConfirm by rememberSaveable { mutableStateOf(false) }

    BeaconCard {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                "Unlink this phone",
                style = MaterialTheme.typography.titleMedium,
            )
            Spacer(Modifier.height(5.dp))
            Text(
                "Removes the account link and its rotating refresh token from this phone. The device stays paired for location tracking; use the dashboard to revoke the device itself.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(11.dp))
            BeaconOutlinedButton(
                text = "Unlink this phone",
                onClick = { showConfirm = true },
                modifier = Modifier.fillMaxWidth(),
                loading = busy,
                icon = Icons.Rounded.LinkOff,
            )
        }
    }

    if (showConfirm) {
        AlertDialog(
            onDismissRequest = { if (!busy) showConfirm = false },
            shape = RoundedCornerShape(16.dp),
            containerColor = MaterialTheme.colorScheme.surface,
            title = { Text("Unlink this phone?", style = MaterialTheme.typography.titleLarge) },
            text = {
                Text(
                    "The device keeps reporting its own location, but this phone can no longer see your other devices or perform recovery until it is linked again.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showConfirm = false
                        onUnlink()
                    },
                    enabled = !busy,
                    colors = ButtonDefaults.textButtonColors(contentColor = Danger),
                ) {
                    Text("Unlink")
                }
            },
            dismissButton = {
                TextButton(onClick = { showConfirm = false }, enabled = !busy) {
                    Text("Cancel")
                }
            },
        )
    }
}

@Composable
private fun CheckCircleHint() {
    Icon(
        Icons.Rounded.CheckCircle,
        contentDescription = null,
        tint = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.size(13.dp),
    )
}

/**
 * Compass heading in degrees clockwise from true north, or null when the phone
 * has no rotation-vector sensor. Magnetic declination is applied from the
 * current fix, so the direction arrow is true-north based rather than
 * magnetic-north based. This uses platform sensors only: no Play services.
 */
@Composable
private fun rememberDeviceHeading(
    latitude: Double?,
    longitude: Double?,
): Float? {
    val context = LocalContext.current
    var heading by remember { mutableStateOf<Float?>(null) }
    val manager = remember(context) {
        context.getSystemService(SensorManager::class.java)
    }
    val sensor = remember(manager) {
        manager?.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
    }
    val declination = remember(latitude, longitude) {
        if (latitude != null && longitude != null) {
            try {
                GeomagneticField(
                    latitude.toFloat(),
                    longitude.toFloat(),
                    0f,
                    System.currentTimeMillis(),
                ).declination
            } catch (_: Exception) {
                0f
            }
        } else {
            0f
        }
    }

    LifecycleStartEffect(manager, sensor, declination) {
        if (manager == null || sensor == null) {
            heading = null
            onStopOrDispose { }
        } else {
            val rotation = FloatArray(9)
            val orientation = FloatArray(3)
            val listener = object : SensorEventListener {
                override fun onSensorChanged(event: SensorEvent) {
                    try {
                        SensorManager.getRotationMatrixFromVector(rotation, event.values)
                        SensorManager.getOrientation(rotation, orientation)
                        var degrees = Math.toDegrees(orientation[0].toDouble()).toFloat()
                        degrees += declination
                        degrees = ((degrees % 360f) + 360f) % 360f
                        val previous = heading
                        heading = if (previous == null) {
                            degrees
                        } else {
                            var delta = degrees - previous
                            if (delta > 180f) delta -= 360f
                            if (delta < -180f) delta += 360f
                            ((previous + delta * 0.25f) % 360f + 360f) % 360f
                        }
                    } catch (_: Exception) {
                        heading = null
                    }
                }

                override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
            }
            manager.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_UI)
            onStopOrDispose {
                manager.unregisterListener(listener)
            }
        }
    }

    return heading
}

private fun openMaps(context: Context, device: LinkedDevice) {
    val location = device.lastLocation ?: return
    val label = Uri.encode(device.name)
    val coordinates = "${location.latitude},${location.longitude}"
    val geo = Uri.parse("geo:$coordinates?q=$coordinates($label)")
    try {
        context.startActivity(
            Intent(Intent.ACTION_VIEW, geo).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
        return
    } catch (_: Exception) {
        // Fall through to a browser-friendly map.
    }
    val fallback = Uri.parse(
        "https://www.openstreetmap.org/?mlat=${location.latitude}" +
            "&mlon=${location.longitude}#map=17/${location.latitude}/${location.longitude}",
    )
    try {
        context.startActivity(
            Intent(Intent.ACTION_VIEW, fallback).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    } catch (_: Exception) {
        Toast.makeText(context, "No maps app is available.", Toast.LENGTH_SHORT).show()
    }
}

private fun locationSummary(
    location: LinkedDeviceLocation,
    distance: Double?,
    bearing: Double?,
): String {
    if (distance == null || bearing == null) {
        return "Last known location available"
    }
    return "${distanceLabel(distance)} away  ·  ${cardinal(bearing)}"
}

private fun distanceLabel(meters: Double): String = when {
    meters < 15 -> "Right here"
    meters < 1_000 -> "${meters.roundToInt()} m"
    meters < 10_000 -> String.format(Locale.US, "%.1f km", meters / 1_000)
    else -> "${(meters / 1_000).roundToInt()} km"
}

private fun accuracyLabel(meters: Double): String = when {
    meters < 10 -> "${meters.roundToInt()} m"
    meters < 100 -> "${(meters / 5).roundToInt() * 5} m"
    else -> "${(meters / 10).roundToInt() * 10} m"
}

private fun cardinal(degrees: Double): String {
    val labels = arrayOf("N", "NE", "E", "SE", "S", "SW", "W", "NW")
    val normalized = ((degrees % 360.0) + 360.0) % 360.0
    return labels[((normalized / 45.0).roundToInt()) % 8]
}

private fun presenceLabel(presence: String): String = when (presence) {
    "online" -> "Online"
    "stale" -> "Stale"
    else -> "Offline"
}

private fun providerLabel(provider: String): String = when {
    provider.contains("gps", ignoreCase = true) -> "GPS"
    provider.contains("network", ignoreCase = true) -> "Network"
    provider.contains("passive", ignoreCase = true) -> "Passive"
    provider.isBlank() -> "Unknown"
    else -> provider.replaceFirstChar { it.uppercase() }.take(18)
}
