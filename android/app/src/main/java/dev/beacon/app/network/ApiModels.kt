package dev.beacon.app.network

import dev.beacon.app.core.GeofenceInfo
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
    val geofences: List<GeofenceInfo>,
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

data class MobileExchangeResponse(
    val accessToken: String,
    val refreshToken: String,
    val accessExpiresAt: Long,
    val refreshExpiresAt: Long,
    val sessionCreatedAt: Long,
    val accountName: String,
    val accountEmailMasked: String,
    val deviceId: String,
    val deviceName: String,
)

data class MobileRefreshResponse(
    val accessToken: String,
    val refreshToken: String,
    val accessExpiresAt: Long,
    val refreshExpiresAt: Long,
)

data class LinkedDeviceLocation(
    val latitude: Double,
    val longitude: Double,
    val accuracyM: Double,
    val recordedAt: Long,
    val provider: String,
    val isMocked: Boolean,
)

data class LinkedDevice(
    val id: String,
    val name: String,
    val model: String,
    val status: String,
    val presence: String,
    val batteryLevel: Int?,
    val isCharging: Boolean?,
    val lastSeenAt: Long?,
    val lastLocation: LinkedDeviceLocation?,
)

data class LinkedDeviceList(
    val currentDeviceId: String,
    val serverTime: Long,
    val devices: List<LinkedDevice>,
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
