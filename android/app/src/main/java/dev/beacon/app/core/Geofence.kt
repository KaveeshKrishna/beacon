package dev.beacon.app.core

import kotlin.math.abs
import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.max
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

    /**
     * Initial great-circle bearing in degrees clockwise from true north.
     * The locate screen rotates this against the phone's compass heading so the
     * arrow points at the destination rather than at magnetic north.
     */
    fun bearingDegrees(
        fromLat: Double,
        fromLon: Double,
        toLat: Double,
        toLon: Double,
    ): Double {
        val fromLatRad = Math.toRadians(fromLat)
        val toLatRad = Math.toRadians(toLat)
        val dLon = Math.toRadians(toLon - fromLon)
        val y = sin(dLon) * cos(toLatRad)
        val x = cos(fromLatRad) * sin(toLatRad) -
            sin(fromLatRad) * cos(toLatRad) * cos(dLon)
        val degrees = Math.toDegrees(atan2(y, x))
        return (degrees + 360.0) % 360.0
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

    /** A point at [distanceM] from the centre along [bearingDegrees]. */
    fun destination(
        latitude: Double,
        longitude: Double,
        bearingDegrees: Double,
        distanceM: Double,
    ): Pair<Double, Double> {
        val angular = distanceM / EARTH_RADIUS_M
        val bearing = Math.toRadians(bearingDegrees)
        val lat1 = Math.toRadians(latitude)
        val lon1 = Math.toRadians(longitude)
        val lat2 = asin(
            sin(lat1) * cos(angular) +
                cos(lat1) * sin(angular) * cos(bearing),
        )
        val lon2 = lon1 + atan2(
            sin(bearing) * sin(angular) * cos(lat1),
            cos(angular) - sin(lat1) * sin(lat2),
        )
        val normalized = (Math.toDegrees(lon2) + 540.0) % 360.0 - 180.0
        return Math.toDegrees(lat2) to normalized
    }

    /**
     * The closed ring used to preview a circular fence on the map. Points are
     * returned as latitude/longitude pairs and the first point is repeated at
     * the end so GeoJSON renders a closed polygon.
     */
    fun circleRing(
        latitude: Double,
        longitude: Double,
        radiusM: Int,
        segments: Int = 72,
    ): List<Pair<Double, Double>> {
        val count = segments.coerceIn(24, 180)
        val ring = ArrayList<Pair<Double, Double>>(count + 1)
        for (index in 0 until count) {
            ring += destination(
                latitude,
                longitude,
                index * 360.0 / count,
                radiusM.toDouble(),
            )
        }
        ring += ring.first()
        return ring
    }
}

/** One confirmed/pending state for the fence the device is currently near. */
data class GeofenceState(
    val insideFenceId: String? = null,
    val pendingInside: Boolean? = null,
    val pendingSince: Long? = null,
    /** Monotonic fix watermark; `null` means no baseline yet. */
    val lastFixAt: Long? = null,
)

enum class GeofenceCrossing { ENTER, EXIT }

enum class GeofenceDecisionReason {
    STALE,
    INACCURATE,
    DEADBAND,
    BASELINE,
    STABLE,
    PENDING,
    CONFIRMED,
    DEEP,
    NO_FENCES,
}

data class GeofenceDecision(
    val state: GeofenceState,
    val crossing: GeofenceCrossing?,
    val reason: GeofenceDecisionReason,
)

/**
 * The same noise rules the server applies, so the phone's idea of being
 * inside a fence cannot disagree with the server that sends alerts:
 *
 * - ignore fixes too inaccurate to resolve the fence edge,
 * - keep a deadband around the radius,
 * - require two consecutive readings for a shallow crossing,
 * - establish a baseline without a crossing on the first confident fix,
 * - reject fixes that are not newer than the last one evaluated.
 */
object GeofenceEvaluator {
    const val CONFIRM_READINGS = 2

    fun accuracyLimitM(radiusM: Int): Double =
        max(40.0, min(500.0, max(1.0, radiusM.toDouble()) * 0.5))

    fun hysteresisMarginM(radiusM: Int, accuracyM: Double): Double {
        val radius = max(1.0, radiusM.toDouble())
        val accuracy = if (accuracyM.isFinite() && accuracyM > 0.0) accuracyM else 2_000.0
        return min(max(accuracy * 0.75, 25.0), radius * 0.35)
    }

