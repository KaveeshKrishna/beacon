package dev.beacon.app.network

import android.net.Uri
import dev.beacon.app.BuildConfig
import dev.beacon.app.core.GeofenceInfo
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

/**
 * Deliberately small HTTPS client built on HttpURLConnection. No redirects, no
 * cookies, no proxy-auth handling and no logging of tokens or coordinates.
 */
class ApiClient {
    suspend fun pair(
        serverUrl: String,
        code: String,
        name: String,
        manufacturer: String,
        model: String,
        androidVersion: String,
        appVersion: String,
    ): ApiResult<PairResponse> = withContext(Dispatchers.IO) {
        val body = JSONObject().apply {
            put("code", code)
            put("name", name)
            put("manufacturer", manufacturer)
            put("model", model)
            put("androidVersion", androidVersion)
            put("appVersion", appVersion)
        }
        when (val result = request("POST", serverUrl, "/api/device/pair", null, body)) {
            is RawResult.Failure -> result.toApiFailure()
            is RawResult.Success -> parse(result.body) { data ->
                val deviceId = data.getString("deviceId")
                val token = data.getString("token")
                if (!token.startsWith("bc_dev_")) {
                    throw JSONException("Unexpected token")
                }
                PairResponse(
                    deviceId = deviceId,
                    token = token,
                    ownerName = data.optString("ownerName"),
                    deviceName = data.optString("deviceName", name),
                )
            }
        }
    }

    suspend fun mobileExchange(
        serverUrl: String,
        code: String,
        verifier: String,
        state: String,
    ): ApiResult<MobileExchangeResponse> = withContext(Dispatchers.IO) {
        val body = JSONObject().apply {
            put("code", code)
            put("verifier", verifier)
            put("state", state)
        }
        when (
            val result = request("POST", serverUrl, "/api/mobile/auth/exchange", null, body)
        ) {
            is RawResult.Failure -> result.toMobileFailure()
            is RawResult.Success -> parse(result.body) { data ->
                MobileExchangeResponse(
                    accessToken = data.requireMobileToken("accessToken", "bc_mob_"),
                    refreshToken = data.requireMobileToken("refreshToken", "bc_ref_"),
                    accessExpiresAt = data.requireMillis("accessExpiresAt"),
                    refreshExpiresAt = data.requireMillis("refreshExpiresAt"),
                    sessionCreatedAt = data.requireMillis("sessionCreatedAt"),
                    accountName = data.optJSONObject("account")
                        ?.optString("name").orEmpty().take(80),
                    accountEmailMasked =
                        data.optJSONObject("account")?.optString("emailMasked").orEmpty().take(120),
                    deviceId = data.optJSONObject("device")?.optString("id").orEmpty(),
                    deviceName = data.optJSONObject("device")?.optString("name").orEmpty().take(80),
                )
            }
        }
    }

    suspend fun mobileRefresh(
        serverUrl: String,
        refreshToken: String,
    ): ApiResult<MobileRefreshResponse> = withContext(Dispatchers.IO) {
        val body = JSONObject().put("refreshToken", refreshToken)
        when (
            val result = request("POST", serverUrl, "/api/mobile/auth/refresh", null, body)
        ) {
            is RawResult.Failure -> result.toMobileFailure()
            is RawResult.Success -> parse(result.body) { data ->
                MobileRefreshResponse(
                    accessToken = data.requireMobileToken("accessToken", "bc_mob_"),
                    refreshToken = data.requireMobileToken("refreshToken", "bc_ref_"),
                    accessExpiresAt = data.requireMillis("accessExpiresAt"),
                    refreshExpiresAt = data.requireMillis("refreshExpiresAt"),
                )
            }
        }
    }

    suspend fun mobileDevices(
        serverUrl: String,
        accessToken: String,
    ): ApiResult<LinkedDeviceList> = withContext(Dispatchers.IO) {
        when (
            val result = request("GET", serverUrl, "/api/mobile/devices", accessToken, null)
        ) {
            is RawResult.Failure -> result.toMobileFailure()
            is RawResult.Success -> parse(result.body) { data ->
                val devices = mutableListOf<LinkedDevice>()
                val array = data.optJSONArray("devices")
                if (array != null) {
                    for (index in 0 until minOf(array.length(), MAX_LINKED_DEVICES)) {
                        val item = array.optJSONObject(index) ?: continue
                        item.toLinkedDevice()?.let(devices::add)
                    }
                }
                LinkedDeviceList(
                    currentDeviceId = data.optString("currentDeviceId"),
                    serverTime = parseMillis(data.optString("serverTime")),
                    devices = devices,
                )
            }
        }
    }

