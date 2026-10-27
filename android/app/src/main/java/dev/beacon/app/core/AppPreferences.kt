package dev.beacon.app.core

import android.content.Context
import androidx.core.content.edit

data class Pairing(
    val deviceId: String,
    val token: String,
    val serverUrl: String,
    val deviceName: String,
    val ownerName: String,
)

data class PendingPhoto(
    val commandId: String,
    val expiresAt: Long,
)

class AppPreferences(context: Context) {
    private val prefs = context.getSharedPreferences("beacon.preferences", Context.MODE_PRIVATE)

    fun pairing(): Pairing? {
        val deviceId = prefs.getString(KEY_DEVICE_ID, null) ?: return null
        val serverUrl = prefs.getString(KEY_SERVER_URL, null) ?: return null
        val sealedToken = prefs.getString(KEY_TOKEN, null) ?: return null
        val token = KeystoreCrypto.decryptString(sealedToken) ?: return null
        if (!token.startsWith("bc_dev_")) return null
        return Pairing(
            deviceId = deviceId,
            token = token,
            serverUrl = serverUrl,
            deviceName = prefs.getString(KEY_DEVICE_NAME, null).orEmpty(),
            ownerName = prefs.getString(KEY_OWNER_NAME, null).orEmpty(),
        )
    }

    fun savePairing(pairing: Pairing) {
        prefs.edit {
            putString(KEY_DEVICE_ID, pairing.deviceId)
            putString(KEY_SERVER_URL, pairing.serverUrl)
            putString(KEY_TOKEN, KeystoreCrypto.encryptString(pairing.token))
            putString(KEY_DEVICE_NAME, pairing.deviceName)
            putString(KEY_OWNER_NAME, pairing.ownerName)
            putBoolean(KEY_AUTH_REVOKED, false)
            putString(KEY_LAST_ERROR, null)
        }
    }

    fun clearPairing() {
        prefs.edit().clear().apply()
    }

    val isPaired: Boolean
        get() = pairing() != null

    fun markAuthRevoked() {
        prefs.edit { putBoolean(KEY_AUTH_REVOKED, true) }
    }

    val authRevoked: Boolean
        get() = prefs.getBoolean(KEY_AUTH_REVOKED, false)

    fun clearAuthRevoked() {
        prefs.edit { putBoolean(KEY_AUTH_REVOKED, false) }
    }

    var lostMode: Boolean
        get() = prefs.getBoolean(KEY_LOST_MODE, false)
        set(value) = prefs.edit { putBoolean(KEY_LOST_MODE, value) }

    var trackingProfile: String
        get() = normalizeProfile(prefs.getString(KEY_TRACKING_PROFILE, null))
        set(value) = prefs.edit { putString(KEY_TRACKING_PROFILE, normalizeProfile(value)) }

    var lastSyncAt: Long
        get() = prefs.getLong(KEY_LAST_SYNC, 0L)
        set(value) = prefs.edit { putLong(KEY_LAST_SYNC, value) }

    var lastHeartbeatAt: Long
        get() = prefs.getLong(KEY_LAST_HEARTBEAT, 0L)
        set(value) = prefs.edit { putLong(KEY_LAST_HEARTBEAT, value) }

    var lastSmsAt: Long
        get() = prefs.getLong(KEY_LAST_SMS, 0L)
        set(value) = prefs.edit { putLong(KEY_LAST_SMS, value) }

    var lastError: String?
        get() = prefs.getString(KEY_LAST_ERROR, null)
        set(value) = prefs.edit { putString(KEY_LAST_ERROR, value) }

    var offlineAlertMinutes: Int
        get() = prefs.getInt(KEY_OFFLINE_MINUTES, 45).coerceIn(10, 10_080)
        set(value) = prefs.edit { putInt(KEY_OFFLINE_MINUTES, value.coerceIn(10, 10_080)) }

    var fallbackSmsNumber: String?
        get() {
            val sealed = prefs.getString(KEY_FALLBACK_SMS, null) ?: return null
            val number = KeystoreCrypto.decryptString(sealed) ?: return null
            return number.takeIf { it.matches(Regex("^\\+[1-9]\\d{6,14}$")) }
        }
        set(value) {
            prefs.edit {
                if (value.isNullOrBlank()) {
                    remove(KEY_FALLBACK_SMS)
                } else {
                    putString(KEY_FALLBACK_SMS, KeystoreCrypto.encryptString(value))
                }
            }
        }

    var lastOwnerMessage: String?
        get() {
            val sealed = prefs.getString(KEY_OWNER_MESSAGE, null) ?: return null
            return KeystoreCrypto.decryptString(sealed)?.take(200)
        }
        set(value) {
            prefs.edit {
                if (value.isNullOrBlank()) {
                    remove(KEY_OWNER_MESSAGE)
                } else {
                    putString(KEY_OWNER_MESSAGE, KeystoreCrypto.encryptString(value.take(200)))
                }
            }
        }

    var pendingPhoto: PendingPhoto?
        get() {
            val id = prefs.getString(KEY_PHOTO_COMMAND, null) ?: return null
            val expiresAt = prefs.getLong(KEY_PHOTO_EXPIRES, 0L)
            return PendingPhoto(id, expiresAt)
        }
        set(value) {
            prefs.edit {
                if (value == null) {
                    remove(KEY_PHOTO_COMMAND)
                    remove(KEY_PHOTO_EXPIRES)
                } else {
                    putString(KEY_PHOTO_COMMAND, value.commandId)
                    putLong(KEY_PHOTO_EXPIRES, value.expiresAt)
                }
            }
        }

    @Synchronized
    fun nextSequence(): Long {
        val next = prefs.getLong(KEY_SEQUENCE, 0L) + 1L
        prefs.edit { putLong(KEY_SEQUENCE, next) }
        return next
    }

    private fun normalizeProfile(value: String?): String = when (value) {
        "low", "balanced", "high" -> value
        else -> "balanced"
    }

    private companion object {
        const val KEY_DEVICE_ID = "device_id"
        const val KEY_TOKEN = "device_token_sealed"
        const val KEY_SERVER_URL = "server_url"
        const val KEY_DEVICE_NAME = "device_name"
        const val KEY_OWNER_NAME = "owner_name"
        const val KEY_AUTH_REVOKED = "auth_revoked"
        const val KEY_LOST_MODE = "lost_mode"
        const val KEY_TRACKING_PROFILE = "tracking_profile"
        const val KEY_LAST_SYNC = "last_sync_at"
        const val KEY_LAST_HEARTBEAT = "last_heartbeat_at"
        const val KEY_LAST_SMS = "last_sms_at"
        const val KEY_LAST_ERROR = "last_error"
        const val KEY_OFFLINE_MINUTES = "offline_alert_minutes"
        const val KEY_FALLBACK_SMS = "fallback_sms_sealed"
        const val KEY_OWNER_MESSAGE = "owner_message_sealed"
        const val KEY_PHOTO_COMMAND = "pending_photo_command"
        const val KEY_PHOTO_EXPIRES = "pending_photo_expires"
        const val KEY_SEQUENCE = "sequence"
    }
}
