package dev.beacon.app.sync

import android.content.Context
import dev.beacon.app.core.AppPreferences
import dev.beacon.app.core.PendingPhoto
import dev.beacon.app.data.QueueStore
import dev.beacon.app.location.LocationSampler
import dev.beacon.app.media.AlarmPlayer
import dev.beacon.app.network.DeviceCommand
import dev.beacon.app.notifications.NotificationHelper
import dev.beacon.app.security.DeviceAdmin
import dev.beacon.app.tracking.TrackingService
import java.time.Instant
import org.json.JSONObject

class CommandHandler(
    private val context: Context,
    private val prefs: AppPreferences,
    private val queue: QueueStore,
    private val sampler: LocationSampler,
) {
    sealed interface Outcome {
        data class Ack(
            val status: String,
            val result: JSONObject,
            val needsFlush: Boolean = false,
        ) : Outcome

        data object Deferred : Outcome
    }

    suspend fun handle(command: DeviceCommand): Outcome {
        return when (command.type) {
            "LOCATE_NOW" -> locateNow()
            "SYNC_NOW" -> ack("completed", "Sync requested. Queued points will upload now.", needsFlush = true)
            "RING" -> ring()
            "LOST_MODE_ON" -> enableLostMode()
            "LOST_MODE_OFF" -> disableLostMode()
            "LOCK_DEVICE" -> lockDevice()
            "MESSAGE" -> showMessage(command)
            "CAPTURE_PHOTO" -> requestPhoto(command)
            else -> ack("unsupported", "This app version does not support that command.")
        }
    }

    private suspend fun locateNow(): Outcome {
        val point = try {
            sampler.collect(highAccuracy = true)
        } catch (_: Exception) {
            null
        }
        if (point == null) {
            return ack("failed", "No location fix was available. Check location permissions.")
        }
        queue.enqueue(point)
        return ack("completed", "A fresh location was captured and queued.", needsFlush = true)
    }

    private fun ring(): Outcome {
        AlarmPlayer.start(context)
        NotificationHelper.showAlarm(context)
        return ack("completed", "Alarm started. It can be silenced on the device.")
    }

    private fun enableLostMode(): Outcome {
        prefs.lostMode = true
        NotificationHelper.showAlarm(context)
        AlarmPlayer.start(context, 60_000L)
        val serviceStarted = try {
            TrackingService.start(context)
            true
        } catch (_: Exception) {
            false
        }
        return ack(
            if (serviceStarted) "completed" else "failed",
            if (serviceStarted) {
                "Lost mode enabled. Live tracking started."
            } else {
                "Lost mode saved, but Android refused the live service. Periodic tracking continues."
            },
        )
    }

    private fun disableLostMode(): Outcome {
        prefs.lostMode = false
        AlarmPlayer.stop()
        NotificationHelper.cancelAlarm(context)
        TrackingService.stop(context)
        return ack("completed", "Lost mode disabled.")
    }

    private fun lockDevice(): Outcome {
        if (!DeviceAdmin.isActive(context)) {
            return ack(
                "unsupported",
                "Device-admin permission is not enabled, so Android cannot lock the screen.",
            )
        }
        return if (DeviceAdmin.lock(context)) {
            ack("completed", "The screen was locked.")
        } else {
            ack("failed", "Android refused the lock request.")
        }
    }

    private fun showMessage(command: DeviceCommand): Outcome {
        val message = command.payload.optString("message").trim().take(200)
        if (message.isBlank()) {
            return ack("failed", "The message was empty.")
        }
        prefs.lastOwnerMessage = message
        NotificationHelper.showMessage(context, message)
        return ack("completed", "Message shown on the device.")
    }

    private fun requestPhoto(command: DeviceCommand): Outcome {
        val expiresAt = try {
            Instant.parse(command.expiresAt).toEpochMilli()
        } catch (_: Exception) {
            System.currentTimeMillis() + 24 * 60 * 60_000L
        }
        if (expiresAt <= System.currentTimeMillis()) {
            return ack("failed", "The photo request expired before it could be shown.")
        }
        prefs.pendingPhoto = PendingPhoto(command.id, expiresAt)
        NotificationHelper.showPhotoRequest(context)
        // The command is acknowledged only after the owner opens the app,
        // captures a frame and uploads it. Android does not permit silent
        // background camera access.
        return Outcome.Deferred
    }

    private fun ack(
        status: String,
        message: String,
        needsFlush: Boolean = false,
    ): Outcome.Ack = Outcome.Ack(
        status = status,
        result = JSONObject().put("message", message),
        needsFlush = needsFlush,
    )
}