    fun evaluate(
        current: GeofenceState,
        fences: List<GeofenceInfo>,
        latitude: Double,
        longitude: Double,
        accuracyM: Double,
        recordedAt: Long,
    ): GeofenceDecision {
        if (recordedAt <= 0L) return unchanged(current, GeofenceDecisionReason.STALE)
        val watermark = current.lastFixAt
        if (watermark != null && recordedAt <= watermark) {
            return unchanged(current, GeofenceDecisionReason.STALE)
        }
        if (fences.isEmpty()) return unchanged(current, GeofenceDecisionReason.NO_FENCES)

        val insideFence = current.insideFenceId?.let { id -> fences.firstOrNull { it.id == id } }
        // While inside, only that fence's exit matters. While outside, watch
        // the boundary that is physically closest, which is the one a person
        // walking or driving is most likely to cross next.
        val target = insideFence ?: fences.minByOrNull { fence ->
            abs(
                GeofenceMath.distanceMeters(
                    latitude,
                    longitude,
                    fence.centerLat,
                    fence.centerLon,
                ) - fence.radiusM,
            )
        } ?: return unchanged(current, GeofenceDecisionReason.NO_FENCES)

        val withWatermark = current.copy(lastFixAt = recordedAt)
        val accuracy = if (accuracyM.isFinite() && accuracyM > 0.0) accuracyM else 2_000.0
        if (accuracy > accuracyLimitM(target.radiusM)) {
            return unchanged(withWatermark, GeofenceDecisionReason.INACCURATE)
        }

        val distance = GeofenceMath.distanceMeters(
            latitude,
            longitude,
            target.centerLat,
            target.centerLon,
        )
        val margin = hysteresisMarginM(target.radiusM, accuracy)
        val candidate: Boolean? = when {
            distance <= target.radiusM - margin -> true
            distance >= target.radiusM + margin -> false
            else -> null
        }

        if (candidate == null) {
            return GeofenceDecision(
                state = withWatermark.copy(pendingInside = null, pendingSince = null),
                crossing = null,
                reason = GeofenceDecisionReason.DEADBAND,
            )
        }

        val fenceMissing = current.insideFenceId != null && insideFence == null
        val hadBaseline = current.lastFixAt != null && !fenceMissing
        val wasInside = insideFence != null
        if (!hadBaseline) {
            return GeofenceDecision(
                state = GeofenceState(
                    insideFenceId = if (candidate) target.id else null,
                    pendingInside = null,
                    pendingSince = null,
                    lastFixAt = recordedAt,
                ),
                crossing = null,
                reason = GeofenceDecisionReason.BASELINE,
            )
        }

        if (candidate == wasInside) {
            return GeofenceDecision(
                state = withWatermark.copy(pendingInside = null, pendingSince = null),
                crossing = null,
                reason = GeofenceDecisionReason.STABLE,
            )
        }

        val deep = (candidate && distance <= target.radiusM - 2 * margin) ||
            (!candidate && distance >= target.radiusM + 2 * margin)

        if (deep) {
            return crossingDecision(
                current = current,
                target = target,
                candidate = candidate,
                recordedAt = recordedAt,
                reason = GeofenceDecisionReason.DEEP,
            )
        }

        if (current.pendingInside == candidate) {
            return crossingDecision(
                current = current,
                target = target,
                candidate = candidate,
                recordedAt = recordedAt,
                reason = GeofenceDecisionReason.CONFIRMED,
            )
        }

        return GeofenceDecision(
            state = withWatermark.copy(
                pendingInside = candidate,
                pendingSince = recordedAt,
            ),
            crossing = null,
            reason = GeofenceDecisionReason.PENDING,
        )
    }

    private fun crossingDecision(
        current: GeofenceState,
        target: GeofenceInfo,
        candidate: Boolean,
        recordedAt: Long,
        reason: GeofenceDecisionReason,
    ): GeofenceDecision = GeofenceDecision(
        state = GeofenceState(
            insideFenceId = if (candidate) target.id else null,
            pendingInside = null,
            pendingSince = null,
            lastFixAt = recordedAt,
        ),
        crossing = when {
            candidate && current.insideFenceId != target.id -> GeofenceCrossing.ENTER
            !candidate && current.insideFenceId != null -> GeofenceCrossing.EXIT
            else -> null
        },
        reason = reason,
    )

    private fun unchanged(
        state: GeofenceState,
        reason: GeofenceDecisionReason,
    ): GeofenceDecision = GeofenceDecision(state, null, reason)
}
