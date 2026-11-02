package dev.beacon.app.core

import org.junit.Assert.assertEquals
import org.junit.Test

class TrackingIntervalsTest {
    @Test
    fun fixedIntervalIsObeyedExactly() {
        assertEquals(
            7,
            TrackingIntervals.effective(
                chosenMinutes = 7,
                profile = "high",
                hasFences = true,
                inside = true,
                outsideOverride = 5,
            ),
        )
        assertEquals(
            240,
            TrackingIntervals.effective(
                chosenMinutes = 240,
                profile = "low",
                hasFences = true,
                inside = false,
                outsideOverride = 1,
            ),
        )
    }

    @Test
    fun automaticUsesProfileWithoutFences() {
        assertEquals(
            60,
            TrackingIntervals.effective(0, "low", false, false, 0),
        )
        assertEquals(
            30,
            TrackingIntervals.effective(0, "balanced", false, false, 0),
        )
        assertEquals(
            15,
            TrackingIntervals.effective(0, "high", false, false, 0),
        )
    }

    @Test
    fun automaticRelaxesInsideAndSpeedsUpOutside() {
        assertEquals(
            60,
            TrackingIntervals.effective(0, "balanced", true, true, 0),
        )
        assertEquals(
            30,
            TrackingIntervals.effective(0, "high", true, true, 0),
        )
        assertEquals(
            15,
            TrackingIntervals.effective(0, "balanced", true, false, 0),
        )
        assertEquals(
            30,
            TrackingIntervals.effective(0, "low", true, false, 0),
        )
    }

    @Test
    fun outsideOverrideWinsOnlyWhileOutside() {
        assertEquals(
            5,
            TrackingIntervals.effective(0, "balanced", true, false, 5),
        )
        assertEquals(
            60,
            TrackingIntervals.effective(0, "balanced", true, true, 5),
        )
        assertEquals(
            30,
            TrackingIntervals.effective(0, "balanced", false, false, 5),
        )
    }

    @Test
    fun zeroOverrideFollowsTheProfile() {
        assertEquals(
            TrackingIntervals.automaticOutside("high", 0),
            TrackingIntervals.effective(0, "high", true, false, 0),
        )
    }
}
