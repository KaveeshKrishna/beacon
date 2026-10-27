package dev.beacon.app.notifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import dev.beacon.app.media.AlarmPlayer

class NotificationActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == NotificationHelper.ACTION_SILENCE_ALARM) {
            AlarmPlayer.stop()
            NotificationHelper.cancelAlarm(context)
        }
    }
}
