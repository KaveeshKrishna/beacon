package dev.beacon.app.work

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import dev.beacon.app.core.AppPreferences
import dev.beacon.app.location.TrackingScheduler
import dev.beacon.app.tracking.TrackingService

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED &&
            intent.action != Intent.ACTION_MY_PACKAGE_REPLACED
        ) {
            return
        }
        val prefs = AppPreferences(context)
        if (prefs.pairing() == null || prefs.authRevoked) return
        TrackingScheduler.scheduleFromPreferences(context, prefs)
        TrackingScheduler.syncSoon(context)
        if (prefs.lostMode) {
            try {
                TrackingService.start(context)
            } catch (_: Exception) {
                // Android may refuse a foreground service start from boot on
                // newer releases. The periodic worker remains the fallback.
            }
        }
    }
}