    suspend fun mobileLocation(
        serverUrl: String,
        accessToken: String,
        deviceId: String,
    ): ApiResult<LinkedDeviceLocation?> = withContext(Dispatchers.IO) {
        val path = "/api/mobile/devices/${Uri.encode(deviceId)}/location"
        when (val result = request("GET", serverUrl, path, accessToken, null)) {
            is RawResult.Failure -> result.toMobileFailure()
            is RawResult.Success -> parse(result.body) { data ->
                data.optJSONObject("location")?.toLinkedLocation()
            }
        }
    }

    suspend fun mobileLogout(
        serverUrl: String,
        accessToken: String,
        refreshToken: String,
    ): ApiResult<Unit> = withContext(Dispatchers.IO) {
        val body = JSONObject().put("refreshToken", refreshToken)
        when (
            val result = request("POST", serverUrl, "/api/mobile/auth/logout", accessToken, body)
        ) {
            is RawResult.Failure -> result.toMobileFailure()
            is RawResult.Success -> parse(result.body) { Unit }
        }
    }

    suspend fun mobileResetMfa(
        serverUrl: String,
        accessToken: String,
        password: String,
    ): ApiResult<String> = withContext(Dispatchers.IO) {
        val body = JSONObject().apply {
            put("password", password)
            put("confirm", "RESET")
        }
        when (
            val result = request(
                "POST",
                serverUrl,
                "/api/mobile/recovery/mfa-reset",
                accessToken,
                body,
            )
        ) {
            is RawResult.Failure -> result.toMobileFailure()
            is RawResult.Success -> parse(result.body) { data ->
                data.optString("message").ifBlank {
                    "Two-factor authentication was reset. Sign in on the web with your password to enroll a new authenticator."
                }
            }
        }
    }

    suspend fun sync(
        serverUrl: String,
        token: String,
        points: List<JSONObject>,
    ): ApiResult<SyncResponse> = withContext(Dispatchers.IO) {        val array = JSONArray()
        points.forEach(array::put)
        val body = JSONObject().put("points", array)
        when (val result = request("POST", serverUrl, "/api/device/locations", token, body)) {
            is RawResult.Failure -> result.toApiFailure()
            is RawResult.Success -> parse(result.body) { data ->
                SyncResponse(
                    accepted = data.optInt("accepted"),
                    duplicates = data.optInt("duplicates"),
                    skipped = data.optInt("skipped"),
                    commands = data.optJSONArray("commands").toCommands(),
                    config = data.getJSONObject("config").toConfig(),
                )
            }
        }
    }

    suspend fun heartbeat(
        serverUrl: String,
        token: String,
        batteryLevel: Int?,
        isCharging: Boolean?,
        networkType: String?,
        simState: String?,
        appVersion: String,
        androidVersion: String,
    ): ApiResult<HeartbeatResponse> = withContext(Dispatchers.IO) {
        val body = JSONObject().apply {
            batteryLevel?.let { put("batteryLevel", it) }
            isCharging?.let { put("isCharging", it) }
            networkType?.let { put("networkType", it) }
            simState?.let { put("simState", it) }
            put("appVersion", appVersion)
            put("androidVersion", androidVersion)
        }
        when (val result = request("POST", serverUrl, "/api/device/heartbeat", token, body)) {
            is RawResult.Failure -> result.toApiFailure()
            is RawResult.Success -> parse(result.body) { data ->
                HeartbeatResponse(
                    commands = data.optJSONArray("commands").toCommands(),
                    config = data.getJSONObject("config").toConfig(),
                )
            }
        }
    }

    suspend fun fetchCommands(
        serverUrl: String,
        token: String,
    ): ApiResult<HeartbeatResponse> = withContext(Dispatchers.IO) {
        when (val result = request("GET", serverUrl, "/api/device/commands", token, null)) {
            is RawResult.Failure -> result.toApiFailure()
            is RawResult.Success -> parse(result.body) { data ->
                HeartbeatResponse(
                    commands = data.optJSONArray("commands").toCommands(),
                    config = data.getJSONObject("config").toConfig(),
                )
            }
        }
    }

    suspend fun acknowledge(
        serverUrl: String,
        token: String,
        commandId: String,
        status: String,
        result: JSONObject?,
    ): ApiResult<Unit> = withContext(Dispatchers.IO) {
        val body = JSONObject().apply {
            put("commandId", commandId)
            put("status", status)
            result?.let { put("result", it) }
        }
        when (val response = request("POST", serverUrl, "/api/device/commands/ack", token, body)) {
            is RawResult.Failure -> response.toApiFailure()
            is RawResult.Success -> parse(response.body) { Unit }
        }
    }

