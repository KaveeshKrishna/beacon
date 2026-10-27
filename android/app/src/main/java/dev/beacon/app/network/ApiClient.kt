package dev.beacon.app.network

import android.net.Uri
import dev.beacon.app.BuildConfig
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

    suspend fun sync(
        serverUrl: String,
        token: String,
        points: List<JSONObject>,
    ): ApiResult<SyncResponse> = withContext(Dispatchers.IO) {
        val array = JSONArray()
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
        )
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
