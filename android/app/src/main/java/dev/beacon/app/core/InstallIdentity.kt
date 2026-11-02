package dev.beacon.app.core

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import java.security.MessageDigest

/**
 * A stable, one-way fingerprint for this app install on this physical phone.
 *
 * ANDROID_ID is scoped to the app's signing key, the Android user and the
 * device on Android 8+, so it survives an uninstall/reinstall but is not shared
 * with other apps. Adding the signing certificate and package name keeps debug
 * and release builds distinct. The server only ever sees the SHA-256 result; no
 * raw identifier leaves the phone.
 */
object InstallIdentity {
    fun hash(context: Context): String? {
        val androidId = Settings.Secure
            .getString(context.contentResolver, Settings.Secure.ANDROID_ID)
            ?.trim()
            ?.takeIf { it.length in 8..64 }
            ?: return null
        val signingCert = signingCertificateSha256(context) ?: return null
        val material = buildString {
            append("beacon-install:v1:")
            append(context.packageName)
            append(':')
            append(signingCert)
            append(':')
            append(androidId)
        }
        return sha256Hex(material.toByteArray(Charsets.UTF_8))
    }

    @Suppress("DEPRECATION")
    private fun signingCertificateSha256(context: Context): String? {
        val manager = context.packageManager
        val signature = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            manager
                .getPackageInfo(
                    context.packageName,
                    PackageManager.GET_SIGNING_CERTIFICATES,
                )
                .signingInfo
                ?.apkContentsSigners
                ?.firstOrNull()
        } else {
            manager
                .getPackageInfo(context.packageName, PackageManager.GET_SIGNATURES)
                .signatures
                ?.firstOrNull()
        }
        return signature?.let { sha256Hex(it.toByteArray()) }
    }

    private fun sha256Hex(bytes: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
        return digest.joinToString("") { byte -> "%02x".format(byte) }
    }
}
