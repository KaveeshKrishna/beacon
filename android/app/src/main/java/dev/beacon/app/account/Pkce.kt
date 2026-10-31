package dev.beacon.app.account

import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

/**
 * PKCE S256 (RFC 7636). The verifier is generated on the phone and never
 * enters the browser. The browser only carries the SHA-256 challenge, so a
 * different app that captures the custom-scheme callback still cannot turn the
 * one-time code into tokens.
 */
object Pkce {
    private val random = SecureRandom()
    private val encoder: Base64.Encoder = Base64.getUrlEncoder().withoutPadding()

    fun verifier(): String {
        val bytes = ByteArray(48)
        random.nextBytes(bytes)
        return encoder.encodeToString(bytes)
    }

    fun state(): String {
        val bytes = ByteArray(32)
        random.nextBytes(bytes)
        return encoder.encodeToString(bytes)
    }

    fun challenge(verifier: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
            .digest(verifier.toByteArray(Charsets.US_ASCII))
        return encoder.encodeToString(digest)
    }
}
