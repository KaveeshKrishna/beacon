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

    /**
     * 0 means "automatic": follow the server profile and, once geofences are
     * configured, fall back to the slow interval while the device is inside
     * one. Any other value is a user-chosen number of minutes.
     */
    var syncIntervalMinutes: Int
        get() = prefs.getInt(KEY_SYNC_INTERVAL, 0).coerceIn(0, 1440)
        set(value) = prefs.edit { putInt(KEY_SYNC_INTERVAL, value.coerceIn(0, 1440)) }

    fun effectiveIntervalMinutes(): Int {
        val chosen = syncIntervalMinutes
        if (chosen > 0) return chosen
        val base = when (trackingProfile) {
            "low" -> 60
            "high" -> 15
            else -> 30
        }
        if (geofences.isEmpty()) return base

        // Inside a place the owner trusts, check in less often. Away from all
        // of them, check in more often. This only applies to Automatic; a
        // fixed interval is always obeyed exactly.
        val inside = insideGeofenceId?.let { id ->
            geofences.any { it.id == id }
        } == true
        return if (inside) {
            when (trackingProfile) {
                "low" -> 60
                "high" -> 30
                else -> 60
            }
        } else {
            when (trackingProfile) {
                "low" -> 30
                "high" -> 15
                else -> 15
            }
        }
    }

    /**
     * Geometry of the fences known to this device, cached so the scheduler can
     * work offline. Authoritative copies live on the server.
     */
    var geofences: List<GeofenceInfo>
        get() {
            val raw = prefs.getString(KEY_GEOFENCES, null) ?: return emptyList()
            return try {
                val array = org.json.JSONArray(raw)
                buildList {
                    for (index in 0 until array.length()) {
                        val item = array.optJSONObject(index) ?: continue
                        val id = item.optString("id")
                        val name = item.optString("name")
                        val lat = item.optDouble("lat", Double.NaN)
                        val lon = item.optDouble("lon", Double.NaN)
                        val radius = item.optInt("radius", 0)
                        if (id.isBlank() || name.isBlank()) continue
                        if (!lat.isFinite() || !lon.isFinite()) continue
                        if (radius !in 50..50_000) continue
                        add(GeofenceInfo(id, name.take(60), lat, lon, radius))
                    }
                }
            } catch (_: Exception) {
                emptyList()
            }
        }
        set(value) {
            val array = org.json.JSONArray()
            value.take(20).forEach { fence ->
                array.put(
                    org.json.JSONObject()
                        .put("id", fence.id)
                        .put("name", fence.name.take(60))
                        .put("lat", fence.centerLat)
                        .put("lon", fence.centerLon)
                        .put("radius", fence.radiusM.coerceIn(50, 50_000)),
                )
            }
            prefs.edit { putString(KEY_GEOFENCES, array.toString()) }
            if (insideGeofenceId != null && value.none { it.id == insideGeofenceId }) {
                insideGeofenceId = null
            }
        }

    var insideGeofenceId: String?
        get() = prefs.getString(KEY_INSIDE_FENCE, null)
        private set(value) = prefs.edit {
            if (value == null) remove(KEY_INSIDE_FENCE) else putString(KEY_INSIDE_FENCE, value)
        }

    val insideGeofenceName: String?
        get() = insideGeofenceId?.let { id ->
            geofences.firstOrNull { it.id == id }?.name
        }

    /** Re-evaluates the cached fences against a fresh fix. */
    fun updateGeofenceState(latitude: Double, longitude: Double) {
        insideGeofenceId = GeofenceMath
            .containing(geofences, latitude, longitude)
            ?.id
    }

    fun clearGeofenceState() {
        insideGeofenceId = null
    }

    /**
     * Bookkeeping for WorkManager: changing WorkManager's period with
     * ExistingPeriodicWorkPolicy.UPDATE keeps the original schedule, so the
     * scheduler re-enqueues only when the requested interval really changed.
     */
    var scheduledIntervalMinutes: Int
        get() = prefs.getInt(KEY_SCHEDULED_INTERVAL, -1)
        set(value) = prefs.edit { putInt(KEY_SCHEDULED_INTERVAL, value) }

    /**
     * Screenshots and the recent-apps thumbnail are blocked by default because
     * they can leak coordinates. The owner can opt in from the app.
     */
    var allowScreenshots: Boolean
        get() = prefs.getBoolean(KEY_ALLOW_SCREENSHOTS, false)
        set(value) = prefs.edit { putBoolean(KEY_ALLOW_SCREENSHOTS, value) }

    /**
     * Opt-in countermeasure for a pulled SIM tray. Locking the screen keeps
     * the encrypted app data behind the owner's PIN; it is not a remote wipe
     * and it does not stop a determined thief.
     */
    var lockOnSimRemoval: Boolean
        get() = prefs.getBoolean(KEY_LOCK_ON_SIM_REMOVAL, false)
        set(value) = prefs.edit { putBoolean(KEY_LOCK_ON_SIM_REMOVAL, value) }

    /** Whether a usable SIM has been observed, so a transition can be detected. */
    var simWasReady: Boolean
        get() = prefs.getBoolean(KEY_SIM_WAS_READY, false)
        set(value) = prefs.edit { putBoolean(KEY_SIM_WAS_READY, value) }

    var lastSyncAt: Long
        get() = prefs.getLong(KEY_LAST_SYNC, 0L)
        set(value) = prefs.edit { putLong(KEY_LAST_SYNC, value) }

    var lastUpdateCheckAt: Long
        get() = prefs.getLong(KEY_LAST_UPDATE_CHECK, 0L)
        set(value) = prefs.edit { putLong(KEY_LAST_UPDATE_CHECK, value) }

    /** A version the owner chose to skip; manual checks still show it. */
    var ignoredUpdateVersion: String
        get() = prefs.getString(KEY_IGNORED_UPDATE, null).orEmpty()
        set(value) = prefs.edit { putString(KEY_IGNORED_UPDATE, value.take(32)) }

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
        const val KEY_SYNC_INTERVAL = "sync_interval_minutes"
        const val KEY_SCHEDULED_INTERVAL = "scheduled_interval_minutes"
        const val KEY_ALLOW_SCREENSHOTS = "allow_screenshots"
        const val KEY_LOCK_ON_SIM_REMOVAL = "lock_on_sim_removal"
        const val KEY_SIM_WAS_READY = "sim_was_ready"
        const val KEY_GEOFENCES = "geofences"
        const val KEY_INSIDE_FENCE = "inside_geofence_id"
        const val KEY_LAST_UPDATE_CHECK = "last_update_check"
        const val KEY_IGNORED_UPDATE = "ignored_update_version"
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
