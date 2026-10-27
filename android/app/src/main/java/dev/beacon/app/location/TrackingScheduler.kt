package dev.beacon.app.location

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import dev.beacon.app.work.BeaconWorker
import java.util.concurrent.TimeUnit

object TrackingScheduler {
    private const val PERIODIC_WORK = "beacon.periodic-sync"
    private const val INITIAL_WORK = "beacon.initial-sync"

    fun schedule(context: Context, profile: String) {
        val intervalMinutes = when (profile) {
            "low" -> 60L
            "high" -> 15L
            else -> 30L
        }
        val request = PeriodicWorkRequestBuilder<BeaconWorker>(
            intervalMinutes,
            TimeUnit.MINUTES,
            intervalMinutes / 2,
            TimeUnit.MINUTES,
        )
            .setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                30,
                TimeUnit.SECONDS,
            )
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            PERIODIC_WORK,
            ExistingPeriodicWorkPolicy.UPDATE,
            request,
        )
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
    }
}
