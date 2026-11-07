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
import dev.beacon.app.location.TrackingScheduler
import dev.beacon.app.notifications.NotificationHelper
import dev.beacon.app.sync.SyncTrigger
import java.util.concurrent.atomic.AtomicLong
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
    private var locationManager: LocationManager? = null
    private var listener: LocationListener? = null
    private val lastSyncAttempt = AtomicLong(0L)
    private var cadenceKey: String? = null

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
        scope.coroutineContext[Job]?.cancel()
        stopLocationUpdates()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun startLocationUpdates(prefs: AppPreferences) {
        if (listener != null) return
        val manager = getSystemService(LocationManager::class.java) ?: return
        locationManager = manager
        val listener = object : LocationListener {
            override fun onLocationChanged(location: Location) {
                val point = app.container.sampler.fromLocation(location)
                val fenceWatch = TrackingScheduler.shouldWatchFences(prefs)

                // Compare the fresh fix with the cached fences even when it is
                // not due for upload. That is what makes a crossing visible
                // within roughly one fix interval instead of an hour.
                val crossed = if (prefs.lostMode || fenceWatch) {
                    prefs.observeGeofence(point.latitude, point.longitude)
                } else {
                    false
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
                    // The inside/outside interval just changed. Let the
                    // scheduler recalculate whether to keep the service and
                    // restart its loops with the new cadence.
                    TrackingScheduler.scheduleFromPreferences(this@TrackingService, prefs)
                }
                scope.launch {
                    app.container.syncEngine.run(SyncTrigger.LIVE, point)
                }
            }

            override fun onProviderEnabled(provider: String) = Unit
            override fun onProviderDisabled(provider: String) = Unit

            @Deprecated("Deprecated in API 29")
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
        }
        this.listener = listener

        val lostMode = prefs.lostMode
        val fenceWatch = TrackingScheduler.shouldWatchFences(prefs)
        val requestInterval = when {
            lostMode -> LOST_UPDATE_INTERVAL_MS
            fenceWatch -> FENCE_UPDATE_INTERVAL_MS
            else -> intervalMs(prefs)
        }
        val minDistance = if (fenceWatch && !lostMode) 50f else 20f

        val providers = listOf(
            LocationManager.GPS_PROVIDER,
            LocationManager.NETWORK_PROVIDER,
        )
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

    private fun intervalMs(prefs: AppPreferences): Long =
        prefs.effectiveIntervalMinutes().coerceIn(1, 1440) * 60_000L

    private fun pollIntervalMs(prefs: AppPreferences): Long = when {
        prefs.lostMode -> LOST_POLL_INTERVAL_MS
        TrackingScheduler.shouldWatchFences(prefs) -> FENCE_POLL_INTERVAL_MS
        else -> intervalMs(prefs)
    }.coerceAtLeast(MIN_POLL_INTERVAL_MS)

    companion object {
        private const val LOST_UPDATE_INTERVAL_MS = 30_000L
        private const val FENCE_UPDATE_INTERVAL_MS = 2 * 60_000L
        private const val LIVE_GAP_MS = 30_000L
        private const val LOST_POLL_INTERVAL_MS = 2 * 60_000L
        private const val FENCE_POLL_INTERVAL_MS = 5 * 60_000L
        private const val MIN_POLL_INTERVAL_MS = 60_000L

        fun start(context: Context) {
            val intent = Intent(context, TrackingService::class.java)
            ContextCompat.startForegroundService(context, intent)
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, TrackingService::class.java))
        }
    }
}
