package dev.beacon.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import dev.beacon.app.core.BeaconState
import dev.beacon.app.core.GeofenceInfo
import dev.beacon.app.network.LinkedDevice
import dev.beacon.app.network.LinkedDeviceLocation
import dev.beacon.app.ui.AccountScreen
import dev.beacon.app.ui.AccountUiState
import dev.beacon.app.ui.GeofenceEditor
import dev.beacon.app.ui.GeofenceUiState
import dev.beacon.app.ui.HomeScreen
import dev.beacon.app.ui.PairingUiState
import dev.beacon.app.ui.UpdateUiState
import dev.beacon.app.ui.theme.BeaconTheme
import dev.beacon.app.update.UpdateInfo

/**
 * Debug-only screenshot harness.
 *
 * It renders the real screens with obviously fake data so a debug build can
 * capture UI without pairing a device or using a real account. The class lives
 * in `src/debug`, is excluded from release builds, and makes no network calls
 * of its own. Launch it with, for example:
 *
 * `adb shell am start -n dev.beacon.app.debug/dev.beacon.app.ScreenshotActivity \
 *   --es screen protection`
 */
class ScreenshotActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val screen = intent.getStringExtra(EXTRA_SCREEN) ?: "home"
        setContent {
            BeaconTheme(darkTheme = false) {
                Scaffold(
                    containerColor = MaterialTheme.colorScheme.background,
                ) { padding ->
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(padding),
                    ) {
                        when (screen) {
                            "protection", "home" -> HomeHarness()
                            "update" -> HomeHarness(update = fakeUpdate())
                            "account" -> AccountHarness(direction = false)
                            "direction" -> AccountHarness(direction = true)
                            "geofence" -> GeofenceEditor(
                                state = GeofenceUiState(
                                    open = true,
                                    locating = false,
                                    latitude = targetLatitude,
                                    longitude = targetLongitude,
                                    accuracyM = 6.0,
                                ),
                                onCenterChange = { _, _ -> },
                                onCreate = { _, _ -> },
                                onClose = {},
                            )
                            else -> HomeHarness()
                        }
                    }
                }
            }
        }
    }

    companion object {
        const val EXTRA_SCREEN = "screen"
    }
}

@Composable
private fun HomeHarness(update: UpdateUiState = UpdateUiState()) {
    HomeScreen(
        state = fakeState(),
        pairing = PairingUiState(),
        busyAction = null,
        captureWorking = false,
        lostControls = false,
        account = fakeAccount(direction = false),
        onLocate = {},
        onSync = {},
        onRequestLocation = {},
        onRequestBackground = {},
        onRequestNotifications = {},
        onRequestSms = {},
        onRequestBattery = {},
        onRequestAdmin = {},
        onOpenDashboard = {},
        onOpenPrivacy = {},
        onOpenSettings = {},
        onTakePhoto = {},
        onLinkAccount = {},
        onCancelAccountLink = {},
        onOpenAccountScreen = {},
        onSyncIntervalChanged = {},
        onOutsideIntervalChanged = {},
        onAllowScreenshotsChanged = {},
        onLockOnSimRemovalChanged = {},
        geofence = GeofenceUiState(),
        onOpenGeofence = {},
        onDeleteGeofence = {},
        update = update,
        onCheckForUpdates = {},
        onDownloadUpdate = {},
        onInstallUpdate = {},
        onDismissUpdate = {},
        onDismissPhoto = {},
        onReturnToLost = {},
        onUnpair = {},
        onResetPairing = {},
    )
}

@Composable
private fun AccountHarness(direction: Boolean) {
    AccountScreen(
        account = fakeAccount(direction = direction),
        onBack = {},
        onRefresh = {},
        onRequestLocation = {},
        onSelectDirection = {},
        onCloseDirection = {},
        onUnlink = {},
        onRequestBiometric = {},
        onRecover = {},
        onDismissRecovery = {},
        onDismissError = {},
    )
}

private fun fakeState(): BeaconState {    val now = System.currentTimeMillis()
    return BeaconState(
        paired = true,
        authRevoked = false,
        deviceName = "Pixel 7",
        ownerName = "Beacon owner",
        serverUrl = "https://beacon.example.com",
        lostMode = false,
        trackingProfile = "balanced",
        syncIntervalMinutes = 0,
        outsideGeofenceMinutes = 0,
        effectiveIntervalMinutes = 60,
        geofences = listOf(
            GeofenceInfo(
                id = "fence-home",
                name = "Home",
                centerLat = targetLatitude,
                centerLon = targetLongitude,
                radiusM = 250,
            ),
            GeofenceInfo(
                id = "fence-work",
                name = "Work",
                centerLat = 47.6062,
                centerLon = -122.3321,
                radiusM = 400,
            ),
        ),
        insideGeofenceName = "Home",
        allowScreenshots = true,
        lockOnSimRemoval = true,
        lastSyncAt = now - 90_000,
        lastError = null,
        queuedCount = 0,
        fallbackSmsMasked = null,
        pendingPhoto = null,
        ownerMessage = null,
        fineLocation = true,
        coarseLocation = true,
        backgroundLocation = true,
        notifications = false,
        sms = false,
        camera = false,
        deviceAdmin = false,
        batteryUnrestricted = false,
    )
}

private fun fakeAccount(direction: Boolean): AccountUiState {
    val now = System.currentTimeMillis()
    val current = LinkedDevice(
        id = "device-current",
        name = "Pixel 7",
        model = "Pixel 7",
        status = "active",
        presence = "online",
        batteryLevel = 82,
        isCharging = false,
        lastSeenAt = now - 60_000,
        lastLocation = LinkedDeviceLocation(
            latitude = originLatitude,
            longitude = originLongitude,
            accuracyM = 8.0,
            recordedAt = now - 60_000,
            provider = "gps",
            isMocked = false,
        ),
    )
    val other = LinkedDevice(
        id = "device-other",
        name = "Travel phone",
        model = "Pixel 6a",
        status = "active",
        presence = "online",
        batteryLevel = 64,
        isCharging = true,
        lastSeenAt = now - 180_000,
        lastLocation = LinkedDeviceLocation(
            latitude = targetLatitude,
            longitude = targetLongitude,
            accuracyM = 12.0,
            recordedAt = now - 180_000,
            provider = "gps",
            isMocked = false,
        ),
    )
    return AccountUiState(
        linked = true,
        accountName = "Beacon owner",
        accountEmailMasked = "o\u2022\u2022\u2022@example.com",
        linkedAt = now - 2 * 24 * 60 * 60 * 1000L,
        recoveryEligible = true,
        recoveryDaysRemaining = 0,
        loading = false,
        devices = listOf(current, other),
        currentDeviceId = current.id,
        originLatitude = originLatitude,
        originLongitude = originLongitude,
        originAccuracyM = 8.0,
        directionDeviceId = if (direction) other.id else null,
        busy = null,
        error = null,
        recoveryError = null,
        recoveryDone = null,
    )
}

private fun fakeUpdate(): UpdateUiState = UpdateUiState(
    info = UpdateInfo(
        versionName = "0.1.7",
        apkUrl = "https://beacon.example.com/beacon.apk",
        sha256 = "c5c9c8a01fd24d4326eb0845cd8a8742a68565c76f17e9c1c9a632b9e301af53",
        sizeBytes = 24_943_099L,
        notes = "Visible update checks and the Protection layout fix.",
    ),
    status = "Beacon 0.1.7 is available.",
    revealKey = 0L,
)

private const val originLatitude = 47.6101
private const val originLongitude = -122.3421
private const val targetLatitude = 47.6205
private const val targetLongitude = -122.3493
