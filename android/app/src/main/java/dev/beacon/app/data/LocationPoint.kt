package dev.beacon.app.data

import org.json.JSONObject
import java.time.Instant
import java.util.UUID

data class LocationPoint(
    val id: String = UUID.randomUUID().toString(),
    val recordedAt: Long,
    val latitude: Double,
    val longitude: Double,
    val accuracyM: Double,
    val altitudeM: Double?,
    val speedMps: Double?,
    val headingDeg: Double?,
    val batteryLevel: Int?,
    val isCharging: Boolean?,
    val provider: String,
    val networkType: String?,
    val isMocked: Boolean,
    val sequence: Long,
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("id", id)
        put("recordedAt", Instant.ofEpochMilli(recordedAt).toString())
        put("latitude", latitude)
        put("longitude", longitude)
        put("accuracyM", accuracyM)
        altitudeM?.let { put("altitudeM", it) }
        speedMps?.let { put("speedMps", it) }
        headingDeg?.let { put("headingDeg", it) }
        batteryLevel?.let { put("batteryLevel", it) }
        isCharging?.let { put("isCharging", it) }
        put("provider", provider.take(32))
        networkType?.let { put("networkType", it.take(32)) }
        put("isMocked", isMocked)
        put("sequence", sequence)
    }
}
