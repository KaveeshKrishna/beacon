package dev.beacon.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GeofenceEvaluatorTest {
    private val home = GeofenceInfo("home", "Home", 0.0, 0.0, 250)
    private val baseTime = 1_700_000_000_000L

    private fun latitudeAt(distanceM: Double): Double = distanceM / 111_194.93

    private fun observe(
        state: GeofenceState,
        distanceM: Double,
        accuracyM: Double = 40.0,
        minute: Long = 0,
        fences: List<GeofenceInfo> = listOf(home),
    ): GeofenceDecision = GeofenceEvaluator.evaluate(
        current = state,
        fences = fences,
        latitude = latitudeAt(distanceM),
        longitude = 0.0,
        accuracyM = accuracyM,
        recordedAt = baseTime + minute * 60_000L,
    )

    @Test
    fun firstConfidentFixEstablishesBaselineWithoutCrossing() {
        val decision = observe(GeofenceState(), 100.0)
        assertEquals(GeofenceDecisionReason.BASELINE, decision.reason)
        assertNull(decision.crossing)
        assertEquals("home", decision.state.insideFenceId)
        assertEquals(baseTime, decision.state.lastFixAt)
    }

    @Test
    fun jitterAcrossRawRadiusDoesNotCross() {
        var state = observe(GeofenceState(), 100.0).state
        for (minute in 1L..8L) {
            val distance = if (minute % 2L == 0L) 240.0 else 260.0
            val decision = observe(state, distance, minute = minute)
            assertNull(decision.crossing)
            state = decision.state
        }
        assertEquals("home", state.insideFenceId)
        assertNull(state.pendingInside)
    }

    @Test
    fun shallowExitNeedsTwoConsecutiveReadings() {
        var state = observe(GeofenceState(), 100.0).state
        val first = observe(state, 300.0, minute = 1)
        assertEquals(GeofenceDecisionReason.PENDING, first.reason)
        assertNull(first.crossing)
        assertEquals("home", first.state.insideFenceId)
        assertEquals(false, first.state.pendingInside)
        state = first.state

        val second = observe(state, 300.0, minute = 2)
        assertEquals(GeofenceDecisionReason.CONFIRMED, second.reason)
        assertEquals(GeofenceCrossing.EXIT, second.crossing)
        assertNull(second.state.insideFenceId)
    }

    @Test
    fun deepExitConfirmsImmediately() {
        val state = observe(GeofenceState(), 100.0).state
        val decision = observe(state, 350.0, minute = 1)
        assertEquals(GeofenceDecisionReason.DEEP, decision.reason)
        assertEquals(GeofenceCrossing.EXIT, decision.crossing)
        assertNull(decision.state.insideFenceId)
    }

    @Test
    fun shallowEntryIsConfirmedByASecondReading() {
        var state = observe(GeofenceState(), 500.0).state
        assertNull(state.insideFenceId)

        val first = observe(state, 200.0, minute = 1)
        assertEquals(GeofenceDecisionReason.PENDING, first.reason)
        assertNull(first.crossing)
        assertEquals(true, first.state.pendingInside)
        state = first.state

        val second = observe(state, 200.0, minute = 2)
        assertEquals(GeofenceCrossing.ENTER, second.crossing)
        assertEquals("home", second.state.insideFenceId)
    }

    @Test
    fun deadbandDropsAPendingCrossing() {
        var state = observe(GeofenceState(), 100.0).state
        state = observe(state, 300.0, minute = 1).state
        assertEquals(false, state.pendingInside)

        val deadband = observe(state, 260.0, minute = 2)
        assertEquals(GeofenceDecisionReason.DEADBAND, deadband.reason)
        assertNull(deadband.crossing)
        assertEquals("home", deadband.state.insideFenceId)
        assertNull(deadband.state.pendingInside)
    }

    @Test
    fun inaccurateFixIsIgnoredButAdvancesWatermark() {
        val state = observe(GeofenceState(), 100.0).state
        val decision = observe(state, 4_000.0, accuracyM = 900.0, minute = 1)
        assertEquals(GeofenceDecisionReason.INACCURATE, decision.reason)
        assertNull(decision.crossing)
        assertEquals("home", decision.state.insideFenceId)
        assertEquals(baseTime + 60_000L, decision.state.lastFixAt)
    }

    @Test
    fun outOfOrderFixIsIgnored() {
        val state = observe(GeofenceState(), 500.0, minute = 5).state
        val late = observe(state, 100.0, minute = 3)
        assertEquals(GeofenceDecisionReason.STALE, late.reason)
        assertNull(late.crossing)
        assertEquals(state, late.state)
    }

    @Test
    fun retriedFixIsIdempotent() {
        var state = observe(GeofenceState(), 100.0).state
        val first = observe(state, 300.0, minute = 1)
        state = first.state
        val retry = observe(state, 300.0, minute = 1)
        assertEquals(GeofenceDecisionReason.STALE, retry.reason)
        assertEquals(state, retry.state)

        val confirm = observe(state, 300.0, minute = 2)
        assertEquals(GeofenceCrossing.EXIT, confirm.crossing)
        val replay = observe(confirm.state, 300.0, minute = 2)
        assertEquals(GeofenceDecisionReason.STALE, replay.reason)
        assertEquals(confirm.state, replay.state)
    }

    @Test
    fun accuracyLimitsAndMarginsMatchTheServerRules() {
        assertEquals(125.0, GeofenceEvaluator.accuracyLimitM(250), 0.001)
        assertEquals(30.0, GeofenceEvaluator.hysteresisMarginM(250, 40.0), 0.001)
        assertEquals(25.0, GeofenceEvaluator.hysteresisMarginM(250, 8.0), 0.001)
        assertTrue(GeofenceEvaluator.CONFIRM_READINGS == 2)
    }

    @Test
    fun vanishedFenceRequiresAFreshBaseline() {
        val state = observe(GeofenceState(), 100.0).state
        val work = GeofenceInfo("work", "Work", 0.0, 0.0, 250)
        val decision = observe(
            state = state,
            distanceM = 100.0,
            minute = 1,
            fences = listOf(work),
        )
        // The cached state pointed at geometry that no longer exists; treat
        // the next fix as a baseline instead of reporting an immediate exit.
        assertEquals(GeofenceDecisionReason.BASELINE, decision.reason)
        assertNull(decision.crossing)
        assertEquals("work", decision.state.insideFenceId)
    }
}