    suspend fun uploadPhoto(
        serverUrl: String,
        token: String,
        commandId: String,
        capturedAt: Long,
        base64: String,
        width: Int,
        height: Int,
    ): ApiResult<PhotoUploadResponse> = withContext(Dispatchers.IO) {
        val body = JSONObject().apply {
            put("commandId", commandId)
            put("capturedAt", Instant.ofEpochMilli(capturedAt).toString())
            put("mimeType", "image/jpeg")
            put("dataBase64", base64)
            put("width", width)
            put("height", height)
        }
        when (val result = request("POST", serverUrl, "/api/device/photos", token, body)) {
            is RawResult.Failure -> result.toApiFailure()
            is RawResult.Success -> parse(result.body) { data ->
                PhotoUploadResponse(photoId = data.getString("photoId"))
            }
        }
    }

    suspend fun unpair(
        serverUrl: String,
        token: String,
    ): ApiResult<Unit> = withContext(Dispatchers.IO) {
        when (val result = request("POST", serverUrl, "/api/device/unpair", token, JSONObject())) {
            is RawResult.Failure -> result.toApiFailure()
            is RawResult.Success -> ApiResult.Success(Unit)
        }
    }

    suspend fun createGeofence(
        serverUrl: String,
        token: String,
        name: String,
        latitude: Double,
        longitude: Double,
        radiusM: Int,
    ): ApiResult<GeofenceInfo> = withContext(Dispatchers.IO) {
        val body = JSONObject().apply {
            put("name", name)
            put("centerLat", latitude)
            put("centerLon", longitude)
            put("radiusM", radiusM)
            put("notifyOnEnter", true)
            put("notifyOnExit", true)
        }
        when (val result = request("POST", serverUrl, "/api/device/geofences", token, body)) {
            is RawResult.Failure -> result.toApiFailure()
            is RawResult.Success -> parse(result.body) { data ->
                data.getJSONObject("geofence").toGeofence()
            }
        }
    }

    suspend fun deleteGeofence(
        serverUrl: String,
        token: String,
        geofenceId: String,
    ): ApiResult<Unit> = withContext(Dispatchers.IO) {
        val path = "/api/device/geofences?id=${Uri.encode(geofenceId)}"
        when (val result = request("DELETE", serverUrl, path, token, null)) {
            is RawResult.Failure -> result.toApiFailure()
            is RawResult.Success -> parse(result.body) { Unit }
        }
    }

    private fun request(
        method: String,
        serverUrl: String,
        path: String,
        token: String?,
        body: JSONObject?,
    ): RawResult {
        val base = normalizeServerUrl(serverUrl)
            ?: return RawResult.Failure(
                kind = FailureKind.INVALID,
                message = "The server address must be a valid HTTPS URL.",
            )

        var connection: HttpURLConnection? = null
        return try {
            connection = URL(base + path).openConnection() as HttpURLConnection
            connection.instanceFollowRedirects = false
            connection.useCaches = false
            connection.connectTimeout = CONNECT_TIMEOUT_MS
            connection.readTimeout = READ_TIMEOUT_MS
            connection.requestMethod = method
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("User-Agent", "Beacon-Android/${BuildConfig.VERSION_NAME}")
            if (token != null) {
                connection.setRequestProperty("Authorization", "Bearer $token")
            }
            if (body != null) {
                val bytes = body.toString().toByteArray(Charsets.UTF_8)
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                connection.setFixedLengthStreamingMode(bytes.size)
                connection.outputStream.use { it.write(bytes) }
            }

            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { reader ->
                readLimited(reader, MAX_RESPONSE_CHARS)
            }.orEmpty()
            val retryAfter = connection.getHeaderField("Retry-After")?.toLongOrNull()
            if (status in 200..299) {
                RawResult.Success(status, text, retryAfter)
            } else {
                val message = try {
                    JSONObject(text)
                        .optJSONObject("error")
                        ?.optString("message")
                        .orEmpty()
                } catch (_: Exception) {
                    ""
                }
                RawResult.Failure(
                    kind = FailureKind.HTTP,
                    message = message.ifBlank { "The server rejected the request." },
                    status = status,
                    retryAfterSec = retryAfter,
                )
            }
        } catch (error: IOException) {
            RawResult.Failure(
                kind = FailureKind.NETWORK,
                message = "Could not reach the Beacon server.",
            )
        } catch (error: Exception) {
            RawResult.Failure(
                kind = FailureKind.INVALID,
                message = "The server address could not be used.",
            )
        } finally {
            connection?.disconnect()
        }
    }

