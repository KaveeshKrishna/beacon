package dev.beacon.app.sms

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.telephony.SmsManager
import androidx.core.content.ContextCompat
import dev.beacon.app.core.AppPreferences
import dev.beacon.app.data.LocationPoint
import java.time.Instant
import java.util.Locale

/**
 * Last-resort breadcrumb over SMS when mobile data is unavailable and the
 * owner configured an E.164 fallback number. SMS is not end-to-end encrypted;
 * this is deliberately rate limited and never used while HTTPS works.
 */
object SmsFallback {
    private const val MIN_INTERVAL_MS = 15 * 60_000L
    private const val MAX_FIX_AGE_MS = 10 * 60_000L

    fun sendIfNeeded(
        context: Context,
        prefs: AppPreferences,
        point: LocationPoint,
    ): Boolean {
        val number = prefs.fallbackSmsNumber ?: return false
        if (ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.SEND_SMS,
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            return false
        }

        val now = System.currentTimeMillis()
        if (now - prefs.lastSmsAt < MIN_INTERVAL_MS) return false
        if (now - point.recordedAt > MAX_FIX_AGE_MS) return false
        if (point.latitude !in -90.0..90.0 || point.longitude !in -180.0..180.0) return false

        val link = String.format(
            Locale.US,
            "https://maps.google.com/?q=%.6f,%.6f",
            point.latitude,
            point.longitude,
        )
        val body = buildString {
            append("Beacon offline location: ")
            append(link)
            append(" (+/-")
            append(point.accuracyM.toInt())
            append("m, ")
            append(Instant.ofEpochMilli(point.recordedAt))
            append(")")
        }

        return try {
            val manager = SmsManager.getDefault() ?: return false
            val parts = manager.divideMessage(body)
            manager.sendMultipartTextMessage(number, null, parts, null, null)
            prefs.lastSmsAt = now
            true
        } catch (_: Exception) {
            false
        }
    }
}
