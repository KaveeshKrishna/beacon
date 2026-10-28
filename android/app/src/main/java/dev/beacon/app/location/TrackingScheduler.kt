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
import dev.beacon.app.work.BeaconWorker
import java.util.concurrent.TimeUnit

object TrackingScheduler {
    private const val PERIODIC_WORK = "beacon.periodic-sync"
    private const val INITIAL_WORK = "beacon.initial-sync"

    /** WorkManager refuses periodic work shorter than this. */
    const val MIN_PERIODIC_MINUTES = 15

    /**
     * Applies the user's check-in interval.
     *
     * 15 minutes and above runs through WorkManager, which survives Doze and
     * process death. Anything shorter needs the foreground service, because
     * WorkManager would silently clamp the interval to 15 minutes.
     */
    fun scheduleFromPreferences(context: Context, prefs: AppPreferences) {
        val interval = prefs.effectiveIntervalMinutes()

        if (prefs.lostMode || interval < MIN_PERIODIC_MINUTES) {
            WorkManager.getInstance(context).cancelUniqueWork(PERIODIC_WORK)
            prefs.scheduledIntervalMinutes = -1
            try {
                TrackingService.start(context)
            } catch (_: Exception) {
                // If the OS refuses the foreground service, periodic work is
                // still better than nothing.
                enqueuePeriodic(context, prefs, maxOf(interval, MIN_PERIODIC_MINUTES))
            }
            return
        }

        TrackingService.stop(context)
        enqueuePeriodic(context, prefs, interval)
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
        TrackingService.stop(context)
    }
}