    private fun readLimited(reader: java.io.Reader, limit: Int): String {
        val builder = StringBuilder()
        val buffer = CharArray(4096)
        while (builder.length < limit) {
            val read = reader.read(buffer, 0, minOf(buffer.size, limit - builder.length))
            if (read <= 0) break
            builder.append(buffer, 0, read)
        }
        return builder.toString()
    }

    private fun <T> parse(body: String, block: (JSONObject) -> T): ApiResult<T> = try {
        val envelope = JSONObject(body)
        if (!envelope.optBoolean("ok")) {
            val error = envelope.optJSONObject("error")
            ApiResult.Failure(
                kind = FailureKind.HTTP,
                message = error?.optString("message").orEmpty()
                    .ifBlank { "The server rejected the request." },
            )
        } else {
            ApiResult.Success(block(envelope.getJSONObject("data")))
        }
    } catch (_: JSONException) {
        ApiResult.Failure(
            kind = FailureKind.INVALID,
            message = "The server returned an unexpected response.",
        )
    } catch (_: Exception) {
        ApiResult.Failure(
            kind = FailureKind.INVALID,
            message = "The server returned an unexpected response.",
        )
    }

    private fun RawResult.Failure.toMobileFailure(): ApiResult.Failure = when {
        kind == FailureKind.NETWORK -> ApiResult.Failure(kind, message)
        status == 401 -> ApiResult.Failure(
            FailureKind.UNAUTHORIZED,
            message.ifBlank { "This linked session is no longer valid. Link this phone again." },
            401,
        )
        status == 429 -> ApiResult.Failure(
            FailureKind.RATE_LIMITED,
            "The server is rate limiting this request. Try again shortly.",
            status,
            retryAfterSec,
        )
        status != null && status >= 500 -> ApiResult.Failure(
            FailureKind.HTTP,
            "The Beacon server is having trouble. Try again shortly.",
            status,
        )
        else -> ApiResult.Failure(kind, message, status)
    }

    private fun RawResult.Failure.toApiFailure(): ApiResult.Failure = when {
        kind == FailureKind.NETWORK -> ApiResult.Failure(kind, message)
        status == 401 -> ApiResult.Failure(
            FailureKind.UNAUTHORIZED,
            "This device is no longer authorised. Pair it again.",
            status,
        )
        status == 429 -> ApiResult.Failure(
            FailureKind.RATE_LIMITED,
            "The server is rate limiting this device. It will retry shortly.",
            status,
            retryAfterSec,
        )
        status != null && status >= 500 -> ApiResult.Failure(
            FailureKind.HTTP,
            "The Beacon server is having trouble. It will retry.",
            status,
        )
        else -> ApiResult.Failure(kind, message, status)
    }

    private fun JSONObject.requireMobileToken(name: String, prefix: String): String {
        val value = optString(name)
        if (!value.startsWith(prefix) || value.length > 200) {
            throw JSONException("Invalid mobile token")
        }
        return value
    }

    private fun JSONObject.requireMillis(name: String): Long {
        val millis = parseMillis(optString(name))
        if (millis <= 0) throw JSONException("Invalid timestamp")
        return millis
    }

    private fun parseMillis(value: String?): Long {
        if (value.isNullOrBlank()) return 0L
        return try {
            Instant.parse(value).toEpochMilli()
        } catch (_: Exception) {
            0L
        }
    }

    private fun JSONObject.toLinkedDevice(): LinkedDevice? {
        val id = optString("id")
        if (id.isBlank() || id.length > 64) return null
        val name = optString("name").trim().ifBlank { "Android device" }.take(80)
        val model = optString("model").trim().take(60)
        val status = if (optString("status") == "lost") "lost" else "active"
        val presence = when (optString("presence")) {
            "online", "stale" -> optString("presence")
            else -> "offline"
        }
        val battery = optInt("batteryLevel", -1)
        val charging = if (isNull("isCharging")) null else optBoolean("isCharging")
        val lastSeen = parseMillis(optString("lastSeenAt")).takeIf { it > 0 }
        return LinkedDevice(
            id = id,
            name = name,
            model = model,
            status = status,
            presence = presence,
            batteryLevel = battery.takeIf { it in 0..100 },
            isCharging = charging,
            lastSeenAt = lastSeen,
            lastLocation = optJSONObject("lastLocation")?.toLinkedLocation(),
        )
    }

