package dev.beacon.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AdminPanelSettings
import androidx.compose.material.icons.rounded.AddLocationAlt
import androidx.compose.material.icons.rounded.BatteryFull
import androidx.compose.material.icons.rounded.CameraAlt
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Map
import androidx.compose.material.icons.rounded.MyLocation
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.Security
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material.icons.rounded.Sms
import androidx.compose.material.icons.rounded.Sync
import androidx.compose.material.icons.rounded.SystemUpdate
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.beacon.app.BuildConfig
import dev.beacon.app.core.BeaconState
import dev.beacon.app.core.GeofenceInfo
import dev.beacon.app.ui.components.BeaconButton
import dev.beacon.app.ui.components.BeaconCard
import dev.beacon.app.ui.components.BeaconOutlinedButton
import dev.beacon.app.ui.components.BrandMark
import dev.beacon.app.ui.components.ChecklistRow
import dev.beacon.app.ui.components.ErrorBanner
import dev.beacon.app.ui.components.FieldColors
import dev.beacon.app.ui.components.MonoLabel
import dev.beacon.app.ui.components.SectionHeader
import dev.beacon.app.ui.components.StatusDot
import dev.beacon.app.ui.components.WarningBanner
import dev.beacon.app.ui.components.Wordmark
import dev.beacon.app.ui.components.maskedHost
import dev.beacon.app.ui.components.relativeTime
import dev.beacon.app.ui.theme.Accent
import dev.beacon.app.ui.theme.BeaconTheme
import dev.beacon.app.ui.theme.Danger
import dev.beacon.app.ui.theme.Ink
import dev.beacon.app.ui.theme.MutedDark
import dev.beacon.app.ui.theme.Positive
import dev.beacon.app.ui.theme.Warning
import kotlinx.coroutines.launch

@Composable
fun BeaconApp(
    viewModel: BeaconViewModel,
    onRequestLocation: () -> Unit,
    onRequestBackground: () -> Unit,
    onRequestNotifications: () -> Unit,
    onRequestSms: () -> Unit,
    onRequestBattery: () -> Unit,
    onRequestAdmin: () -> Unit,
    onOpenDashboard: () -> Unit,
    onOpenPrivacy: () -> Unit,
    onOpenSettings: () -> Unit,
    onTakePhoto: () -> Unit,
    onSyncIntervalChanged: (Int) -> Unit,
    onAllowScreenshotsChanged: (Boolean) -> Unit,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val pairingState by viewModel.pairing.collectAsStateWithLifecycle()
    val feedback by viewModel.feedback.collectAsStateWithLifecycle()
    val busyAction by viewModel.busyAction.collectAsStateWithLifecycle()
    val capture by viewModel.capture.collectAsStateWithLifecycle()
    val update by viewModel.update.collectAsStateWithLifecycle()
    val geofence by viewModel.geofence.collectAsStateWithLifecycle()

    val systemDark = isSystemInDarkTheme()
    var ownerControls by rememberSaveable { mutableStateOf(false) }
    val lostOverlay = state.lostMode && !ownerControls && !state.authRevoked
    if (!state.lostMode && ownerControls) ownerControls = false

    val snackbarHostState = remember { SnackbarHostState() }
    LaunchedEffect(feedback?.id) {
        feedback?.let {
            snackbarHostState.showSnackbar(it.message)
            viewModel.clearFeedback()
        }
    }

    BeaconTheme(darkTheme = systemDark || lostOverlay) {
        Scaffold(
            containerColor = MaterialTheme.colorScheme.background,
            snackbarHost = {
                SnackbarHost(snackbarHostState) { data ->
                    Snackbar(
                        snackbarData = data,
                        containerColor = if (feedback?.isError == true) {
                            Danger
                        } else {
                            MaterialTheme.colorScheme.inverseSurface
                        },
                        contentColor = MaterialTheme.colorScheme.inverseOnSurface,
                        shape = RoundedCornerShape(11.dp),
                    )
                }
            },
        ) { padding ->
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
            ) {
                if (!state.paired) {
                    PairScreen(
                        state = pairingState,
                        defaultDeviceName = viewModel.defaultDeviceName(),
                        onPair = viewModel::pair,
                    )
                } else if (lostOverlay) {
                    LostScreen(
                        state = state,
                        onSilenceAlarm = viewModel::stopAlarm,
                        onDeviceStatus = { ownerControls = true },
                    )
                } else {
                    HomeScreen(
                        state = state,
                        pairing = pairingState,
                        busyAction = busyAction,
                        captureWorking = capture == CaptureState.Working,
                        lostControls = ownerControls,
                        onLocate = viewModel::locateNow,
                        onSync = viewModel::syncNow,
                        onRequestLocation = onRequestLocation,
                        onRequestBackground = onRequestBackground,
                        onRequestNotifications = onRequestNotifications,
                        onRequestSms = onRequestSms,
                        onRequestBattery = onRequestBattery,
                        onRequestAdmin = onRequestAdmin,
                        onOpenDashboard = onOpenDashboard,
                        onOpenPrivacy = onOpenPrivacy,
                        onOpenSettings = onOpenSettings,
                        onTakePhoto = onTakePhoto,
                        onSyncIntervalChanged = viewModel::setSyncInterval,
                        onAllowScreenshotsChanged = onAllowScreenshotsChanged,
                        onLockOnSimRemovalChanged = { enabled ->
                            if (enabled && !state.deviceAdmin) {
                                onRequestAdmin()
                                viewModel.notify("Enable device admin, then turn this on again.")
                            } else {
                                viewModel.setLockOnSimRemoval(enabled)
                            }
                        },
                        geofence = geofence,
                        onOpenGeofence = viewModel::openGeofenceDialog,
                        onCloseGeofence = viewModel::closeGeofenceDialog,
                        onCreateGeofence = viewModel::createGeofence,
                        onDeleteGeofence = viewModel::deleteGeofence,
                        update = update,
                        onCheckForUpdates = { viewModel.checkForUpdates() },
                        onDownloadUpdate = viewModel::downloadUpdate,
                        onInstallUpdate = viewModel::installUpdate,
                        onDismissUpdate = viewModel::dismissUpdate,
                        onDismissPhoto = viewModel::dismissPhotoRequest,
                        onReturnToLost = { ownerControls = false },
                        onUnpair = { viewModel.unpair {} },
                        onResetPairing = { viewModel.unpair {} },
                    )
                }
            }
        }
    }
}

