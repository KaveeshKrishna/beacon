package dev.beacon.app.ui

import android.app.Application
import android.net.Uri
import android.os.Build
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import dev.beacon.app.BuildConfig
import dev.beacon.app.BeaconApplication
import dev.beacon.app.core.Pairing
import dev.beacon.app.location.TrackingScheduler
import dev.beacon.app.media.PhotoProcessor
import dev.beacon.app.network.ApiClient
import dev.beacon.app.network.ApiResult
import dev.beacon.app.notifications.NotificationHelper
import dev.beacon.app.sync.SyncEngine
import dev.beacon.app.sync.SyncTrigger
import dev.beacon.app.update.InstallResult
import dev.beacon.app.update.UpdateCheck
import dev.beacon.app.update.UpdateChecker
import dev.beacon.app.update.UpdateInfo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File

data class PairingUiState(
    val busy: Boolean = false,
    val error: String? = null,
    val prefilledCode: String = "",
    val prefilledServer: String = BuildConfig.BEACON_BASE_URL,
    val inviteLoaded: Boolean = false,
)

data class Feedback(
    val message: String,
    val isError: Boolean,
    val id: Long = System.nanoTime(),
)

sealed interface CaptureState {
    data object Idle : CaptureState
    data object Working : CaptureState
}

data class UpdateUiState(
    val checking: Boolean = false,
    val info: UpdateInfo? = null,
    val downloading: Boolean = false,
    val progress: Int = 0,
    val readyToInstall: Boolean = false,
    val error: String? = null,
)

class BeaconViewModel(application: Application) : AndroidViewModel(application) {
    private val app = application as BeaconApplication
    private val container = app.container

    val state = container.state

    private val _pairing = MutableStateFlow(PairingUiState())
    val pairing: StateFlow<PairingUiState> = _pairing.asStateFlow()

    private val _feedback = MutableStateFlow<Feedback?>(null)
    val feedback: StateFlow<Feedback?> = _feedback.asStateFlow()

    private val _busyAction = MutableStateFlow<String?>(null)
    val busyAction: StateFlow<String?> = _busyAction.asStateFlow()

    private val _capture = MutableStateFlow<CaptureState>(CaptureState.Idle)
    val capture: StateFlow<CaptureState> = _capture.asStateFlow()

    private val checker = UpdateChecker(app)
    private val _update = MutableStateFlow(UpdateUiState())
    val update: StateFlow<UpdateUiState> = _update.asStateFlow()

    init {
        cleanupExpiredPhoto()
        autoCheckForUpdates()
    }

    fun refresh() {
        container.refresh()
        cleanupExpiredPhoto()
    }

    fun handleDeepLink(uri: Uri?) {
        if (uri == null) return
        if (!uri.scheme.equals("beacon", ignoreCase = true)) return
        if (!uri.host.equals("pair", ignoreCase = true)) return
        val code = uri.getQueryParameter("code").orEmpty()
        val server = uri.getQueryParameter("server").orEmpty()
        _pairing.update {
            it.copy(
                prefilledCode = code.takeIf { value -> value.isNotBlank() } ?: it.prefilledCode,
                prefilledServer = server.takeIf { value -> value.isNotBlank() } ?: it.prefilledServer,
                inviteLoaded = code.isNotBlank(),
                error = null,
            )
        }
    }

    fun clearInvite() {
        _pairing.update { it.copy(inviteLoaded = false) }
    }