    private fun JSONObject.toLinkedLocation(): LinkedDeviceLocation? {
        val latitude = optDouble("latitude", Double.NaN)
        val longitude = optDouble("longitude", Double.NaN)
        val accuracy = optDouble("accuracyM", Double.NaN)
        val recordedAt = parseMillis(optString("recordedAt"))
        if (!latitude.isFinite() || !longitude.isFinite()) return null
        if (latitude !in -90.0..90.0 || longitude !in -180.0..180.0) return null
        if (!accuracy.isFinite() || accuracy !in 0.0..100_000.0) return null
        if (recordedAt <= 0) return null
        return LinkedDeviceLocation(
            latitude = latitude,
            longitude = longitude,
            accuracyM = accuracy,
            recordedAt = recordedAt,
            provider = optString("provider").take(40),
            isMocked = optBoolean("isMocked", false),
        )
    }

    private fun JSONObject.toConfig(): DeviceConfig {
        val profile = optString("trackingProfile", "balanced")
        val sms = if (isNull("fallbackSmsNumber")) {
            null
        } else {
            optString("fallbackSmsNumber").takeIf { it.isNotBlank() }
        }
        return DeviceConfig(
            trackingProfile = when (profile) {
                "low", "high" -> profile
                else -> "balanced"
            },
            lostMode = optBoolean("lostMode", false),
            offlineAlertMinutes = optInt("offlineAlertMinutes", 45).coerceIn(10, 10_080),
            fallbackSmsNumber = sms?.takeIf { it.matches(Regex("^\\+[1-9]\\d{6,14}$")) },
            geofences = optJSONArray("geofences").toGeofences(),
        )
    }

    private fun JSONArray?.toGeofences(): List<GeofenceInfo> {
        if (this == null) return emptyList()
        val fences = mutableListOf<GeofenceInfo>()
        for (index in 0 until minOf(length(), 20)) {
            val item = optJSONObject(index) ?: continue
            val fence = try {
                item.toGeofence()
            } catch (_: Exception) {
                continue
            }
            fences += fence
        }
        return fences
    }

    private fun JSONObject.toGeofence(): GeofenceInfo {
        val id = optString("id")
        val name = optString("name").trim()
        val lat = optDouble("centerLat", Double.NaN)
        val lon = optDouble("centerLon", Double.NaN)
        val radius = optInt("radiusM", 0)
        if (id.isBlank() || name.isBlank() || !lat.isFinite() || !lon.isFinite()) {
            throw JSONException("Invalid geofence")
        }
        if (lat !in -90.0..90.0 || lon !in -180.0..180.0) {
            throw JSONException("Invalid geofence")
        }
        if (radius !in 50..50_000) throw JSONException("Invalid geofence")
        return GeofenceInfo(id, name.take(60), lat, lon, radius)
    }

    private fun JSONArray?.toCommands(): List<DeviceCommand> {
        if (this == null) return emptyList()
        val commands = mutableListOf<DeviceCommand>()
        for (index in 0 until length()) {
            val item = optJSONObject(index) ?: continue
            val id = item.optString("id")
            val type = item.optString("type")
            if (id.isBlank() || type.isBlank()) continue
            commands += DeviceCommand(
                id = id,
                type = type,
                payload = item.optJSONObject("payload") ?: JSONObject(),
                expiresAt = item.optString("expiresAt"),
            )
        }
        return commands
    }

    private sealed interface RawResult {
        data class Success(
            val status: Int,
            val body: String,
            val retryAfterSec: Long?,
        ) : RawResult

        data class Failure(
            val kind: FailureKind,
            val message: String,
            val status: Int? = null,
            val retryAfterSec: Long? = null,
        ) : RawResult
    }

    companion object {
        private const val CONNECT_TIMEOUT_MS = 15_000
        private const val READ_TIMEOUT_MS = 25_000
        private const val MAX_RESPONSE_CHARS = 1_000_000
        private const val MAX_LINKED_DEVICES = 50

        fun normalizeServerUrl(value: String): String? {
            val trimmed = value.trim().trimEnd('/')
            if (trimmed.isEmpty()) return null
            val uri = try {
                Uri.parse(trimmed)
            } catch (_: Exception) {
                return null
            }
            if (!uri.scheme.equals("https", ignoreCase = true)) return null
            if (uri.host.isNullOrBlank()) return null
            if (!uri.userInfo.isNullOrBlank()) return null
            if (!uri.query.isNullOrBlank() || !uri.fragment.isNullOrBlank()) return null
            return trimmed
        }
    }
}
