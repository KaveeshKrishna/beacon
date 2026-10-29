package dev.beacon.app.work

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.TelephonyManager
import dev.beacon.app.core.AppPreferences
import dev.beacon.app.location.TrackingScheduler
import dev.beacon.app.security.DeviceAdmin

/**
 * A pulled SIM tray is a strong signal that a device is about to go dark.
 * ACTION_SIM_STATE_CHANGED is one of the implicit broadcasts that Android
 * still delivers to manifest receivers, so take a fix and try to report it
 * while any remaining network (Wi-Fi, eSIM, hotspot) is still usable.
 *
 * If "Lock on SIM removal" is enabled and device administration is active,
 * the screen is locked first. That keeps the app's encrypted data behind the
 * owner's PIN even if the phone is still unlocked when the tray is opened.
 * The lock is a deterrent, not a wipe: a thief who keeps the phone unlocked
 * and never touches the SIM is not stopped by it.
 *
 * If there is no network at all the point stays in the encrypted queue and
 * uploads as soon as connectivity returns. Connectivity itself is watched by
 * the process-wide NetworkCallback in BeaconApplication, because
 * CONNECTIVITY_CHANGE is not delivered to manifest receivers on Android 8+.
 */
class SimStateReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_SIM_STATE_CHANGED) return

        val prefs = AppPreferences(context)
        val telephony = context.getSystemService(TelephonyManager::class.java)
        val reported = intent.getStringExtra(EXTRA_SIM_STATE)
        val current = try {
            telephony?.simState ?: TelephonyManager.SIM_STATE_UNKNOWN
        } catch (_: Exception) {
            TelephonyManager.SIM_STATE_UNKNOWN
        }

        if (isReady(reported) || current == TelephonyManager.SIM_STATE_READY) {
            prefs.simWasReady = true
        } else if (reported == "ABSENT" &&
            current != TelephonyManager.SIM_STATE_READY
        ) {
            val wasReady = prefs.simWasReady
            prefs.simWasReady = false
            if (wasReady &&
                prefs.lockOnSimRemoval &&
                prefs.pairing() != null &&
                !prefs.authRevoked &&
                DeviceAdmin.isActive(context)
            ) {
                DeviceAdmin.lock(context)
            }
        }

        if (prefs.pairing() == null || prefs.authRevoked) return

        TrackingScheduler.syncSoon(context)
    }

    private fun isReady(value: String?): Boolean =
        value == "READY" || value == "LOADED"

    private companion object {
        const val ACTION_SIM_STATE_CHANGED = "android.intent.action.SIM_STATE_CHANGED"
        const val EXTRA_SIM_STATE = "ss"
    }
}