    fun pair(codeInput: String, serverInput: String, nameInput: String) {
        if (_pairing.value.busy) return
        val code = codeInput.replace(Regex("[^A-Za-z0-9]"), "").uppercase()
        if (code.length != 8) {
            _pairing.update { it.copy(error = "Enter the eight-character pairing code.") }
            return
        }
        val server = ApiClient.normalizeServerUrl(serverInput)
        if (server == null) {
            _pairing.update { it.copy(error = "Enter a valid HTTPS server address.") }
            return
        }
        val name = nameInput.trim().ifBlank { defaultDeviceName() }.take(80)
        if (container.prefs.pairing() != null) {
            _pairing.update { it.copy(error = "This device is already paired. Unpair it first.") }
            return
        }

        _pairing.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            val result = container.api.pair(
                serverUrl = server,
                code = code,
                name = name,
                manufacturer = Build.MANUFACTURER.take(80),
                model = Build.MODEL.take(80),
                androidVersion = Build.VERSION.RELEASE.take(40),
                appVersion = BuildConfig.VERSION_NAME.take(40),
            )
            when (result) {
                is ApiResult.Success -> {
                    container.prefs.savePairing(
                        Pairing(
                            deviceId = result.value.deviceId,
                            token = result.value.token,
                            serverUrl = server,
                            deviceName = result.value.deviceName.ifBlank { name },
                            ownerName = result.value.ownerName,
                        ),
                    )
                    _pairing.value = PairingUiState()
                    TrackingScheduler.scheduleFromPreferences(app, container.prefs)
                    TrackingScheduler.syncSoon(app)
                    container.refresh()
                    checkForUpdates(manual = false)
                    _feedback.value = Feedback("Device paired. Grant the permissions below.", false)
                }
                is ApiResult.Failure -> {
                    _pairing.update { it.copy(busy = false, error = result.message) }
                }
            }
        }
    }

    fun syncNow() = runSync("Sync now", SyncTrigger.COMMAND_POLL)

    fun locateNow() = runSync("Locate now", SyncTrigger.MANUAL)

    fun setSyncInterval(minutes: Int) {
        container.prefs.syncIntervalMinutes = minutes
        TrackingScheduler.scheduleFromPreferences(app, container.prefs)
        container.refresh()
        _feedback.value = Feedback(
            if (minutes == 0) {
                "Check-in set to automatic."
            } else {
                "Check-in set to every $minutes minute${if (minutes == 1) "" else "s"}."
            },
            false,
        )
    }

    fun setAllowScreenshots(enabled: Boolean) {
        container.prefs.allowScreenshots = enabled
        container.refresh()
    }

    private fun autoCheckForUpdates() {
        if (container.prefs.pairing() == null) return
        val last = container.prefs.lastUpdateCheckAt
        if (System.currentTimeMillis() - last < UPDATE_CHECK_GAP_MS) return
        checkForUpdates(manual = false)
    }

    fun checkForUpdates(manual: Boolean = true) {
        if (_update.value.checking || _update.value.downloading) return
        val pairing = container.prefs.pairing()
        if (pairing == null) {
            if (manual) _feedback.value = Feedback("Pair this device first.", true)
            return
        }
        _update.update { it.copy(checking = true, error = null) }
        container.prefs.lastUpdateCheckAt = System.currentTimeMillis()
        viewModelScope.launch {
            try {
                when (val result = checker.check(pairing.serverUrl)) {
                    UpdateCheck.Disabled -> {
                        _update.value = UpdateUiState()
                        if (manual) {
                            _feedback.value = Feedback(
                                "This server does not publish Android updates.",
                                false,
                            )
                        }
                    }
                    UpdateCheck.UpToDate -> {
                        _update.value = UpdateUiState()
                        if (manual) {
                            _feedback.value = Feedback(
                                "Beacon is up to date (${BuildConfig.VERSION_NAME}).",
                                false,
                            )
                        }
                    }
                    is UpdateCheck.Available -> {
                        val ignored = container.prefs.ignoredUpdateVersion
                        if (!manual && result.info.versionName == ignored) {
                            _update.value = UpdateUiState()
                        } else {
                            val cached = withContext(Dispatchers.IO) {
                                checker.cachedFile(result.info)
                            }
                            _update.value = UpdateUiState(
                                info = result.info,
                                readyToInstall = cached != null,
                                progress = if (cached != null) 100 else 0,
                            )
                        }
                    }
                }
            } catch (error: Exception) {
                val message = error.message ?: "The update check failed."
                _update.value = UpdateUiState(error = if (manual) message else null)
                if (manual) _feedback.value = Feedback(message, true)
            }
        }
    }

    fun downloadUpdate() {
        val info = _update.value.info ?: return
        if (_update.value.downloading) return
        _update.update { it.copy(downloading = true, progress = 0, error = null) }
        viewModelScope.launch {
            try {
                checker.download(info) { progress ->
                    _update.update { it.copy(progress = progress) }
                }
                _update.update {
                    it.copy(downloading = false, readyToInstall = true, progress = 100)
                }
            } catch (error: Exception) {
                _update.update {
                    it.copy(
                        downloading = false,
                        progress = 0,
                        error = error.message ?: "The update could not be downloaded.",
                    )
                }
            }
        }
    }

    fun installUpdate() {
        val info = _update.value.info ?: return
        viewModelScope.launch {
            val file = withContext(Dispatchers.IO) { checker.cachedFile(info) }
            if (file == null) {
                _update.update {
                    it.copy(error = "Download the update again.", readyToInstall = false)
                }
                return@launch
            }
            when (val result = checker.install(file)) {
                InstallResult.Started -> Unit
                is InstallResult.NeedsPermission -> {
                    try {
                        app.startActivity(result.settingsIntent)
                    } catch (_: Exception) {
                        _update.update {
                            it.copy(
                                error = "Allow installing unknown apps for Beacon in system settings.",
                            )
                        }
                    }
                }
                is InstallResult.Failed -> _update.update { it.copy(error = result.message) }
            }
        }
    }

    fun dismissUpdate() {
        _update.value.info?.let { container.prefs.ignoredUpdateVersion = it.versionName }
        _update.value = UpdateUiState()
    }

    private fun runSync(label: String, trigger: SyncTrigger) {
        if (_busyAction.value != null) return
        _busyAction.value = label
        viewModelScope.launch {
            val outcome = try {
                container.syncEngine.run(trigger)
            } catch (_: Exception) {
                SyncEngine.Outcome.Retry("The sync could not be completed.")
            }
            _busyAction.value = null
            when (outcome) {
                is SyncEngine.Outcome.Done -> _feedback.value = Feedback(outcome.message, false)
                is SyncEngine.Outcome.Retry -> _feedback.value = Feedback(outcome.message, true)
                SyncEngine.Outcome.Stopped -> {
                    container.refresh()
                    _feedback.value = Feedback("This device is not paired or was revoked.", true)
                }
            }
            container.refresh()
        }
    }

    fun onPhotoCaptured(uri: Uri, sourceFile: File?) {
        val pending = container.prefs.pendingPhoto
        val pairing = container.prefs.pairing()
        if (pending == null || pairing == null) {
            sourceFile?.delete()
            return
        }
        if (_capture.value == CaptureState.Working) {
            sourceFile?.delete()
            return
        }
        _capture.value = CaptureState.Working
        viewModelScope.launch {
            val prepared = withContext(Dispatchers.IO) {
                try {
                    runCatching { PhotoProcessor.prepare(app, uri) }.getOrNull()
                } finally {
                    sourceFile?.delete()
                }
            }
            if (prepared == null) {
                _capture.value = CaptureState.Idle
                _feedback.value = Feedback(
                    "The photo could not be prepared. Try again with the camera.",
                    true,
                )
                return@launch
            }
            val result = container.api.uploadPhoto(
                serverUrl = pairing.serverUrl,
                token = pairing.token,
                commandId = pending.commandId,
                capturedAt = System.currentTimeMillis(),
                base64 = prepared.base64,
                width = prepared.width,
                height = prepared.height,
            )
            _capture.value = CaptureState.Idle
            when (result) {
                is ApiResult.Success -> {
                    container.prefs.pendingPhoto = null
                    NotificationHelper.cancelPhoto(app)
                    _feedback.value = Feedback("Photo uploaded to your Beacon account.", false)
                    container.refresh()
                }
                is ApiResult.Failure -> {
                    _feedback.value = Feedback(result.message, true)
                }
            }
        }
    }

    fun dismissPhotoRequest() {
        val pending = container.prefs.pendingPhoto ?: return
        val pairing = container.prefs.pairing() ?: return
        container.prefs.pendingPhoto = null
        NotificationHelper.cancelPhoto(app)
        container.refresh()
        viewModelScope.launch {
            container.api.acknowledge(
                serverUrl = pairing.serverUrl,
                token = pairing.token,
                commandId = pending.commandId,
                status = "unsupported",
                result = JSONObject().put(
                    "message",
                    "The photo request was dismissed on the device. Android requires the app in the foreground for camera access.",
                ),
            )
        }
    }

    fun clearExpiredPhoto() {
        val pending = container.prefs.pendingPhoto ?: return
        if (pending.expiresAt > System.currentTimeMillis()) return
        container.prefs.pendingPhoto = null
        NotificationHelper.cancelPhoto(app)
        container.refresh()
        val pairing = container.prefs.pairing() ?: return
        viewModelScope.launch {
            container.api.acknowledge(
                serverUrl = pairing.serverUrl,
                token = pairing.token,
                commandId = pending.commandId,
                status = "failed",
                result = JSONObject().put(
                    "message",
                    "The photo request expired before the app was opened.",
                ),
            )
        }
    }

    fun unpair(onDone: () -> Unit) {
        viewModelScope.launch {
            container.unpairLocal()
            _pairing.value = PairingUiState()
            _feedback.value = Feedback("Device unpaired and local data removed.", false)
            onDone()
        }
    }

    fun stopAlarm() {
        dev.beacon.app.media.AlarmPlayer.stop()
        NotificationHelper.cancelAlarm(app)
    }

    fun clearFeedback() {
        _feedback.value = null
    }

    fun notify(message: String, isError: Boolean = true) {
        _feedback.value = Feedback(message, isError)
    }

    fun defaultServer(): String = BuildConfig.BEACON_BASE_URL

    private fun cleanupExpiredPhoto() {
        clearExpiredPhoto()
    }

    fun defaultDeviceName(): String =
        listOf(Build.MANUFACTURER, Build.MODEL)
            .filter { it.isNotBlank() && !it.equals("unknown", ignoreCase = true) }
            .joinToString(" ")
            .ifBlank { "Android device" }
            .take(80)

    private companion object {
        const val UPDATE_CHECK_GAP_MS = 12L * 60 * 60 * 1000
    }
}
