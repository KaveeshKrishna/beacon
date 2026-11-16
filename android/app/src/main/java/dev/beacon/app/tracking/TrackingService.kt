package dev.beacon.app.tracking

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.os.Looper
import androidx.core.content.ContextCompat
import dev.beacon.app.BeaconApplication
import dev.beacon.app.core.AppPreferences
import dev.beacon.app.core.GeofenceMath
import dev.beacon.app.location.TrackingScheduler
import dev.beacon.app.notifications.NotificationHelper
import dev.beacon.app.sync.SyncTrigger
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.abs
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

class TrackingService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var pollJob: Job? = null
    private var cadenceJob: Job? = null
    private var locationManager: LocationManager? = null
    private var listener: LocationListener? = null
    private val lastSyncAttempt = AtomicLong(0L)
    private var cadenceKey: String? = null

    /**
     * Near a fence edge the watcher samples every two minutes with GPS and
     * network. Deep inside or far outside it samples every five minutes and
     * prefers the network provider, which is the main battery saving.
     */
    private var fenceModeNear = true

    private val app: BeaconApplication
        get() = application as BeaconApplication

    override fun onCreate() {
        super.onCreate()
        val notification = NotificationHelper.trackingNotification(
            this,
            lostMode = app.container.prefs.lostMode,
        )
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    NotificationHelper.ID_TRACKING,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION,
                )
            } else {
                startForeground(NotificationHelper.ID_TRACKING, notification)
            }
        } catch (_: Exception) {
            stopSelf()
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val prefs = app.container.prefs
        val interval = prefs.effectiveIntervalMinutes()
        val fenceWatch = TrackingScheduler.shouldWatchFences(prefs)
        if (prefs.pairing() == null ||
            prefs.authRevoked ||
            (!prefs.lostMode && !fenceWatch && interval >= TrackingScheduler.MIN_PERIODIC_MINUTES)
        ) {
            stopSelf()
            return START_NOT_STICKY
        }

        // A running service keeps its original listeners and loop delays. When
        // the owner changes the interval, a fence crossing changes the
        // effective cadence, or lost mode toggles, replace both loops.
        val key = "${prefs.lostMode}|$interval|$fenceWatch"
        if (key != cadenceKey || listener == null) {
            cadenceKey = key
            stopLocationUpdates()
            pollJob?.cancel()
            startLocationUpdates(prefs)
            startPolling(prefs)
            startCadenceTicker(prefs)

            // Do not wait for the first location callback: a phone that was
            // just opened or switched to lost mode should report immediately.
            val now = System.currentTimeMillis()
            if (now - lastSyncAttempt.get() >= STARTUP_SYNC_GUARD_MS) {
                lastSyncAttempt.set(now)
                scope.launch { app.container.syncEngine.run(SyncTrigger.LIVE) }
            }
        }
        NotificationHelper.updateTracking(
            this,
            lostMode = prefs.lostMode,
            fenceWatch = fenceWatch,
        )
        return START_STICKY
    }

    override fun onDestroy() {
        pollJob?.cancel()
        cadenceJob?.cancel()
        scope.coroutineContext[Job]?.cancel()
        stopLocationUpdates()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun handleLocation(prefs: AppPreferences, location: Location) {
        val point = app.container.sampler.fromLocation(location)
        val fenceWatch = TrackingScheduler.shouldWatchFences(prefs)

        // Compare the fresh fix with the cached fences even when it is not due
        // for upload. That is what makes a crossing visible within roughly one
        // fix interval instead of an hour.
        val decision = if (prefs.lostMode || fenceWatch) {
            prefs.observeGeofence(
                latitude = point.latitude,
                longitude = point.longitude,
                accuracyM = point.accuracyM,
                recordedAt = point.recordedAt,
            )
        } else {
            null
        }
        val crossed = decision?.crossing != null

        if (fenceWatch && !prefs.lostMode) {
            val near = nearFenceEdge(prefs, point.latitude, point.longitude)
            if (near != fenceModeNear) {
                fenceModeNear = near
                stopLocationUpdates()
                startLocationUpdates(prefs)
                NotificationHelper.updateTracking(
                    this,
                    lostMode = false,
                    fenceWatch = true,
                )
            }
        }

        val now = System.currentTimeMillis()
        val gap = when {
            prefs.lostMode -> LIVE_GAP_MS
            crossed -> 0L
            else -> intervalMs(prefs)
        }
        if (now - lastSyncAttempt.get() < gap) return
        lastSyncAttempt.set(now)

        if (crossed) {
            // The inside/outside interval just changed. Let the scheduler
            // recalculate whether to keep the service and restart its loops
            // with the new cadence.
            TrackingScheduler.scheduleFromPreferences(this, prefs)
        }
        scope.launch {
            app.container.syncEngine.run(SyncTrigger.LIVE, point)
        }
    }

    private fun nearFenceEdge(
        prefs: AppPreferences,
        latitude: Double,
        longitude: Double,
    ): Boolean {
        val fences = prefs.geofences
        if (fences.isEmpty()) return false
        val nearest = fences.minOf { fence ->
            abs(
                GeofenceMath.distanceMeters(
                    latitude,
                    longitude,
                    fence.centerLat,
                    fence.centerLon,
                ) - fence.radiusM,
            )
        }
        return nearest <= NEAR_EDGE_M
    }

    private fun startLocationUpdates(prefs: AppPreferences) {
        if (listener != null) return
        val manager = getSystemService(LocationManager::class.java) ?: return
        locationManager = manager
        val listener = object : LocationListener {
            override fun onLocationChanged(location: Location) {
                handleLocation(prefs, location)
            }

            override fun onProviderEnabled(provider: String) = Unit
            override fun onProviderDisabled(provider: String) = Unit

            @Suppress("OVERRIDE_DEPRECATION")
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
        }
        this.listener = listener

        val lostMode = prefs.lostMode
        val fenceWatch = TrackingScheduler.shouldWatchFences(prefs)
        val requestInterval = when {
            lostMode -> LOST_UPDATE_INTERVAL_MS
            fenceWatch && fenceModeNear -> FENCE_NEAR_UPDATE_INTERVAL_MS
            fenceWatch -> FENCE_FAR_UPDATE_INTERVAL_MS
            else -> intervalMs(prefs)
        }
        val minDistance = when {
            lostMode -> 20f
            fenceWatch && fenceModeNear -> 50f
            fenceWatch -> 100f
            else -> 20f
        }

        val providers = when {
            lostMode -> listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
            !fenceWatch -> listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
            fenceModeNear -> listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
            providerEnabled(manager, LocationManager.NETWORK_PROVIDER) ->
                listOf(LocationManager.NETWORK_PROVIDER)
            else -> listOf(LocationManager.GPS_PROVIDER)
        }

        for (provider in providers) {
            try {
                if (manager.isProviderEnabled(provider)) {
                    manager.requestLocationUpdates(
                        provider,
                        requestInterval,
                        minDistance,
                        listener,
                        Looper.getMainLooper(),
                    )
                }
            } catch (_: SecurityException) {
                // Background location may not be granted; periodic work remains.
            } catch (_: Exception) {
                // Ignore unavailable providers.
            }
        }
    }

    private fun providerEnabled(manager: LocationManager, provider: String): Boolean = try {
        manager.isProviderEnabled(provider)
    } catch (_: Exception) {
        false
    }

    private fun stopLocationUpdates() {
        val manager = locationManager
        val listener = listener
        if (manager != null && listener != null) {
            try {
                manager.removeUpdates(listener)
            } catch (_: Exception) {
                // Already removed.
            }
        }
        this.listener = null
        locationManager = null
    }

    private fun startPolling(prefs: AppPreferences) {
        if (pollJob?.isActive == true) return
        pollJob = scope.launch {
            while (isActive) {
                // COMMAND_POLL does not request a GPS fix. It flushes anything
                // already queued, fetches commands and config, and sends a
                // heartbeat when due.
                app.container.syncEngine.run(SyncTrigger.COMMAND_POLL)
                delay(pollIntervalMs(prefs))
            }
        }
    }

    /**
     * Android may not deliver a location update while the phone is stationary
     * and the provider applies a distance filter. This ticker checks the
     * effective interval every minute and requests a check-in when it is due,
     * so the documented cadence is kept without an exact alarm.
     */
    private fun startCadenceTicker(prefs: AppPreferences) {
        if (cadenceJob?.isActive == true) return
        cadenceJob = scope.launch {
            while (isActive) {
                delay(TICK_MS)
                if (prefs.lostMode) continue
                val now = System.currentTimeMillis()
                if (now - lastSyncAttempt.get() < intervalMs(prefs)) continue
                lastSyncAttempt.set(now)
                app.container.syncEngine.run(SyncTrigger.LIVE)
            }
        }
    }

    private fun intervalMs(prefs: AppPreferences): Long =
        prefs.effectiveIntervalMinutes().coerceIn(1, 1440) * 60_000L

    private fun pollIntervalMs(prefs: AppPreferences): Long = when {
        prefs.lostMode -> LOST_POLL_INTERVAL_MS
        TrackingScheduler.shouldWatchFences(prefs) -> FENCE_POLL_INTERVAL_MS
        else -> intervalMs(prefs)
    }.coerceAtLeast(MIN_POLL_INTERVAL_MS)

    companion object {
        private const val LOST_UPDATE_INTERVAL_MS = 30_000L
        private const val FENCE_NEAR_UPDATE_INTERVAL_MS = 2 * 60_000L
        private const val FENCE_FAR_UPDATE_INTERVAL_MS = 5 * 60_000L
        private const val LIVE_GAP_MS = 30_000L
        private const val LOST_POLL_INTERVAL_MS = 2 * 60_000L
        private const val FENCE_POLL_INTERVAL_MS = 5 * 60_000L
        private const val MIN_POLL_INTERVAL_MS = 60_000L
        private const val TICK_MS = 60_000L
        private const val STARTUP_SYNC_GUARD_MS = 30_000L
        private const val NEAR_EDGE_M = 250.0

        fun start(context: Context) {
            val intent = Intent(context, TrackingService::class.java)
            ContextCompat.startForegroundService(context, intent)
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, TrackingService::class.java))
        }
    }
}
