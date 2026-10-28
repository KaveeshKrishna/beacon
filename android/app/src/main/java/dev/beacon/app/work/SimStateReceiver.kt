package dev.beacon.app.work

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import dev.beacon.app.core.AppPreferences
import dev.beacon.app.location.TrackingScheduler

/**
 * A pulled SIM tray is a strong signal that a device is about to go dark.
 * ACTION_SIM_STATE_CHANGED is one of the implicit broadcasts that Android
 * still delivers to manifest receivers, so take a fix and try to report it
 * while any remaining network (Wi-Fi, eSIM, hotspot) is still usable.
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
        if (prefs.pairing() == null || prefs.authRevoked) return

        TrackingScheduler.syncSoon(context)
    }

    private companion object {
        const val ACTION_SIM_STATE_CHANGED = "android.intent.action.SIM_STATE_CHANGED"
    }
}
