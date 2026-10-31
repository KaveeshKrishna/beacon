package dev.beacon.app.ui

import android.app.Application
import android.net.Uri
import android.os.Build
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import dev.beacon.app.BuildConfig
import dev.beacon.app.BeaconApplication
import dev.beacon.app.account.AccountRepository
import dev.beacon.app.account.Pkce
import dev.beacon.app.core.Pairing
import dev.beacon.app.core.PendingAccountLink
import dev.beacon.app.location.TrackingScheduler
import dev.beacon.app.media.PhotoProcessor
import dev.beacon.app.network.ApiClient
import dev.beacon.app.network.ApiResult
import dev.beacon.app.network.FailureKind
import dev.beacon.app.network.LinkedDevice
import dev.beacon.app.notifications.NotificationHelper
import dev.beacon.app.sync.SyncEngine
import dev.beacon.app.sync.SyncTrigger
import dev.beacon.app.update.InstallResult
import dev.beacon.app.update.UpdateCheck
import dev.beacon.app.update.UpdateChecker
import dev.beacon.app.update.UpdateInfo
import java.security.MessageDigest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
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

data class GeofenceUiState(
    val open: Boolean = false,
    val locating: Boolean = false,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val accuracyM: Double? = null,
    val creating: Boolean = false,
    val deletingId: String? = null,
    val error: String? = null,
)

