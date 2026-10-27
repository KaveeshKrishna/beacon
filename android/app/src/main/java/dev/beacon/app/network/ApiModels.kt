package dev.beacon.app.network

import org.json.JSONObject

data class PairResponse(
    val deviceId: String,
    val token: String,
    val ownerName: String,
    val deviceName: String,
)

data class DeviceConfig(
    val trackingProfile: String,
    val lostMode: Boolean,
    val offlineAlertMinutes: Int,
    val fallbackSmsNumber: String?,
)

data class DeviceCommand(
    val id: String,
    val type: String,
    val payload: JSONObject,
    val expiresAt: String,
)

data class SyncResponse(
    val accepted: Int,
    val duplicates: Int,
    val skipped: Int,
    val commands: List<DeviceCommand>,
    val config: DeviceConfig,
)

data class HeartbeatResponse(
    val commands: List<DeviceCommand>,
    val config: DeviceConfig,
)

data class PhotoUploadResponse(
    val photoId: String,
)

sealed interface ApiResult<out T> {
    data class Success<T>(val value: T) : ApiResult<T>

    data class Failure(
        val kind: FailureKind,
        val message: String,
        val status: Int? = null,
        val retryAfterSec: Long? = null,
    ) : ApiResult<Nothing>
}

enum class FailureKind {
    NETWORK,
    UNAUTHORIZED,
    RATE_LIMITED,
    HTTP,
    INVALID,
}
