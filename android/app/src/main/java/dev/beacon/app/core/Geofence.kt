package dev.beacon.app.core

import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

data class GeofenceInfo(
    val id: String,
    val name: String,
    val centerLat: Double,
    val centerLon: Double,
    val radiusM: Int,
)

/**
 * Local, offline copy of the fences that the server already knows about.
 * Keeping the geometry on the phone lets the app decide its next check-in
 * interval without another network round trip.
 */
object GeofenceMath {
    private const val EARTH_RADIUS_M = 6_371_008.8

    fun distanceMeters(
        fromLat: Double,
        fromLon: Double,
        toLat: Double,
        toLon: Double,
    ): Double {
        val dLat = Math.toRadians(toLat - fromLat)
        val dLon = Math.toRadians(toLon - fromLon)
        val a = sin(dLat / 2).pow(2) +
            cos(Math.toRadians(fromLat)) *
            cos(Math.toRadians(toLat)) *
            sin(dLon / 2).pow(2)
        return 2 * EARTH_RADIUS_M * asin(min(1.0, sqrt(a)))
    }

    fun containing(
        fences: List<GeofenceInfo>,
        latitude: Double,
        longitude: Double,
    ): GeofenceInfo? = fences.firstOrNull { fence ->
        distanceMeters(
            latitude,
            longitude,
            fence.centerLat,
            fence.centerLon,
        ) <= fence.radiusM
    }
}
