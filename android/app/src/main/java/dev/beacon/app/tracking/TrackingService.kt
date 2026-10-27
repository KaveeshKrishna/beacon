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
        val container = app.container
        if (container.prefs.pairing() == null ||
            container.prefs.authRevoked ||
            !container.prefs.lostMode
        ) {
            stopSelf()
            return START_NOT_STICKY
        }

        startLocationUpdates()
        startPolling()
        scope.launch {
            container.syncEngine.run(SyncTrigger.COMMAND_POLL)
        }
        return START_STICKY
    }

    override fun onDestroy() {
        pollJob?.cancel()
        scope.coroutineContext[Job]?.cancel()
        stopLocationUpdates()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun startLocationUpdates() {
        if (listener != null) return
        val manager = getSystemService(LocationManager::class.java) ?: return
        locationManager = manager
        val listener = object : LocationListener {
            override fun onLocationChanged(location: Location) {
                val now = System.currentTimeMillis()
                if (now - lastSyncAttempt.get() < MIN_SYNC_GAP_MS) return
                lastSyncAttempt.set(now)
                val point = app.container.sampler.fromLocation(location)
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

        val providers = listOf(
            LocationManager.GPS_PROVIDER,
            LocationManager.NETWORK_PROVIDER,
        )
        for (provider in providers) {
            try {
                if (manager.isProviderEnabled(provider)) {
                    manager.requestLocationUpdates(
                        provider,
                        UPDATE_INTERVAL_MS,
                        20f,
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

    private fun startPolling() {
        if (pollJob?.isActive == true) return
        pollJob = scope.launch {
            while (isActive) {
                delay(POLL_INTERVAL_MS)
                app.container.syncEngine.run(SyncTrigger.COMMAND_POLL)
            }
        }
    }

    companion object {
        private const val UPDATE_INTERVAL_MS = 30_000L
        private const val MIN_SYNC_GAP_MS = 20_000L
        private const val POLL_INTERVAL_MS = 2 * 60_000L

        fun start(context: Context) {
            val intent = Intent(context, TrackingService::class.java)
            ContextCompat.startForegroundService(context, intent)
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, TrackingService::class.java))
        }
    }
}