data class AccountUiState(
    val linked: Boolean = false,
    val accountName: String = "",
    val accountEmailMasked: String = "",
    val linkedAt: Long = 0L,
    val recoveryEligible: Boolean = false,
    val recoveryDaysRemaining: Int = AccountRepository.RECOVERY_MIN_AGE_DAYS,
    val loading: Boolean = false,
    val devices: List<LinkedDevice> = emptyList(),
    val currentDeviceId: String = "",
    val originLatitude: Double? = null,
    val originLongitude: Double? = null,
    val originAccuracyM: Double? = null,
    val directionDeviceId: String? = null,
    val busy: String? = null,
    val error: String? = null,
    val recoveryError: String? = null,
    val recoveryDone: String? = null,
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

    private val _geofence = MutableStateFlow(GeofenceUiState())
    val geofence: StateFlow<GeofenceUiState> = _geofence.asStateFlow()

    private val accountRepository = AccountRepository(container.api, container.prefs)
    private val _account = MutableStateFlow(AccountUiState())
    val account: StateFlow<AccountUiState> = _account.asStateFlow()

    init {
        syncAccountState()
        cleanupExpiredPhoto()
        autoCheckForUpdates()
    }

    fun refresh() {
        container.refresh()
        expirePendingLink()
        syncAccountState()
        cleanupExpiredPhoto()
    }

    fun handleDeepLink(uri: Uri?) {
        if (uri == null) return
        if (!uri.scheme.equals("beacon", ignoreCase = true)) return
        when (uri.host?.lowercase()) {
            "pair" -> handlePairInvite(uri)
            "account-linked" -> handleAccountLinkCallback(uri)
        }
    }

    private fun handlePairInvite(uri: Uri) {
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

    /**
     * Build the browser URL for linking this phone. The PKCE verifier and the
     * state value stay in Keystore-backed preferences; only the challenge and
     * a public state nonce are placed in the URL.
     */
    fun beginAccountLink(): String? {
        if (_account.value.busy != null) return null
        val pairing = container.prefs.pairing()
        if (pairing == null) {
            _feedback.value = Feedback("Pair this device before linking it to an account.", true)
            return null
        }
        val verifier = Pkce.verifier()
        val state = Pkce.state()
        container.prefs.pendingAccountLink = PendingAccountLink(
            serverUrl = pairing.serverUrl,
            verifier = verifier,
            state = state,
            deviceId = pairing.deviceId,
            createdAt = System.currentTimeMillis(),
        )
        _account.update { it.copy(busy = "link", error = null) }
        val base = pairing.serverUrl.trimEnd('/')
        return "$base/app/link-device?device=${Uri.encode(pairing.deviceId)}" +
            "&challenge=${Pkce.challenge(verifier)}&state=$state"
    }

    private fun handleAccountLinkCallback(uri: Uri) {
        val pending = container.prefs.pendingAccountLink
        if (pending == null) {
            _account.update {
                it.copy(busy = null, error = "This link response did not come from this phone.")
            }
            return
        }
        val code = uri.getQueryParameter("code").orEmpty()
        val state = uri.getQueryParameter("state").orEmpty()
        val fresh = System.currentTimeMillis() - pending.createdAt <=
            AccountRepository.PENDING_LINK_MAX_AGE_MS

        if (!fresh) {
            container.prefs.pendingAccountLink = null
            _account.update {
                it.copy(
                    busy = null,
                    error = "That link response expired. Try linking again.",
                )
            }
            return
        }
        if (!statesMatch(state, pending.state)) {
            // A different app can send our custom scheme. A wrong state must
            // not destroy a link the owner is still completing in the browser.
            _account.update {
                it.copy(error = "This link response did not come from this phone.")
            }
            return
        }
        if (code.isBlank() || code.length > 200) {
            container.prefs.pendingAccountLink = null
            _account.update {
                it.copy(
                    busy = null,
                    error = "That link response was invalid. Try linking again.",
                )
            }
            return
        }

        _account.update { it.copy(busy = "link", error = null) }
        viewModelScope.launch {
            when (
                val result = accountRepository.exchange(
                    serverUrl = pending.serverUrl,
                    code = code,
                    verifier = pending.verifier,
                    state = pending.state,
                )
            ) {
                is ApiResult.Success -> {
                    syncAccountState()
                    _account.update { it.copy(busy = null, error = null) }
                    _feedback.value = Feedback(
                        "This phone is linked to ${result.value.accountName.ifBlank { "your account" }}.",
                        false,
                    )
                    loadLinkedDevices()
                }
                is ApiResult.Failure -> {
                    container.prefs.pendingAccountLink = null
                    _account.update { it.copy(busy = null, error = result.message) }
                    _feedback.value = Feedback(result.message, true)
                }
            }
        }
    }

    private fun statesMatch(first: String, second: String): Boolean {
        if (first.isEmpty() || second.isEmpty()) return false
        val left = first.toByteArray(Charsets.UTF_8)
        val right = second.toByteArray(Charsets.UTF_8)
        return left.size == right.size && MessageDigest.isEqual(left, right)
    }

    fun cancelAccountLink() {
        if (_account.value.busy != "link") return
        container.prefs.pendingAccountLink = null
        _account.update { it.copy(busy = null) }
    }

    fun loadLinkedDevices() {
        if (!_account.value.linked || _account.value.loading) return
        _account.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            val access = accountRepository.ensureAccess()
            if (access is ApiResult.Failure) {
                handleAccountAccessFailure(access)
                return@launch
            }
            val session = (access as ApiResult.Success).value
            val (devicesResult, origin) = coroutineScope {
                val devices = async {
                    container.api.mobileDevices(session.serverUrl, session.accessToken)
                }
                val fix = async {
                    try {
                        container.sampler.collect(highAccuracy = true)
                    } catch (_: Exception) {
                        null
                    }
                }
                devices.await() to fix.await()
            }
            when (devicesResult) {
                is ApiResult.Failure -> {
                    if (devicesResult.kind == FailureKind.UNAUTHORIZED) {
                        container.prefs.mobileSession = null
                        syncAccountState()
                        _feedback.value = Feedback(
                            "This linked session was revoked. Link this phone again.",
                            true,
                        )
                    } else {
                        _account.update {
                            it.copy(loading = false, error = devicesResult.message)
                        }
                    }
                }
                is ApiResult.Success -> {
                    _account.update {
                        it.copy(
                            loading = false,
                            error = null,
                            devices = devicesResult.value.devices,
                            currentDeviceId = devicesResult.value.currentDeviceId
                                .ifBlank { session.deviceId },
                            originLatitude = origin?.latitude,
                            originLongitude = origin?.longitude,
                            originAccuracyM = origin?.accuracyM,
                        )
                    }
                }
            }
        }
    }

    private fun handleAccountAccessFailure(failure: ApiResult.Failure) {
        val cleared = accountRepository.current() == null
        if (cleared) {
            syncAccountState()
        } else {
            _account.update { it.copy(loading = false, error = failure.message) }
        }
        _feedback.value = Feedback(failure.message, true)
    }

    fun openDirection(deviceId: String) {
        _account.update { it.copy(directionDeviceId = deviceId) }
    }

    fun closeDirection() {
        _account.update { it.copy(directionDeviceId = null) }
    }

    fun unlinkPhone() {
        if (_account.value.busy != null) return
        _account.update { it.copy(busy = "unlink") }
        viewModelScope.launch {
            val result = accountRepository.logout()
            syncAccountState()
            _account.update { it.copy(busy = null, directionDeviceId = null) }
            _feedback.value = when {
                result is ApiResult.Success -> Feedback(
                    "This phone was unlinked from the account.",
                    false,
                )
                result is ApiResult.Failure && result.kind == FailureKind.NETWORK -> Feedback(
                    "Unlinked on this phone, but the server could not be reached. Revoke this phone in Security settings so its token cannot be reused.",
                    true,
                )
                else -> Feedback(
                    "Unlinked on this phone. The server may still list it briefly; revoke it in Security settings.",
                    true,
                )
            }
        }
    }

    fun recoverMfa(password: String) {
        if (password.isBlank()) {
            _account.update { it.copy(recoveryError = "Enter your account password.") }
            return
        }
        if (_account.value.busy != null) return
        _account.update { it.copy(busy = "recovery", recoveryError = null) }
        viewModelScope.launch {
            val access = accountRepository.ensureAccess()
            if (access is ApiResult.Failure) {
                handleAccountAccessFailure(access)
                _account.update {
                    it.copy(busy = null, recoveryError = access.message)
                }
                return@launch
            }
            val session = (access as ApiResult.Success).value
            when (
                val result = container.api.mobileResetMfa(
                    serverUrl = session.serverUrl,
                    accessToken = session.accessToken,
                    password = password,
                )
            ) {
                is ApiResult.Success -> {
                    syncAccountState()
                    _account.update {
                        it.copy(busy = null, recoveryError = null, recoveryDone = result.value)
                    }
                }
                is ApiResult.Failure -> {
                    _account.update {
                        it.copy(busy = null, recoveryError = result.message)
                    }
                }
            }
        }
    }

    fun clearAccountError() {
        _account.update { it.copy(error = null) }
    }

    fun dismissRecoveryResult() {
        _account.update { it.copy(recoveryDone = null, recoveryError = null) }
    }

    private fun expirePendingLink() {
        if (_account.value.busy != "link") return
        val pending = container.prefs.pendingAccountLink
        val expired = pending == null ||
            System.currentTimeMillis() - pending.createdAt >
            AccountRepository.PENDING_LINK_MAX_AGE_MS
        if (expired) {
            container.prefs.pendingAccountLink = null
            _account.update { it.copy(busy = null) }
        }
    }

    private fun syncAccountState() {
        val session = accountRepository.current()
        _account.update { current ->
            if (session == null) {
                AccountUiState()
            } else {
                current.copy(
                    linked = true,
                    accountName = session.accountName,
                    accountEmailMasked = session.accountEmailMasked,
                    linkedAt = session.linkedAt,
                    recoveryEligible = accountRepository.recoveryEligible(session),
                    recoveryDaysRemaining = accountRepository.recoveryDaysRemaining(session),
                )
            }
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

    fun setLockOnSimRemoval(enabled: Boolean) {
        if (enabled && !dev.beacon.app.security.DeviceAdmin.isActive(app)) {
            _feedback.value = Feedback(
                "Enable device admin first, then turn on lock on SIM removal.",
                true,
            )
            return
        }
        container.prefs.lockOnSimRemoval = enabled
        container.refresh()
        _feedback.value = Feedback(
            if (enabled) {
                "The screen will lock when the SIM is removed."
            } else {
                "Lock on SIM removal is off."
            },
            false,
        )
    }

    fun openGeofenceDialog() {
        if (_geofence.value.open || _geofence.value.locating) return
        _geofence.value = GeofenceUiState(open = true, locating = true)
        viewModelScope.launch {
            val point = try {
                container.sampler.collect(highAccuracy = true)
            } catch (_: Exception) {
                null
            }
            if (!_geofence.value.open) return@launch
            _geofence.update {
                it.copy(
                    locating = false,
                    latitude = point?.latitude,
                    longitude = point?.longitude,
                    accuracyM = point?.accuracyM,
                    error = if (point == null) {
                        "No location fix is available. Move somewhere with a clearer view of the sky and try again."
                    } else {
                        null
                    },
                )
            }
        }
    }

    fun closeGeofenceDialog() {
        if (_geofence.value.creating) return
        _geofence.value = GeofenceUiState()
    }

    fun createGeofence(nameInput: String, radiusM: Int) {
        val draft = _geofence.value
        val latitude = draft.latitude ?: return
        val longitude = draft.longitude ?: return
        if (!draft.open || draft.creating) return
        val name = nameInput.trim()
        if (name.isEmpty() || name.length > 60) {
            _geofence.update {
                it.copy(error = "Give the place a name of 1 to 60 characters.")
            }
            return
        }
        if (radiusM !in 50..50_000) {
            _geofence.update { it.copy(error = "Choose a radius between 50 m and 50 km.") }
            return
        }
        val pairing = container.prefs.pairing()
        if (pairing == null) {
            _geofence.update { it.copy(error = "Pair this device first.") }
            return
        }

        _geofence.update { it.copy(creating = true, error = null) }
        viewModelScope.launch {
            when (
                val result = container.api.createGeofence(
                    serverUrl = pairing.serverUrl,
                    token = pairing.token,
                    name = name,
                    latitude = latitude,
                    longitude = longitude,
                    radiusM = radiusM,
                )
            ) {
                is ApiResult.Success -> {
                    container.prefs.geofences = container.prefs.geofences + result.value
                    container.prefs.updateGeofenceState(latitude, longitude)
                    TrackingScheduler.scheduleFromPreferences(app, container.prefs)
                    TrackingScheduler.syncSoon(app)
                    container.refresh()
                    _geofence.value = GeofenceUiState()
                    _feedback.value = Feedback("Geofence \"${result.value.name}\" created.", false)
                }
                is ApiResult.Failure -> {
                    _geofence.update {
                        it.copy(creating = false, error = result.message)
                    }
                }
            }
        }
    }

    fun deleteGeofence(id: String) {
        if (_geofence.value.deletingId != null) return
        val pairing = container.prefs.pairing() ?: return
        _geofence.update { it.copy(deletingId = id) }
        viewModelScope.launch {
            when (
                val result = container.api.deleteGeofence(
                    serverUrl = pairing.serverUrl,
                    token = pairing.token,
                    geofenceId = id,
                )
            ) {
                is ApiResult.Success -> {
                    container.prefs.geofences =
                        container.prefs.geofences.filterNot { it.id == id }
                    TrackingScheduler.scheduleFromPreferences(app, container.prefs)
                    TrackingScheduler.syncSoon(app)
                    container.refresh()
                    _geofence.update { it.copy(deletingId = null) }
                    _feedback.value = Feedback("Geofence removed.", false)
                }
                is ApiResult.Failure -> {
                    _geofence.update {
                        it.copy(deletingId = null, error = result.message)
                    }
                    _feedback.value = Feedback(result.message, true)
                }
            }
        }
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
