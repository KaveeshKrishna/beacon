package dev.beacon.app.account

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PkceTest {
    @Test
    fun matchesTheRfc7636Vector() {
        val verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
        assertEquals(
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
            Pkce.challenge(verifier),
        )
    }

    @Test
    fun generatedVerifierIsValidPkce() {
        val verifier = Pkce.verifier()
        assertEquals(64, verifier.length)
        assertTrue(verifier.matches(Regex("^[A-Za-z0-9\\-._~]+$")))
        assertNotEquals(verifier, Pkce.verifier())
    }

    @Test
    fun generatedStateIsUrlSafe() {
        val state = Pkce.state()
        assertEquals(43, state.length)
        assertTrue(state.matches(Regex("^[A-Za-z0-9_-]{43}$")))
        assertNotEquals(state, Pkce.state())
    }

    @Test
    fun challengeIsAlways43UrlSafeCharacters() {
        val challenge = Pkce.challenge(Pkce.verifier())
        assertEquals(43, challenge.length)
        assertTrue(challenge.matches(Regex("^[A-Za-z0-9_-]{43}$")))
    }
}
