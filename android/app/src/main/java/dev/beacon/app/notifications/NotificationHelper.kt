package dev.beacon.app.notifications

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import dev.beacon.app.MainActivity
import dev.beacon.app.R

object NotificationHelper {
    const val CHANNEL_TRACKING = "beacon.tracking"
    const val CHANNEL_ALERTS = "beacon.alerts"
    const val CHANNEL_LOST = "beacon.lost"
    const val CHANNEL_ALARM = "beacon.alarm"

    const val ID_TRACKING = 1001
    const val ID_MESSAGE = 2001
    const val ID_PHOTO = 2002
    const val ID_REVOKED = 2003
    const val ID_ALARM = 2004

    const val EXTRA_PHOTO_REQUEST = "photo_request"
    const val ACTION_SILENCE_ALARM = "dev.beacon.app.SILENCE_ALARM"

    fun createChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        manager.createNotificationChannels(
            listOf(
                NotificationChannel(
                    CHANNEL_TRACKING,
                    context.getString(R.string.channel_tracking_name),
                    NotificationManager.IMPORTANCE_LOW,
                ).apply {
                    description = context.getString(R.string.channel_tracking_description)
                    setShowBadge(false)
                },
                NotificationChannel(
                    CHANNEL_ALERTS,
                    context.getString(R.string.channel_alerts_name),
                    NotificationManager.IMPORTANCE_HIGH,
                ).apply {
                    description = context.getString(R.string.channel_alerts_description)
                },
                NotificationChannel(
                    CHANNEL_LOST,
                    context.getString(R.string.channel_lost_name),
                    NotificationManager.IMPORTANCE_HIGH,
                ).apply {
                    description = context.getString(R.string.channel_lost_description)
                    setShowBadge(true)
                },
                NotificationChannel(
                    CHANNEL_ALARM,
                    context.getString(R.string.channel_alarm_name),
                    NotificationManager.IMPORTANCE_HIGH,
                ).apply {
                    description = context.getString(R.string.channel_alarm_description)
                },
            ),
        )
    }

    fun trackingNotification(
        context: Context,
        lostMode: Boolean,
        text: String? = null,
    ): Notification {
        val content = text ?: if (lostMode) {
            context.getString(R.string.notification_lost_text)
        } else {
            context.getString(R.string.notification_tracking_text)
        }
        return base(
            context = context,
            channel = if (lostMode) CHANNEL_LOST else CHANNEL_TRACKING,
            title = context.getString(
                if (lostMode) R.string.notification_lost_title else R.string.notification_tracking_title,
            ),
            text = content,
        )
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(if (lostMode) NotificationCompat.CATEGORY_STATUS else NotificationCompat.CATEGORY_SERVICE)
            .setContentIntent(openAppIntent(context))
            .build()
    }

    fun showMessage(context: Context, message: String) {
        val notification = base(
            context,
            CHANNEL_ALERTS,
            context.getString(R.string.notification_message_title),
            message,
        )
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setContentIntent(openAppIntent(context))
            .build()
        notify(context, ID_MESSAGE, notification)
    }

    fun showPhotoRequest(context: Context) {
        val notification = base(
            context,
            CHANNEL_ALERTS,
            context.getString(R.string.notification_photo_title),
            context.getString(R.string.notification_photo_text),
        )
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(openAppIntent(context, photoRequest = true))
            .addAction(
                0,
                context.getString(R.string.notification_action_photo),
                openAppIntent(context, photoRequest = true),
            )
            .build()
        notify(context, ID_PHOTO, notification)
    }

    fun showRevoked(context: Context) {
        val notification = base(
            context,
            CHANNEL_ALERTS,
            context.getString(R.string.notification_revoked_title),
            context.getString(R.string.notification_revoked_text),
        )
            .setCategory(NotificationCompat.CATEGORY_ERROR)
            .setAutoCancel(true)
            .setContentIntent(openAppIntent(context))
            .build()
        notify(context, ID_REVOKED, notification)
    }

    fun showAlarm(context: Context) {
        val notification = base(
            context,
            CHANNEL_ALARM,
            context.getString(R.string.notification_alarm_title),
            context.getString(R.string.notification_alarm_text),
        )
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setOngoing(true)
            .setContentIntent(openAppIntent(context))
            .addAction(
                0,
                context.getString(R.string.notification_action_silence),
                silenceIntent(context),
            )
            .build()
        notify(context, ID_ALARM, notification)
    }

    fun cancelAlarm(context: Context) {
        NotificationManagerCompat.from(context).cancel(ID_ALARM)
    }

    fun cancelPhoto(context: Context) {
        NotificationManagerCompat.from(context).cancel(ID_PHOTO)
    }

    fun cancelRevoked(context: Context) {
        NotificationManagerCompat.from(context).cancel(ID_REVOKED)
    }

    fun cancelTracking(context: Context) {
        NotificationManagerCompat.from(context).cancel(ID_TRACKING)
    }

    private fun base(
        context: Context,
        channel: String,
        title: String,
        text: String,
    ): NotificationCompat.Builder = NotificationCompat.Builder(context, channel)
        .setSmallIcon(R.drawable.ic_notification)
        .setColor(0xFFFF6A45.toInt())
        .setContentTitle(title)
        .setContentText(text)
        .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
        .setPriority(NotificationCompat.PRIORITY_HIGH)

    private fun openAppIntent(context: Context, photoRequest: Boolean = false): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            if (photoRequest) putExtra(EXTRA_PHOTO_REQUEST, true)
        }
        return PendingIntent.getActivity(
            context,
            if (photoRequest) 41 else 40,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun silenceIntent(context: Context): PendingIntent {
        val intent = Intent(context, NotificationActionReceiver::class.java).apply {
            action = ACTION_SILENCE_ALARM
            setPackage(context.packageName)
        }
        return PendingIntent.getBroadcast(
            context,
            42,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun notify(context: Context, id: Int, notification: Notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS,
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        try {
            NotificationManagerCompat.from(context).notify(id, notification)
        } catch (_: SecurityException) {
            // The user can disable notifications at any time.
        }
    }
}
