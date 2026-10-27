package dev.beacon.app.sync

import android.content.Context
import dev.beacon.app.core.AppPreferences
import dev.beacon.app.data.DeviceStatusReader
import dev.beacon.app.data.LocationPoint
import dev.beacon.app.data.QueueStore
import dev.beacon.app.location.LocationSampler
import dev.beacon.app.location.TrackingScheduler
import dev.beacon.app.network.ApiClient
import dev.beacon.app.network.ApiResult
import dev.beacon.app.network.DeviceConfig
import dev.beacon.app.network.DeviceCommand
import dev.beacon.app.network.FailureKind
import dev.beacon.app.notifications.NotificationHelper
import dev.beacon.app.sms.SmsFallback
import dev.beacon.app.tracking.TrackingService
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

enum class SyncTrigger {
    PERIODIC,
    MANUAL,
    LIVE,
    COMMAND_POLL,
}

class SyncEngine(
    private val context: Context,
    private val prefs: AppPreferences,
    private val queue: QueueStore,
    private val api: ApiClient,
    private val sampler: LocationSampler,
    private val commandHandler: CommandHandler,
    private val onStateChanged: () -> Unit,
) {
    sealed interface Outcome {
        data class Done(val message: String) : Outcome
        data class Retry(val message: String) : Outcome
        data object Stopped : Outcome
    }

    suspend fun run(
        trigger: SyncTrigger,
        providedPoint: LocationPoint? = null,
    ): Outcome = mutex.withLock {
        runLocked(trigger, providedPoint)
    }

    private suspend fun runLocked(
        trigger: SyncTrigger,
        providedPoint: LocationPoint?,
    ): Outcome {
        val pairing = prefs.pairing()
        if (pairing == null) return Outcome.Stopped
        if (prefs.authRevoked) return Outcome.Stopped

        var point = providedPoint
        if (point == null &&
            trigger != SyncTrigger.COMMAND_POLL &&
            sampler.hasForegroundPermission()
        ) {
            point = try {
                sampler.collect(highAccuracy = prefs.lostMode || trigger == SyncTrigger.MANUAL)
            } catch (_: Exception) {
                null
            }
        }
        if (point != null) queue.enqueue(point)

        val status = DeviceStatusReader.read(context)
        val hasInternet = DeviceStatusReader.hasInternet(context)
        var commands = mutableListOf<DeviceCommand>()
        var config: DeviceConfig? = null
        var networkFailure = !hasInternet
        var retry = false
        var sentSomething = false

        if (hasInternet) {
            if (queue.count() > 0) {
                when (val result = flushQueue(pairing.serverUrl, pairing.token)) {
                    is FlushResult.Success -> {
                        commands += result.commands
                        config = result.config
                        sentSomething = true
                        prefs.lastError = null
                        prefs.lastSyncAt = System.currentTimeMillis()
                    }
                    is FlushResult.Failure -> {
                        networkFailure = result.networkFailure
                        retry = result.retry
                        if (result.revoked) {
                            handleRevoked()
                            onStateChanged()
                            return Outcome.Stopped
                        }
                    }
                }
            }

            val heartbeatDue = System.currentTimeMillis() - prefs.lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS
            if (!retry && heartbeatDue && queue.count() == 0) {
                when (
                    val result = api.heartbeat(
                        serverUrl = pairing.serverUrl,
                        token = pairing.token,
                        batteryLevel = status.batteryLevel,
                        isCharging = status.isCharging,
                        networkType = status.networkType,
                        simState = status.simState,
                        appVersion = dev.beacon.app.BuildConfig.VERSION_NAME,
                        androidVersion = android.os.Build.VERSION.RELEASE,
                    )
                ) {
                    is ApiResult.Success -> {
                        commands += result.value.commands
                        config = result.value.config
                        sentSomething = true
                        prefs.lastHeartbeatAt = System.currentTimeMillis()
                        prefs.lastError = null
                    }
                    is ApiResult.Failure -> {
                        if (result.kind == FailureKind.UNAUTHORIZED) {
                            handleRevoked()
                            onStateChanged()
                            return Outcome.Stopped
                        }
                        if (result.kind == FailureKind.NETWORK) networkFailure = true
                        if (result.kind == FailureKind.NETWORK ||
                            result.kind == FailureKind.RATE_LIMITED ||
                            result.kind == FailureKind.HTTP
                        ) {
                            retry = true
                        }
                        prefs.lastError = result.message
                    }
                }
            }
        }

        if (networkFailure && point != null) {
            SmsFallback.sendIfNeeded(context, prefs, point)
        }

        if (networkFailure) {
            prefs.lastError = if (queue.count() > 0) {
                "Offline. ${queue.count()} location points are waiting to upload."
            } else {
                "Offline. Tracking continues and will sync when the connection returns."
            }
        }

        config?.let { applyConfig(it) }

        var needsAnotherFlush = false
        commands
            .distinctBy { it.id }
            .forEach { command ->
                val outcome = try {
                    commandHandler.handle(command)
                } catch (_: Exception) {
                    CommandHandler.Outcome.Ack(
                        status = "failed",
                        result = org.json.JSONObject().put("message", "The device could not run this action."),
                    )
                }
                when (outcome) {
                    is CommandHandler.Outcome.Deferred -> Unit
                    is CommandHandler.Outcome.Ack -> {
                        needsAnotherFlush = needsAnotherFlush || outcome.needsFlush
                        api.acknowledge(
                            serverUrl = pairing.serverUrl,
                            token = pairing.token,
                            commandId = command.id,
                            status = outcome.status,
                            result = outcome.result,
                        )
                    }
                }
            }

        if (needsAnotherFlush && hasInternet && queue.count() > 0) {
            when (val result = flushQueue(pairing.serverUrl, pairing.token)) {
                is FlushResult.Success -> {
                    prefs.lastSyncAt = System.currentTimeMillis()
                    prefs.lastError = null
                    sentSomething = true
                    result.config?.let(::applyConfig)
                }
                is FlushResult.Failure -> {
                    if (result.revoked) {
                        handleRevoked()
                        onStateChanged()
                        return Outcome.Stopped
                    }
                    retry = retry || result.retry
                }
            }
        }

        onStateChanged()

        if (retry) {
            return Outcome.Retry(
                prefs.lastError ?: "The server could not be reached. It will retry.",
            )
        }
        if (!sentSomething && queue.count() == 0 && point == null) {
            return Outcome.Done("Nothing new to sync.")
        }
        return Outcome.Done(
            if (queue.count() > 0) {
                "Sync incomplete. ${queue.count()} points remain queued."
            } else {
                "Synced with the Beacon server."
            },
        )
    }

    private suspend fun flushQueue(
        serverUrl: String,
        token: String,
    ): FlushResult {
        val pending = queue.pending(MAX_BATCH)
        if (pending.isEmpty()) {
            return FlushResult.Success(emptyList(), null)
        }
        val ids = pending.map { it.id }
        return when (
            val result = api.sync(
                serverUrl = serverUrl,
                token = token,
                points = pending.map { it.payload },
            )
        ) {
            is ApiResult.Success -> {
                queue.delete(ids)
                FlushResult.Success(result.value.commands, result.value.config)
            }
            is ApiResult.Failure -> {
                queue.markAttempt(ids, result.message)
                FlushResult.Failure(
                    networkFailure = result.kind == FailureKind.NETWORK,
                    retry = result.kind == FailureKind.NETWORK ||
                        result.kind == FailureKind.RATE_LIMITED ||
                        result.kind == FailureKind.HTTP,
                    revoked = result.kind == FailureKind.UNAUTHORIZED,
                )
            }
        }
    }

    private fun applyConfig(config: DeviceConfig) {
        prefs.offlineAlertMinutes = config.offlineAlertMinutes
        prefs.fallbackSmsNumber = config.fallbackSmsNumber
        if (prefs.trackingProfile != config.trackingProfile) {
            prefs.trackingProfile = config.trackingProfile
            TrackingScheduler.schedule(context, config.trackingProfile)
        }
        if (prefs.lostMode != config.lostMode) {
            prefs.lostMode = config.lostMode
            if (config.lostMode) {
                try {
                    TrackingService.start(context)
                } catch (_: Exception) {
                    // Periodic work still runs; the UI explains the limitation.
                }
            } else {
                TrackingService.stop(context)
            }
        }
    }

    private fun handleRevoked() {
        prefs.markAuthRevoked()
        prefs.lastError = "This device was unpaired or revoked. Pair it again to resume."
        queue.clear()
        TrackingScheduler.cancel(context)
        TrackingService.stop(context)
        NotificationHelper.showRevoked(context)
    }

    private sealed interface FlushResult {
        data class Success(
            val commands: List<DeviceCommand>,
            val config: DeviceConfig?,
        ) : FlushResult

        data class Failure(
            val networkFailure: Boolean,
            val retry: Boolean,
            val revoked: Boolean,
        ) : FlushResult
    }

    private companion object {
        val mutex = Mutex()
        const val MAX_BATCH = 200
        const val HEARTBEAT_INTERVAL_MS = 10 * 60_000L
    }
}
