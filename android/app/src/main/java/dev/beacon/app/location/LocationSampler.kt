package dev.beacon.app.location

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import dev.beacon.app.core.AppPreferences
import dev.beacon.app.data.DeviceStatusReader
import dev.beacon.app.data.LocationPoint
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine

class LocationSampler(
    private val context: Context,
    private val prefs: AppPreferences,
) {
    fun hasForegroundPermission(): Boolean {
        val fine = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_COARSE_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED
        return fine || coarse
    }

    suspend fun collect(highAccuracy: Boolean = false): LocationPoint? {
        if (!hasForegroundPermission()) return null
        val manager = context.getSystemService(LocationManager::class.java) ?: return null
        val providers = availableProviders(manager, highAccuracy)
        if (providers.isEmpty()) return null

        val lastKnown = providers
            .mapNotNull { provider -> safeLastKnown(manager, provider) }
            .maxByOrNull { location -> -quality(location) }

        val maxLastAgeMs = if (highAccuracy) 2 * 60_000L else 10 * 60_000L
        if (lastKnown != null && System.currentTimeMillis() - lastKnown.time in 0..maxLastAgeMs) {
            if (lastKnown.accuracy <= if (highAccuracy) 30f else 100f) {
                return toPoint(lastKnown)
            }
        }

        val fresh = requestCurrent(
            manager = manager,
            providers = providers,
            lowPower = !highAccuracy,
        )
        val best = listOfNotNull(fresh, lastKnown)
            .minByOrNull { location -> quality(location) }
        return best?.let(::toPoint)
    }

    fun fromLocation(location: Location): LocationPoint = toPoint(location)

    private suspend fun requestCurrent(
        manager: LocationManager,
        providers: List<String>,
        lowPower: Boolean,
    ): Location? = suspendCancellableCoroutine { continuation ->
        val handler = Handler(Looper.getMainLooper())
        val finished = AtomicBoolean(false)
        val listeners = mutableMapOf<String, LocationListener>()
        var best: Location? = null
        val targetAccuracy = if (lowPower) 150f else 50f
        val timeoutMs = if (lowPower) 15_000L else 28_000L

        fun cleanup() {
            listeners.forEach { (provider, listener) ->
                try {
                    manager.removeUpdates(listener)
                } catch (_: Exception) {
                    // Provider may have disappeared; nothing else to release.
                }
            }
            listeners.clear()
            handler.removeCallbacksAndMessages(null)
        }

        fun finish(location: Location?) {
            if (!finished.compareAndSet(false, true)) return
            cleanup()
            if (continuation.isActive) continuation.resume(location)
        }

        val listener = object : LocationListener {
            override fun onLocationChanged(location: Location) {
                val current = best
                if (current == null || location.accuracy < current.accuracy) {
                    best = location
                }
                if (location.accuracy <= targetAccuracy) {
                    finish(location)
                }
            }

            override fun onProviderEnabled(provider: String) = Unit
            override fun onProviderDisabled(provider: String) = Unit

            @Deprecated("Deprecated in API 29")
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
        }

        val timeout = Runnable { finish(best) }
        for (provider in providers) {
            try {
                manager.requestLocationUpdates(provider, 0L, 0f, listener, Looper.getMainLooper())
                listeners[provider] = listener
            } catch (_: SecurityException) {
                // Coarse-only permission cannot use GPS on some releases.
            } catch (_: Exception) {
                // Ignore a provider that disappeared between enumeration and use.
            }
        }

        if (listeners.isEmpty()) {
            finish(null)
            return@suspendCancellableCoroutine
        }

        handler.postDelayed(timeout, timeoutMs)
        continuation.invokeOnCancellation {
            handler.post {
                if (finished.compareAndSet(false, true)) cleanup()
            }
        }
    }

    private fun availableProviders(manager: LocationManager, highAccuracy: Boolean): List<String> {
        val preferred = if (highAccuracy) {
            listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER)
        } else {
            listOf(LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER, LocationManager.PASSIVE_PROVIDER)
        }
        return preferred.filter { provider ->
            try {
                manager.allProviders.contains(provider) && manager.isProviderEnabled(provider)
            } catch (_: Exception) {
                false
            }
        }
    }

    private fun safeLastKnown(manager: LocationManager, provider: String): Location? = try {
        manager.getLastKnownLocation(provider)
    } catch (_: SecurityException) {
        null
    } catch (_: Exception) {
        null
    }

    private fun quality(location: Location): Double {
        val ageSeconds = ((System.currentTimeMillis() - location.time).coerceAtLeast(0L)) / 1000.0
        val accuracy = if (location.hasAccuracy()) location.accuracy.toDouble() else 2_000.0
        return accuracy + ageSeconds
    }

    private fun toPoint(location: Location): LocationPoint {
        val status = DeviceStatusReader.read(context)
        val heading = if (location.hasBearing()) {
            ((location.bearing % 360f) + 360f) % 360f
        } else {
            null
        }
        return LocationPoint(
            recordedAt = if (location.time > 0) location.time else System.currentTimeMillis(),
            latitude = location.latitude,
            longitude = location.longitude,
            accuracyM = if (location.hasAccuracy()) location.accuracy.toDouble().coerceAtLeast(0.0) else 0.0,
            altitudeM = if (location.hasAltitude()) location.altitude else null,
            speedMps = if (location.hasSpeed()) location.speed.toDouble().coerceAtLeast(0.0) else null,
            headingDeg = heading?.toDouble(),
            batteryLevel = status.batteryLevel,
            isCharging = status.isCharging,
            provider = location.provider?.take(32) ?: "unknown",
            networkType = status.networkType,
            isMocked = isMocked(location),
            sequence = prefs.nextSequence(),
        )
    }

    @Suppress("DEPRECATION")
    private fun isMocked(location: Location): Boolean = location.isFromMockProvider
}
