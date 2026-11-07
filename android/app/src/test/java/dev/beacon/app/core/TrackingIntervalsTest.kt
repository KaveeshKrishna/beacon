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

    @Test
    fun insideOverrideWinsOnlyWhileInside() {
        assertEquals(
            7,
            TrackingIntervals.effective(0, "balanced", true, true, 0, 7),
        )
        // Outside, the outside profile applies, not the inside override.
        assertEquals(
            15,
            TrackingIntervals.effective(0, "balanced", true, false, 0, 7),
        )
        // Without a fence in range the override has nothing to apply to.
        assertEquals(
            30,
            TrackingIntervals.effective(0, "balanced", false, true, 0, 7),
        )
        // A fixed interval ignores both overrides.
        assertEquals(
            240,
            TrackingIntervals.effective(240, "balanced", true, true, 5, 7),
        )
    }

    @Test
    fun bothOverridesApplyInTheirOwnGeofenceState() {
        assertEquals(
            2,
            TrackingIntervals.effective(0, "low", true, true, 60, 2),
        )
        assertEquals(
            1,
            TrackingIntervals.effective(0, "low", true, false, 1, 2),
        )
    }

    @Test
    fun automaticInsideHelperHonoursOverride() {
        assertEquals(60, TrackingIntervals.automaticInside("balanced"))
        assertEquals(30, TrackingIntervals.automaticInside("high"))
        assertEquals(5, TrackingIntervals.automaticInside("balanced", 5))
        assertEquals(60, TrackingIntervals.automaticInside("balanced", 0))
    }
}
