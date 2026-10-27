package dev.beacon.app.core

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.nio.ByteBuffer
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Small AES-256-GCM helper backed by the Android Keystore. The key never
 * leaves the secure element / TEE, and every value gets a fresh 96-bit IV.
 *
 * Ciphertext format: Base64(iv || ciphertext || tag)
 */
object KeystoreCrypto {
    private const val KEY_ALIAS = "dev.beacon.app.local.v1"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val IV_BYTES = 12
    private const val TAG_BITS = 128

    private fun keyStore(): KeyStore =
        KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    @Synchronized
    private fun key(): SecretKey {
        val store = keyStore()
        (store.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry)?.let {
            return it.secretKey
        }
        val generator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            "AndroidKeyStore",
        )
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setUserAuthenticationRequired(false)
                .build(),
        )
        return generator.generateKey()
    }

    fun encrypt(bytes: ByteArray): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val ciphertext = cipher.doFinal(bytes)
        val packed = ByteBuffer
            .allocate(cipher.iv.size + ciphertext.size)
            .put(cipher.iv)
            .put(ciphertext)
            .array()
        return Base64.encodeToString(packed, Base64.NO_WRAP)
    }

    fun decrypt(encoded: String): ByteArray? = try {
        val packed = Base64.decode(encoded, Base64.NO_WRAP)
        if (packed.size <= IV_BYTES) {
            null
        } else {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            val iv = packed.copyOfRange(0, IV_BYTES)
            val ciphertext = packed.copyOfRange(IV_BYTES, packed.size)
            cipher.init(
                Cipher.DECRYPT_MODE,
                key(),
                GCMParameterSpec(TAG_BITS, iv),
            )
            cipher.doFinal(ciphertext)
        }
    } catch (_: Exception) {
        null
    }

    fun encryptString(value: String): String = encrypt(value.toByteArray(Charsets.UTF_8))

    fun decryptString(encoded: String): String? =
        decrypt(encoded)?.toString(Charsets.UTF_8)

    /**
     * Called only after local credentials and queued points are removed. A new
     * key is generated on the next pairing, so stale ciphertext cannot be read.
     */
    fun reset() {
        try {
            keyStore().deleteEntry(KEY_ALIAS)
        } catch (_: Exception) {
            // A missing or unavailable keystore is equivalent to a fresh start.
        }
    }
}
