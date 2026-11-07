package dev.beacon.app.work

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import dev.beacon.app.BeaconApplication
import dev.beacon.app.account.AccountRepository
import dev.beacon.app.network.ApiResult
import dev.beacon.app.network.FailureKind
import dev.beacon.app.sync.SyncEngine
import dev.beacon.app.sync.SyncTrigger

/**
 * Command and heartbeat poll for devices that are not running the foreground
 * service. It deliberately does not request a location fix, so it can run
 * every 15 minutes without competing with the owner's check-in cadence.
 */
class BeaconControlWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val app = applicationContext as? BeaconApplication ?: return Result.success()
        val prefs = app.container.prefs
        if (prefs.pairing() == null || prefs.authRevoked) return Result.success()

        checkMobileLink(app)

        return when (app.container.syncEngine.run(SyncTrigger.COMMAND_POLL)) {
            is SyncEngine.Outcome.Retry -> Result.retry()
            else -> Result.success()
        }
    }

    /**
     * A revoked Find My session is enforced by the server on every request.
     * The worker's periodic read is what clears the local copy on an idle
     * phone; while the app is open, the account screen detects the same 401.
     */
    private suspend fun checkMobileLink(app: BeaconApplication) {
        val prefs = app.container.prefs
        if (prefs.lostMode || prefs.mobileSession == null) return
        val repository = AccountRepository(app.container.api, prefs)
        val access = repository.ensureAccess()
        if (access !is ApiResult.Success) return
        val result = app.container.api.mobileDevices(
            access.value.serverUrl,
            access.value.accessToken,
        )
        if (result is ApiResult.Failure && result.kind == FailureKind.UNAUTHORIZED) {
            prefs.mobileSession = null
        }
    }
}