@Composable
private fun PairScreen(
    state: PairingUiState,
    defaultDeviceName: String,
    onPair: (String, String, String) -> Unit,
) {
    var code by rememberSaveable { mutableStateOf(state.prefilledCode) }
    var server by rememberSaveable { mutableStateOf(state.prefilledServer) }
    var name by rememberSaveable { mutableStateOf(defaultDeviceName) }
    var showServer by rememberSaveable { mutableStateOf(false) }
    val focus = LocalFocusManager.current

    LaunchedEffect(state.prefilledCode) {
        if (state.prefilledCode.isNotBlank() && code.isBlank()) code = state.prefilledCode
    }
    LaunchedEffect(state.prefilledServer) {
        if (state.prefilledServer.isNotBlank()) server = state.prefilledServer
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .imePadding()
            .padding(horizontal = 22.dp),
    ) {
        Spacer(Modifier.height(22.dp))
        Wordmark()
        Spacer(Modifier.height(46.dp))
        MonoLabel("Android device pairing")
        Spacer(Modifier.height(12.dp))
        Text(
            text = "Pair this phone.",
            style = MaterialTheme.typography.displayLarge,
        )
        Spacer(Modifier.height(14.dp))
        Text(
            text = "Enter the single-use code from your Beacon dashboard. The phone receives its own revocable token, never your account password.",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        if (state.inviteLoaded) {
            Spacer(Modifier.height(16.dp))
            Surface(
                shape = RoundedCornerShape(11.dp),
                color = Positive.copy(alpha = 0.1f),
                border = androidx.compose.foundation.BorderStroke(1.dp, Positive.copy(alpha = 0.3f)),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 13.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    StatusDot(Positive)
                    Text(
                        "Pairing invite loaded from the QR link.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }

        Spacer(Modifier.height(30.dp))
        OutlinedTextField(
            value = code,
            onValueChange = { input ->
                val raw = input.filter { it.isLetterOrDigit() }.uppercase().take(8)
                code = if (raw.length > 4) "${raw.take(4)}-${raw.drop(4)}" else raw
            },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Pairing code") },
            placeholder = {
                Text(
                    "XXXX-XXXX",
                    fontFamily = FontFamily.Monospace,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                )
            },
            textStyle = MaterialTheme.typography.headlineMedium.copy(
                fontFamily = FontFamily.Monospace,
                letterSpacing = 1.5.sp,
            ),
            singleLine = true,
            keyboardOptions = KeyboardOptions(
                capitalization = KeyboardCapitalization.Characters,
                keyboardType = KeyboardType.Ascii,
                imeAction = ImeAction.Next,
            ),
            colors = FieldColors(),
            shape = RoundedCornerShape(11.dp),
        )

        Spacer(Modifier.height(14.dp))
        OutlinedTextField(
            value = name,
            onValueChange = { name = it.take(80) },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Device name") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
            colors = FieldColors(),
            shape = RoundedCornerShape(11.dp),
        )

        Spacer(Modifier.height(4.dp))
        TextButton(
            onClick = { showServer = !showServer },
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 2.dp),
        ) {
            Text(
                if (showServer) "Hide server" else "Self-hosted server",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Icon(
                Icons.Rounded.ChevronRight,
                contentDescription = null,
                modifier = Modifier
                    .size(14.dp)
                    .padding(start = 2.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (showServer || state.inviteLoaded) {
            OutlinedTextField(
                value = server,
                onValueChange = { server = it.take(300) },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Server URL") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Uri,
                    imeAction = ImeAction.Done,
                ),
                colors = FieldColors(),
                shape = RoundedCornerShape(11.dp),
            )
            Spacer(Modifier.height(6.dp))
            Text(
                "HTTPS only. The default is ${maskedHost(server)}.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        if (state.error != null) {
            Spacer(Modifier.height(16.dp))
            ErrorBanner(state.error)
        }

        Spacer(Modifier.height(22.dp))
        BeaconButton(
            text = "Pair device",
            onClick = {
                focus.clearFocus()
                onPair(code, server, name)
            },
            modifier = Modifier.fillMaxWidth(),
            loading = state.busy,
        )

        Spacer(Modifier.height(18.dp))
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(
                Icons.Rounded.Lock,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(13.dp),
            )
            Text(
                "The token is sealed in the Android Keystore. Pairing codes expire after ten minutes.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(Modifier.height(34.dp))
    }
}

@Composable
private fun HomeScreen(
    state: BeaconState,
    pairing: PairingUiState,
    busyAction: String?,
    captureWorking: Boolean,
    lostControls: Boolean,
    onLocate: () -> Unit,
    onSync: () -> Unit,
    onRequestLocation: () -> Unit,
    onRequestBackground: () -> Unit,
    onRequestNotifications: () -> Unit,
    onRequestSms: () -> Unit,
    onRequestBattery: () -> Unit,
    onRequestAdmin: () -> Unit,
    onOpenDashboard: () -> Unit,
    onOpenPrivacy: () -> Unit,
    onOpenSettings: () -> Unit,
    onTakePhoto: () -> Unit,
    onSyncIntervalChanged: (Int) -> Unit,
    onAllowScreenshotsChanged: (Boolean) -> Unit,
    onLockOnSimRemovalChanged: (Boolean) -> Unit,
    geofence: GeofenceUiState,
    onOpenGeofence: () -> Unit,
    onCloseGeofence: () -> Unit,
    onCreateGeofence: (String, Int) -> Unit,
    onDeleteGeofence: (String) -> Unit,
    update: UpdateUiState,
    onCheckForUpdates: () -> Unit,
    onDownloadUpdate: () -> Unit,
    onInstallUpdate: () -> Unit,
    onDismissUpdate: () -> Unit,
    onDismissPhoto: () -> Unit,
    onReturnToLost: () -> Unit,
    onUnpair: () -> Unit,
    onResetPairing: () -> Unit,
) {
    var showUnpair by rememberSaveable { mutableStateOf(false) }
    var showInterval by rememberSaveable { mutableStateOf(false) }
    val pendingPhoto = state.pendingPhoto?.takeIf { it.expiresAt > System.currentTimeMillis() }
    val statusText = when {
        state.authRevoked -> "Revoked"
        state.lostMode -> "Lost mode"
        !state.fineLocation && !state.coarseLocation -> "Permission needed"
        else -> "Protected"
    }
    val statusTint = when {
        state.authRevoked -> Danger
        state.lostMode -> Warning
        !state.fineLocation && !state.coarseLocation -> Warning
        else -> Positive
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp),
    ) {
        Spacer(Modifier.height(14.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Wordmark(compact = true)
            Spacer(Modifier.weight(1f))
            Surface(
                shape = CircleShape,
                color = statusTint.copy(alpha = 0.12f),
                border = androidx.compose.foundation.BorderStroke(1.dp, statusTint.copy(alpha = 0.25f)),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 11.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    StatusDot(statusTint)
                    Text(
                        statusText,
                        style = MaterialTheme.typography.labelMedium,
                        color = statusTint,
                    )
                }
            }
        }

        Spacer(Modifier.height(18.dp))
        BeaconCard {
            Column(modifier = Modifier.padding(18.dp)) {
                MonoLabel(
                    if (state.lostMode) "Lost mode active" else "Protected device",
                    color = if (state.lostMode) Warning else Accent,
                )
                Spacer(Modifier.height(9.dp))
                Text(
                    state.deviceName.ifBlank { "Android device" },
                    style = MaterialTheme.typography.headlineMedium,
                )
                Spacer(Modifier.height(5.dp))
                Text(
                    "Paired to ${state.ownerName.ifBlank { "your Beacon account" }}  ·  ${maskedHost(state.serverUrl)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                Spacer(Modifier.height(18.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    HeroStat(
                        label = "Last contact",
                        value = relativeTime(state.lastSyncAt),
                        modifier = Modifier.weight(1f),
                    )
                    HeroStat(
                        label = "Offline queue",
                        value = if (state.queuedCount == 0) "Empty" else "${state.queuedCount}",
                        modifier = Modifier.weight(1f),
                    )
                    HeroStat(
                        label = "Profile",
                        value = profileLabel(state.trackingProfile),
                        modifier = Modifier.weight(1f),
                    )
                }

                Spacer(Modifier.height(18.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                    BeaconButton(
                        text = "Locate now",
                        onClick = onLocate,
                        modifier = Modifier.weight(1f),
                        loading = busyAction == "Locate now",
                        enabled = !state.authRevoked,
                        icon = Icons.Rounded.MyLocation,
                    )
                    BeaconOutlinedButton(
                        text = "Sync now",
                        onClick = onSync,
                        modifier = Modifier.weight(1f),
                        loading = busyAction == "Sync now",
                        enabled = !state.authRevoked,
                        icon = Icons.Rounded.Sync,
                    )
                }
            }
        }

        if (lostControls && state.lostMode) {
            Spacer(Modifier.height(12.dp))
            WarningBanner("Lost mode remains active. Only the dashboard can disable it.")
            TextButton(onClick = onReturnToLost) {
                Text("Return to lost screen", style = MaterialTheme.typography.labelMedium)
            }
        }

        if (state.authRevoked) {
            Spacer(Modifier.height(12.dp))
            ErrorBanner(
                "This device was unpaired or its token was revoked. Location sync has stopped.",
            )
            Spacer(Modifier.height(8.dp))
            BeaconButton(
                text = "Pair this device again",
                onClick = { showUnpair = true },
                modifier = Modifier.fillMaxWidth(),
            )
        } else if (state.lastError != null) {
            Spacer(Modifier.height(12.dp))
            WarningBanner(state.lastError)
        }

        if (pendingPhoto != null) {
            Spacer(Modifier.height(12.dp))
            Surface(
                shape = RoundedCornerShape(16.dp),
                color = Accent.copy(alpha = 0.08f),
                border = androidx.compose.foundation.BorderStroke(1.dp, Accent.copy(alpha = 0.35f)),
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Rounded.CameraAlt,
                            contentDescription = null,
                            tint = Accent,
                            modifier = Modifier.size(18.dp),
                        )
                        Spacer(Modifier.width(9.dp))
                        Text("Photo requested", style = MaterialTheme.typography.titleMedium)
                    }
                    Spacer(Modifier.height(7.dp))
                    Text(
                        "Your Beacon account asked for a photo. Android only allows camera access while the app is open, so this is never silent.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        BeaconButton(
                            text = "Take photo",
                            onClick = onTakePhoto,
                            modifier = Modifier.weight(1f),
                            loading = captureWorking,
                            icon = Icons.Rounded.CameraAlt,
                        )
                        TextButton(onClick = onDismissPhoto) {
                            Text("Not now", style = MaterialTheme.typography.labelMedium)
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(24.dp))
        SectionHeader("Protection", "${safeguardCount(state)}/${safeguardTotal(state)} on")
        Spacer(Modifier.height(9.dp))
        BeaconCard {
            var row = 0
            val totalRows = safeguardTotal(state)
            ChecklistRow(
                icon = Icons.Rounded.MyLocation,
                title = "Foreground location",
                description = "Precise or approximate location while the app is open.",
                done = state.fineLocation || state.coarseLocation,
                actionLabel = "Allow",
                onAction = onRequestLocation,
                last = ++row == totalRows,
            )
            ChecklistRow(
                icon = Icons.Rounded.Map,
                title = "Background location",
                description = if (state.fineLocation || state.coarseLocation) {
                    "Keep working when the screen is off. Android requires All the time."
                } else {
                    "Grant foreground location first, then choose All the time."
                },
                done = state.backgroundLocation,
                actionLabel = "All the time",
                onAction = if (state.fineLocation || state.coarseLocation) {
                    onRequestBackground
                } else {
                    onRequestLocation
                },
                last = ++row == totalRows,
            )
            ChecklistRow(
                icon = Icons.Rounded.Notifications,
                title = "Notifications",
                description = "Remote messages, alarms and lost-mode status.",
                done = state.notifications,
                actionLabel = "Enable",
                onAction = onRequestNotifications,
                last = ++row == totalRows,
            )
            ChecklistRow(
                icon = Icons.Rounded.BatteryFull,
                title = "Battery unrestricted",
                description = "Reduces Doze delays on aggressive Android builds.",
                done = state.batteryUnrestricted,
                actionLabel = "Allow",
                onAction = onRequestBattery,
                last = ++row == totalRows,
            )
            ChecklistRow(
                icon = Icons.Rounded.Security,
                title = "Device admin",
                description = "Only used to lock the screen on request. No erase or password access.",
                done = state.deviceAdmin,
                actionLabel = "Enable",
                onAction = onRequestAdmin,
                last = ++row == totalRows,
            )
            if (state.fallbackSmsMasked != null) {
                ChecklistRow(
                    icon = Icons.Rounded.Sms,
                    title = "SMS fallback",
                    description = "Sends a map link to ${state.fallbackSmsMasked} only when mobile data is unavailable.",
                    done = state.sms,
                    actionLabel = "Allow",
                    onAction = onRequestSms,
                    last = ++row == totalRows,
                )
            }
        }

        Spacer(Modifier.height(16.dp))
        Surface(
            shape = RoundedCornerShape(12.dp),
            color = MaterialTheme.colorScheme.surface,
            border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        ) {
            Row(
                modifier = Modifier.padding(14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    Icons.Rounded.Lock,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(16.dp),
                )
                Spacer(Modifier.width(10.dp))
                Text(
                    if (state.queuedCount == 0) {
                        "The offline queue is empty. New fixes are encrypted before they are stored."
                    } else {
                        "${state.queuedCount} location points are encrypted on this device and waiting to upload."
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        if (update.info != null) {
            val info = update.info
            Spacer(Modifier.height(26.dp))
            SectionHeader("App update")
            Spacer(Modifier.height(9.dp))
            BeaconCard {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Rounded.SystemUpdate,
                            contentDescription = null,
                            tint = Accent,
                            modifier = Modifier.size(20.dp),
                        )
                        Spacer(Modifier.width(10.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                "Beacon ${info.versionName} is available",
                                style = MaterialTheme.typography.titleMedium,
                            )
                            Text(
                                "This phone runs ${BuildConfig.VERSION_NAME}.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    if (info.notes.isNotBlank()) {
                        Spacer(Modifier.height(10.dp))
                        Text(
                            info.notes,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 5,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Spacer(Modifier.height(13.dp))
                    when {
                        update.downloading -> {
                            LinearProgressIndicator(
                                progress = { update.progress / 100f },
                                modifier = Modifier.fillMaxWidth(),
                                color = Accent,
                            )
                            Spacer(Modifier.height(8.dp))
                            Text(
                                "Downloading ${update.progress}%",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        update.readyToInstall -> BeaconButton(
                            text = "Install update",
                            onClick = onInstallUpdate,
                            modifier = Modifier.fillMaxWidth(),
                            icon = Icons.Rounded.SystemUpdate,
                        )
                        else -> BeaconButton(
                            text = "Download update",
                            onClick = onDownloadUpdate,
                            modifier = Modifier.fillMaxWidth(),
                            icon = Icons.Rounded.SystemUpdate,
                        )
                    }
                    if (update.error != null) {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            update.error,
                            style = MaterialTheme.typography.bodySmall,
                            color = Danger,
                        )
                    }
                    TextButton(onClick = onDismissUpdate) {
                        Text("Later", style = MaterialTheme.typography.labelMedium)
                    }
                }
            }
        }

        Spacer(Modifier.height(26.dp))
        SectionHeader("Check-in")
        Spacer(Modifier.height(9.dp))
        BeaconCard {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    "How often this phone uploads its location and asks the server for new commands.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(12.dp))
                BeaconOutlinedButton(
                    text = intervalLabel(state.syncIntervalMinutes),
                    onClick = { showInterval = true },
                    modifier = Modifier.fillMaxWidth(),
                    icon = Icons.Rounded.Schedule,
                )
                Spacer(Modifier.height(10.dp))
                Text(
                    checkInDescription(state),
                    style = MaterialTheme.typography.bodySmall,
                    color = if (state.syncIntervalMinutes in 1 until 15) Warning else MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (state.syncIntervalMinutes in 1 until 15) {
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "Intervals under 15 minutes run through a foreground service, so Android keeps a notification visible. Battery use rises.",
                        style = MaterialTheme.typography.bodySmall,
                        color = Warning,
                    )
                }
            }
        }

        Spacer(Modifier.height(26.dp))
        SectionHeader("Geofences", "${state.geofences.size}/20")
        Spacer(Modifier.height(9.dp))
        BeaconCard {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    "Draw a circle around a place you trust. Automatic check-in relaxes inside a fence and speeds up outside every fence.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (state.geofences.isEmpty()) {
                    Spacer(Modifier.height(10.dp))
                    Text(
                        "No geofences yet.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    Spacer(Modifier.height(6.dp))
                    state.geofences.forEachIndexed { index, fence ->
                        if (index > 0) {
                            HorizontalDivider(
                                color = MaterialTheme.colorScheme.outline.copy(alpha = 0.65f),
                            )
                        }
                        GeofenceRow(
                            fence = fence,
                            deleting = geofence.deletingId == fence.id,
                            deleteEnabled = geofence.deletingId == null,
                            onDelete = { onDeleteGeofence(fence.id) },
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        StatusDot(
                            if (state.insideGeofenceName != null) Positive else MutedDark,
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(
                            state.insideGeofenceName?.let { "Inside $it" }
                                ?: "Outside all fences",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                Spacer(Modifier.height(12.dp))
                BeaconOutlinedButton(
                    text = "Add current place",
                    onClick = onOpenGeofence,
                    modifier = Modifier.fillMaxWidth(),
                    loading = geofence.locating,
                    icon = Icons.Rounded.AddLocationAlt,
                )
            }
        }

        Spacer(Modifier.height(26.dp))
        SectionHeader("Device")
        Spacer(Modifier.height(9.dp))
        BeaconCard {
            Column {
                InfoRow("Server", maskedHost(state.serverUrl))
                HorizontalDivider(
                    modifier = Modifier.padding(horizontal = 15.dp),
                    color = MaterialTheme.colorScheme.outline.copy(alpha = 0.65f),
                )
                InfoRow("Tracking profile", profileLabel(state.trackingProfile))
                HorizontalDivider(
                    modifier = Modifier.padding(horizontal = 15.dp),
                    color = MaterialTheme.colorScheme.outline.copy(alpha = 0.65f),
                )
                InfoRow("App version", BuildConfig.VERSION_NAME)
                HorizontalDivider(
                    modifier = Modifier.padding(horizontal = 15.dp),
                    color = MaterialTheme.colorScheme.outline.copy(alpha = 0.65f),
                )
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 15.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            "Lock on SIM removal",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        Text(
                            if (state.deviceAdmin) {
                                "Locks the screen when the SIM tray is opened. A thief can still avoid it by not touching the SIM."
                            } else {
                                "Needs device admin. Android allows the lock, not a remote wipe."
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 2.dp),
                        )
                    }
                    Spacer(Modifier.width(12.dp))
                    Switch(
                        checked = state.lockOnSimRemoval,
                        onCheckedChange = onLockOnSimRemovalChanged,
                    )
                }
                HorizontalDivider(
                    modifier = Modifier.padding(horizontal = 15.dp),
                    color = MaterialTheme.colorScheme.outline.copy(alpha = 0.65f),
                )
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 15.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            "Allow screenshots",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        Text(
                            "Off by default, because screenshots and the recent-apps preview can expose coordinates.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 2.dp),
                        )
                    }
                    Spacer(Modifier.width(12.dp))
                    Switch(
                        checked = state.allowScreenshots,
                        onCheckedChange = onAllowScreenshotsChanged,
                    )
                }
                HorizontalDivider(
                    modifier = Modifier.padding(horizontal = 15.dp),
                    color = MaterialTheme.colorScheme.outline.copy(alpha = 0.65f),
                )
                Box(modifier = Modifier.padding(15.dp)) {
                    BeaconOutlinedButton(
                        text = "Check for updates",
                        onClick = onCheckForUpdates,
                        modifier = Modifier.fillMaxWidth(),
                        loading = update.checking,
                        icon = Icons.Rounded.SystemUpdate,
                    )
                }
            }
        }

        Spacer(Modifier.height(14.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            TextButton(onClick = onOpenDashboard) {
                Text("Dashboard", style = MaterialTheme.typography.labelMedium)
            }
            TextButton(onClick = onOpenPrivacy) {
                Text("Privacy", style = MaterialTheme.typography.labelMedium)
            }
            TextButton(onClick = onOpenSettings) {
                Text("App settings", style = MaterialTheme.typography.labelMedium)
            }
        }
        Spacer(Modifier.height(2.dp))
        TextButton(
            onClick = { showUnpair = true },
            colors = ButtonDefaults.textButtonColors(contentColor = Danger),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 4.dp),
        ) {
            Text("Unpair this device", style = MaterialTheme.typography.labelMedium)
        }
        Spacer(Modifier.height(6.dp))
        Text(
            "Beacon ${BuildConfig.VERSION_NAME}  ·  ${maskedHost(state.serverUrl)}",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontFamily = FontFamily.Monospace,
        )
        Spacer(Modifier.height(30.dp))
    }

    if (showUnpair) {
        AlertDialog(
            onDismissRequest = { showUnpair = false },
            shape = RoundedCornerShape(16.dp),
            containerColor = MaterialTheme.colorScheme.surface,
            title = {
                Text(
                    if (state.authRevoked) "Reset this pairing?" else "Unpair this device?",
                    style = MaterialTheme.typography.titleLarge,
                )
            },
            text = {
                Text(
                    if (state.authRevoked) {
                        "The local token and any queued points are deleted. Enter a fresh pairing code afterwards."
                    } else {
                        "The local token and every queued location are deleted. Revoke the device in the dashboard too if it is still listed."
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showUnpair = false
                        if (state.authRevoked) onResetPairing() else onUnpair()
                    },
                    colors = ButtonDefaults.textButtonColors(contentColor = Danger),
                ) {
                    Text(if (state.authRevoked) "Reset" else "Unpair")
                }
            },
            dismissButton = {
                TextButton(onClick = { showUnpair = false }) {
                    Text("Cancel")
                }
            },
        )
    }

    if (showInterval) {
        AlertDialog(
            onDismissRequest = { showInterval = false },
            shape = RoundedCornerShape(16.dp),
            containerColor = MaterialTheme.colorScheme.surface,
            title = {
                Text("Check-in interval", style = MaterialTheme.typography.titleLarge)
            },
            text = {
                Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                    Text(
                        "Automatic follows the profile set in the dashboard. Fixed intervals override it on this phone.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(8.dp))
                    listOf(0, 1, 2, 5, 15, 30, 60).forEach { minutes ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    showInterval = false
                                    onSyncIntervalChanged(minutes)
                                }
                                .padding(vertical = 11.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                intervalLabel(minutes),
                                style = MaterialTheme.typography.bodyMedium,
                                modifier = Modifier.weight(1f),
                            )
                            if (state.syncIntervalMinutes == minutes) {
                                Icon(
                                    Icons.Rounded.Check,
                                    contentDescription = null,
                                    tint = Accent,
                                    modifier = Modifier.size(18.dp),
                                )
                            }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showInterval = false }) {
                    Text("Close")
                }
            },
        )
    }

    if (geofence.open) {
        GeofenceDialog(
            state = geofence,
            onCreate = onCreateGeofence,
            onClose = onCloseGeofence,
        )
    }
}

@Composable
private fun GeofenceDialog(
    state: GeofenceUiState,
    onCreate: (String, Int) -> Unit,
    onClose: () -> Unit,
) {
    var name by rememberSaveable { mutableStateOf("") }
    var radius by rememberSaveable { mutableStateOf(250) }

    LaunchedEffect(state.open) {
        if (state.open) {
            name = ""
            radius = 250
        }
    }

    AlertDialog(
        onDismissRequest = { if (!state.creating) onClose() },
        shape = RoundedCornerShape(16.dp),
        containerColor = MaterialTheme.colorScheme.surface,
        title = {
            Text("Add current place", style = MaterialTheme.typography.titleLarge)
        },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                when {
                    state.locating -> Row(
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            strokeWidth = 2.dp,
                            color = Accent,
                        )
                        Spacer(Modifier.width(10.dp))
                        Text(
                            "Finding your location…",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    state.latitude != null && state.longitude != null -> Text(
                        "Center: ${"%.5f".format(java.util.Locale.US, state.latitude)}, " +
                            "${"%.5f".format(java.util.Locale.US, state.longitude)}" +
                            (state.accuracyM?.let { "  (±${it.toInt()} m)" } ?: ""),
                        style = MaterialTheme.typography.bodySmall,
                        fontFamily = FontFamily.Monospace,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (state.error != null) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        state.error,
                        style = MaterialTheme.typography.bodySmall,
                        color = Danger,
                    )
                }
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
                Spacer(Modifier.height(16.dp))
                Text("Radius", style = MaterialTheme.typography.titleSmall)
                listOf(100, 250, 500, 1000, 2000).forEach { option ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { radius = option }
                            .padding(vertical = 9.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            radiusLabel(option),
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.weight(1f),
                        )
                        if (radius == option) {
                            Icon(
                                Icons.Rounded.Check,
                                contentDescription = null,
                                tint = Accent,
                                modifier = Modifier.size(18.dp),
                            )
                        }
                    }
                }
                Text(
                    "Your account can alert you on enter and exit. Automatic check-in also relaxes inside a fence and speeds up outside every fence.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onCreate(name, radius) },
                enabled = !state.creating &&
                    !state.locating &&
                    state.latitude != null &&
                    name.isNotBlank(),
            ) {
                Text(if (state.creating) "Creating…" else "Create")
            }
        },
        dismissButton = {
            TextButton(onClick = onClose, enabled = !state.creating) {
                Text("Cancel")
            }
        },
    )
}

@Composable
private fun GeofenceRow(
    fence: GeofenceInfo,
    deleting: Boolean,
    deleteEnabled: Boolean,
    onDelete: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            Icons.Rounded.Map,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(18.dp),
        )
        Spacer(Modifier.width(10.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                fence.name,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                "${radiusLabel(fence.radiusM)} radius",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (deleting) {
            CircularProgressIndicator(
                modifier = Modifier.size(16.dp),
                strokeWidth = 2.dp,
                color = Accent,
            )
        } else {
            TextButton(
                onClick = onDelete,
                enabled = deleteEnabled,
                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 8.dp),
            ) {
                Text(
                    "Remove",
                    style = MaterialTheme.typography.labelMedium,
                    color = Danger,
                )
            }
        }
    }
}

private fun checkInDescription(state: BeaconState): String = when {
    state.syncIntervalMinutes > 0 ->
        "Fixed intervals ignore geofences and the dashboard profile."
    state.geofences.isEmpty() ->
        "Automatic follows the dashboard profile: ${everyMinutes(state.effectiveIntervalMinutes)}."
    state.insideGeofenceName != null ->
        "Inside ${state.insideGeofenceName}: ${everyMinutes(state.effectiveIntervalMinutes)}. It speeds up after the phone leaves."
    else ->
        "Outside all fences: ${everyMinutes(state.effectiveIntervalMinutes)}. It relaxes inside a fence."
}

private fun everyMinutes(minutes: Int): String =
    "every $minutes minute${if (minutes == 1) "" else "s"}"

private fun radiusLabel(meters: Int): String = when {
    meters >= 1000 && meters % 1000 == 0 -> "${meters / 1000} km"
    meters >= 1000 -> "${"%.1f".format(java.util.Locale.US, meters / 1000.0)} km"
    else -> "$meters m"
}

private fun intervalLabel(minutes: Int): String = when (minutes) {
    0 -> "Automatic"
    1 -> "Every minute"
    else -> "Every $minutes minutes"
}

@Composable
private fun LostScreen(
    state: BeaconState,
    onSilenceAlarm: () -> Unit,
    onDeviceStatus: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp),
    ) {
        Spacer(Modifier.height(26.dp))
        Wordmark()
        Spacer(Modifier.height(46.dp))
        Box(
            modifier = Modifier
                .width(58.dp)
                .height(3.dp)
                .background(Accent, RoundedCornerShape(2.dp)),
        )
        Spacer(Modifier.height(18.dp))
        MonoLabel("Lost mode active", color = Accent)
        Spacer(Modifier.height(12.dp))
        Text(
            "This device is reported lost.",
            style = MaterialTheme.typography.displayLarge,
        )
        Spacer(Modifier.height(16.dp))
        Text(
            "Please return it to its owner. Beacon is sharing this device's location with the account that reported it lost.",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        if (state.ownerName.isNotBlank()) {
            Spacer(Modifier.height(20.dp))
            Surface(
                shape = RoundedCornerShape(13.dp),
                color = MaterialTheme.colorScheme.surface,
                border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    MonoLabel("Owner")
                    Spacer(Modifier.height(6.dp))
                    Text(state.ownerName, style = MaterialTheme.typography.titleLarge)
                }
            }
        }

        if (!state.ownerMessage.isNullOrBlank()) {
            Spacer(Modifier.height(12.dp))
            Surface(
                shape = RoundedCornerShape(13.dp),
                color = Accent.copy(alpha = 0.09f),
                border = androidx.compose.foundation.BorderStroke(1.dp, Accent.copy(alpha = 0.3f)),
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    MonoLabel("Message from the owner", color = Accent)
                    Spacer(Modifier.height(8.dp))
                    Text(state.ownerMessage, style = MaterialTheme.typography.bodyLarge)
                }
            }
        }

        Spacer(Modifier.height(30.dp))
        BeaconOutlinedButton(
            text = "Silence alarm",
            onClick = onSilenceAlarm,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(10.dp))
        TextButton(
            onClick = onDeviceStatus,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Device status", style = MaterialTheme.typography.labelMedium)
        }

        Spacer(Modifier.height(26.dp))
        Text(
            "Lost mode cannot be disabled from this screen. The account owner can turn it off from the Beacon dashboard.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(30.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            BrandMark(modifier = Modifier.size(14.dp), tint = MutedDark)
            Spacer(Modifier.width(6.dp))
            Text(
                "BEACON",
                style = MaterialTheme.typography.labelSmall,
                color = MutedDark,
            )
        }
        Spacer(Modifier.height(34.dp))
    }
}

@Composable
private fun HeroStat(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier = modifier) {
        MonoLabel(label)
        Spacer(Modifier.height(4.dp))
        Text(
            value,
            style = MaterialTheme.typography.titleMedium,
            maxLines = 1,
        )
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 15.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f),
        )
        Text(
            value,
            style = MaterialTheme.typography.bodySmall,
            fontFamily = FontFamily.Monospace,
            maxLines = 1,
        )
    }
}

private fun profileLabel(profile: String): String = when (profile) {
    "low" -> "Battery saver"
    "high" -> "High accuracy"
    else -> "Balanced"
}

private fun safeguardTotal(state: BeaconState): Int =
    5 + if (state.fallbackSmsMasked != null) 1 else 0

private fun safeguardCount(state: BeaconState): Int {
    var count = 0
    if (state.fineLocation || state.coarseLocation) count++
    if (state.backgroundLocation) count++
    if (state.notifications) count++
    if (state.batteryUnrestricted) count++
    if (state.deviceAdmin) count++
    if (state.fallbackSmsMasked != null && state.sms) count++
    return count
}
