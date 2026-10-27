package dev.beacon.app.work

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import dev.beacon.app.BeaconApplication
import dev.beacon.app.sync.SyncEngine
import dev.beacon.app.sync.SyncTrigger

class BeaconWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val app = applicationContext as? BeaconApplication ?: return Result.success()
        return when (app.container.syncEngine.run(SyncTrigger.PERIODIC)) {
            is SyncEngine.Outcome.Retry -> Result.retry()
            else -> Result.success()
        }
    }
}
