package dev.beacon.app.location

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import dev.beacon.app.core.AppPreferences
import dev.beacon.app.tracking.TrackingService
import dev.beacon.app.work.BeaconControlWorker
import dev.beacon.app.work.BeaconWorker
import java.util.concurrent.TimeUnit

object TrackingScheduler {
    private const val PERIODIC_WORK = "beacon.periodic-sync"
    private const val INITIAL_WORK = "beacon.initial-sync"
    private const val CONTROL_WORK = "beacon.control-poll"
    private const val CONTROL_INTERVAL_MINUTES = 15L

    /** WorkManager refuses periodic work shorter than this. */
    const val MIN_PERIODIC_MINUTES = 15

    /**
     * Automatic mode with at least one fence and instant alerts enabled keeps
     * a lightweight foreground watcher. It is the only app-only way to notice
     * a fence crossing within minutes without Play services.
     */
    fun shouldWatchFences(prefs: AppPreferences): Boolean =
        !prefs.lostMode &&
            prefs.instantFenceAlerts &&
            prefs.syncIntervalMinutes == 0 &&
            prefs.geofences.isNotEmpty()

    /**
     * Applies the user's check-in interval.
     *
     * 15 minutes and above runs through WorkManager, which survives Doze and
     * process death. Anything shorter, lost mode, and the fence watcher need
     * the foreground service, because WorkManager would silently clamp the
     * interval to 15 minutes.
     *
     * When no service runs, a separate 15-minute control worker polls for
     * commands and sends a heartbeat without requesting a location fix.
     */
    fun scheduleFromPreferences(context: Context, prefs: AppPreferences) {
        if (prefs.pairing() == null || prefs.authRevoked) {
            cancel(context)
            return
        }

        val interval = prefs.effectiveIntervalMinutes()
        val fenceWatch = shouldWatchFences(prefs)

        if (prefs.lostMode || interval < MIN_PERIODIC_MINUTES || fenceWatch) {
            WorkManager.getInstance(context).cancelUniqueWork(PERIODIC_WORK)
            prefs.scheduledIntervalMinutes = -1
            try {
                TrackingService.start(context)
                cancelControl(context)
            } catch (_: Exception) {
                // If the OS refuses the foreground service, periodic work is
                // still better than nothing. The control worker keeps command
                // latency at 15 minutes.
                enqueuePeriodic(context, prefs, maxOf(interval, MIN_PERIODIC_MINUTES))
                enqueueControl(context)
            }
            return
        }

        TrackingService.stop(context)
        cancelControl(context)
        enqueuePeriodic(context, prefs, interval)
        enqueueControl(context)
    }

    private fun enqueuePeriodic(
        context: Context,
        prefs: AppPreferences,
        intervalMinutes: Int,
    ) {
        val interval = intervalMinutes.coerceAtLeast(MIN_PERIODIC_MINUTES).toLong()
        val request = PeriodicWorkRequestBuilder<BeaconWorker>(
            interval,
            TimeUnit.MINUTES,
            (interval / 2).coerceAtLeast(5),
            TimeUnit.MINUTES,
        )
            .setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                30,
                TimeUnit.SECONDS,
            )
            .build()
        // UPDATE keeps the original period, so changing 60 -> 15 would only
        // take effect after the current hour. Re-enqueue only on a real change
        // to avoid resetting the schedule on every app launch.
        val policy = if (prefs.scheduledIntervalMinutes == intervalMinutes) {
            ExistingPeriodicWorkPolicy.UPDATE
        } else {
            ExistingPeriodicWorkPolicy.CANCEL_AND_REENQUEUE
        }
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            PERIODIC_WORK,
            policy,
            request,
        )
        prefs.scheduledIntervalMinutes = intervalMinutes
    }

    /**
     * A command-only poll for devices whose location cadence is 15 minutes or
     * longer. It never asks for a GPS fix; the cost is one small HTTPS request
     * per period plus the modem wake-up.
     */
    private fun enqueueControl(context: Context) {
        val request = PeriodicWorkRequestBuilder<BeaconControlWorker>(
            CONTROL_INTERVAL_MINUTES,
            TimeUnit.MINUTES,
            5,
            TimeUnit.MINUTES,
        )
            .setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                30,
                TimeUnit.SECONDS,
            )
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            CONTROL_WORK,
            ExistingPeriodicWorkPolicy.UPDATE,
            request,
        )
    }

    private fun cancelControl(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(CONTROL_WORK)
    }

    fun syncSoon(context: Context) {
        val request = OneTimeWorkRequestBuilder<BeaconWorker>()
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            INITIAL_WORK,
            ExistingWorkPolicy.REPLACE,
            request,
        )
    }

    fun cancel(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(PERIODIC_WORK)
        WorkManager.getInstance(context).cancelUniqueWork(INITIAL_WORK)
        cancelControl(context)
        TrackingService.stop(context)
    }
}
