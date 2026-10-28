package dev.beacon.app.update

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class VersionComparisonTest {
    @Test
    fun newerPatchIsGreater() {
        assertTrue(compareVersions("0.1.2", "0.1.1") > 0)
    }

    @Test
    fun olderPatchIsLess() {
        assertTrue(compareVersions("0.1.0", "0.1.1") < 0)
    }

    @Test
    fun tagPrefixAndMissingSegmentsAreEquivalent() {
        assertEquals(0, compareVersions("v0.1.1", "0.1.1"))
        assertEquals(0, compareVersions("0.1", "0.1.0"))
    }

    @Test
    fun numericNotLexicographic() {
        assertTrue(compareVersions("0.1.10", "0.1.9") > 0)
        assertTrue(compareVersions("1.0.0", "0.99.99") > 0)
    }
}
