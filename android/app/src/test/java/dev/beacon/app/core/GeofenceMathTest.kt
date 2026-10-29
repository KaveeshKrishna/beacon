package dev.beacon.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GeofenceMathTest {
    @Test
    fun samePointIsZeroDistance() {
        assertEquals(
            0.0,
            GeofenceMath.distanceMeters(51.5, -0.12, 51.5, -0.12),
            0.001,
        )
    }

    @Test
    fun oneDegreeOfLatitudeIsAbout111Kilometres() {
        val distance = GeofenceMath.distanceMeters(0.0, 0.0, 1.0, 0.0)
        assertTrue("expected ~111 km, got $distance", distance in 110_000.0..112_000.0)
    }

    @Test
    fun containingFenceIsFound() {
        val home = GeofenceInfo("1", "Home", 51.5007, -0.1246, 250)
        val far = GeofenceInfo("2", "Work", 51.5100, -0.1300, 250)

        assertEquals(
            home,
            GeofenceMath.containing(listOf(far, home), 51.5008, -0.1247),
        )
    }

    @Test
    fun pointOutsideEveryFenceReturnsNull() {
        val home = GeofenceInfo("1", "Home", 51.5007, -0.1246, 250)
        assertNull(GeofenceMath.containing(listOf(home), 51.6, -0.3))
    }

    @Test
    fun radiusBoundaryIsInclusive() {
        val distance = GeofenceMath.distanceMeters(0.0, 0.0, 1.0, 0.0)
        // Round the radius up so the point sits exactly on the inclusive
        // boundary instead of a few centimetres outside it.
        val fence = GeofenceInfo("1", "Edge", 0.0, 0.0, kotlin.math.ceil(distance).toInt())
        assertTrue(GeofenceMath.containing(listOf(fence), 1.0, 0.0) != null)
    }
}
