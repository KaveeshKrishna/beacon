package dev.beacon.app

import android.app.Application
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.os.Build
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.content.edit
import dev.beacon.app.core.AppPreferences
import dev.beacon.app.core.BeaconState
import dev.beacon.app.core.KeystoreCrypto
import dev.beacon.app.data.DeviceStatusReader
import dev.beacon.app.data.QueueStore
import dev.beacon.app.location.LocationSampler
import dev.beacon.app.location.TrackingScheduler
import dev.beacon.app.media.AlarmPlayer
import dev.beacon.app.network.ApiClient
import dev.beacon.app.notifications.NotificationHelper
import dev.beacon.app.security.DeviceAdmin
import dev.beacon.app.sync.CommandHandler
import dev.beacon.app.sync.SyncEngine
import dev.beacon.app.tracking.TrackingService
import android.Manifest
import android.content.pm.PackageManager
import android.os.PowerManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicLong

class BeaconApplication : Application() {
    lateinit var container: AppContainer
        private set

    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private val lastNetworkFlush = AtomicLong(0L)

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        NotificationHelper.createChannels(this)
        val prefs = container.prefs
        val simReady = try {
            getSystemService(android.telephony.TelephonyManager::class.java)
                ?.simState == android.telephony.TelephonyManager.SIM_STATE_READY
        } catch (_: Exception) {
            // Wi-Fi-only devices may not implement telephony at all.
            false
        }
        if (simReady) {
            prefs.simWasReady = true
        }
        if (prefs.pairing() != null && !prefs.authRevoked) {
            TrackingScheduler.scheduleFromPreferences(this, prefs)
            if (prefs.lostMode) {
                try {
                    TrackingService.start(this)
                } catch (_: Exception) {
                    // Periodic tracking remains available if Android blocks FGS.
                }
            }
        }
        watchConnectivity()
        container.refresh()
    }

    /**
     * CONNECTIVITY_CHANGE is no longer delivered to manifest receivers on
     * Android 8+, so the supported way to notice that a network (Wi-Fi, a
     * replacement SIM, a hotspot) came back is a runtime NetworkCallback.
     *
     * It lives for the process lifetime. Together with the periodic worker
     * and the foreground service this covers the cases where the app is
     * alive; a device that is fully powered off cannot report anything.
     */
    private fun watchConnectivity() {
        if (networkCallback != null) return
        val manager = getSystemService(ConnectivityManager::class.java) ?: return
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                val prefs = container.prefs
                if (prefs.pairing() == null || prefs.authRevoked) return
                val now = System.currentTimeMillis()
                val previous = lastNetworkFlush.get()
                if (now - previous < NETWORK_FLUSH_GAP_MS) return
                if (!lastNetworkFlush.compareAndSet(previous, now)) return
                TrackingScheduler.syncSoon(this@BeaconApplication)
            }
        }
        try {
            manager.registerDefaultNetworkCallback(callback)
            networkCallback = callback
        } catch (_: Exception) {
            // Normal periodic scheduling still flushes the queue.
        }
    }

    private companion object {
        const val NETWORK_FLUSH_GAP_MS = 15_000L
    }
}

class AppContainer(context: Context) {
    private val appContext = context.applicationContext
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    val prefs = AppPreferences(appContext)
    val queue = QueueStore(appContext)
    val api = ApiClient()
    val sampler = LocationSampler(appContext, prefs)

    private val _state = MutableStateFlow(snapshot())
    val state: StateFlow<BeaconState> = _state.asStateFlow()

    private val commandHandler = CommandHandler(
        context = appContext,
        prefs = prefs,
        queue = queue,
        sampler = sampler,
    )

    val syncEngine = SyncEngine(
        context = appContext,
        prefs = prefs,
        queue = queue,
        api = api,
        sampler = sampler,
        commandHandler = commandHandler,
        onStateChanged = ::refresh,
    )

    fun refresh() {
        scope.launch {
            _state.value = snapshot()
        }
    }

    fun snapshot(): BeaconState {
        val pairing = prefs.pairing()
        val sms = prefs.fallbackSmsNumber
        return BeaconState(
            paired = pairing != null,
            authRevoked = prefs.authRevoked,
            deviceName = pairing?.deviceName.orEmpty(),
            ownerName = pairing?.ownerName.orEmpty(),
            serverUrl = pairing?.serverUrl.orEmpty(),
            lostMode = prefs.lostMode,
            trackingProfile = prefs.trackingProfile,
            syncIntervalMinutes = prefs.syncIntervalMinutes,
            effectiveIntervalMinutes = prefs.effectiveIntervalMinutes(),
            geofences = prefs.geofences,
            insideGeofenceName = prefs.insideGeofenceName,
            allowScreenshots = prefs.allowScreenshots,
            lockOnSimRemoval = prefs.lockOnSimRemoval,
            lastSyncAt = prefs.lastSyncAt,
            lastError = prefs.lastError,
            queuedCount = runCatching { queue.count() }.getOrDefault(0),
            fallbackSmsMasked = sms?.let(::maskNumber),
            pendingPhoto = prefs.pendingPhoto,
            ownerMessage = prefs.lastOwnerMessage,
            fineLocation = granted(appContext, Manifest.permission.ACCESS_FINE_LOCATION),
            coarseLocation = granted(appContext, Manifest.permission.ACCESS_COARSE_LOCATION),
            backgroundLocation = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                granted(appContext, Manifest.permission.ACCESS_BACKGROUND_LOCATION)
            } else {
                granted(appContext, Manifest.permission.ACCESS_FINE_LOCATION)
            },
            notifications = notificationsEnabled(appContext),
            sms = granted(appContext, Manifest.permission.SEND_SMS),
            camera = granted(appContext, Manifest.permission.CAMERA),
            deviceAdmin = DeviceAdmin.isActive(appContext),
            batteryUnrestricted = appContext
                .getSystemService(PowerManager::class.java)
                ?.isIgnoringBatteryOptimizations(appContext.packageName) == true,
        )
    }

    suspend fun unpairLocal() {
        val pairing = prefs.pairing()
        if (pairing != null) {
            api.unpair(pairing.serverUrl, pairing.token)
        }
        AlarmPlayer.stop()
        TrackingScheduler.cancel(appContext)
        TrackingService.stop(appContext)
        NotificationHelper.cancelAlarm(appContext)
        NotificationHelper.cancelPhoto(appContext)
        NotificationHelper.cancelRevoked(appContext)
        NotificationHelper.cancelTracking(appContext)
        queue.clear()
        prefs.clearPairing()
        KeystoreCrypto.reset()
        _state.value = snapshot()
    }

    private fun granted(context: Context, permission: String): Boolean =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    private fun notificationsEnabled(context: Context): Boolean {
        val permission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            granted(context, Manifest.permission.POST_NOTIFICATIONS)
        } else {
            true
        }
        return permission && NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    private fun maskNumber(number: String): String {
        val digits = number.takeLast(4)
        return "+••••••$digits"
    }
}
