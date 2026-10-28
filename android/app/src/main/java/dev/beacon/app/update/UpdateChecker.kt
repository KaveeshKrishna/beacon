package dev.beacon.app.update

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import dev.beacon.app.BuildConfig
import dev.beacon.app.network.ApiClient
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

data class UpdateInfo(
    val versionName: String,
    val apkUrl: String,
    val sha256: String,
    val sizeBytes: Long,
    val notes: String,
)

sealed interface UpdateCheck {
    data object Disabled : UpdateCheck
    data object UpToDate : UpdateCheck
    data class Available(val info: UpdateInfo) : UpdateCheck
}

sealed interface InstallResult {
    data object Started : InstallResult
    data class NeedsPermission(val settingsIntent: Intent) : InstallResult
    data class Failed(val message: String) : InstallResult
}

class UpdateException(message: String) : Exception(message)

/**
 * Downloads the update that the paired Beacon server advertises and hands it
 * to the Android installer.
 *
 * The APK is only accepted when its SHA-256 matches the value served by the
 * server and its signing certificate matches the installed app. That means a
 * compromised download host still cannot install a different app or a build
 * signed with another key. Android always shows its own install confirmation
 * for a sideloaded APK; nothing can skip that without Device Owner or Play.
 */
class UpdateChecker(private val context: Context) {
    suspend fun check(serverUrl: String): UpdateCheck = withContext(Dispatchers.IO) {
        val base = ApiClient.normalizeServerUrl(serverUrl)
            ?: throw UpdateException("The server address is not valid.")
        val connection = try {
            open("$base/api/app/update", "application/json")
        } catch (_: Exception) {
            throw UpdateException("Could not reach the update service.")
        }
        try {
            if (connection.responseCode != HttpURLConnection.HTTP_OK) {
                throw UpdateException("The update service is unavailable.")
            }
            val body = readText(connection.inputStream, MAX_MANIFEST_CHARS)
                ?: throw UpdateException("The update service returned an invalid response.")
            parse(body)
        } catch (error: UpdateException) {
            throw error
        } catch (_: Exception) {
            throw UpdateException("The update service returned an invalid response.")
        } finally {
            connection.disconnect()
        }
    }

    suspend fun download(info: UpdateInfo, onProgress: (Int) -> Unit): File =
        withContext(Dispatchers.IO) {
            val directory = File(context.cacheDir, UPDATE_DIR).apply { mkdirs() }
            directory.listFiles()?.forEach { it.delete() }

            val target = File(directory, "beacon-${info.versionName}.apk")
            val part = File(directory, "beacon-${info.versionName}.apk.part")
            part.delete()
            onProgress(0)

            val connection = try {
                open(info.apkUrl, "application/vnd.android.package-archive")
            } catch (_: Exception) {
                throw UpdateException("Could not reach the download server.")
            }
            try {
                if (connection.responseCode != HttpURLConnection.HTTP_OK) {
                    throw UpdateException("The update download failed.")
                }
                val declared = connection.contentLengthLong
                if (declared > MAX_APK_BYTES) {
                    throw UpdateException("The update is larger than expected.")
                }

                val digest = MessageDigest.getInstance("SHA-256")
                var total = 0L
                connection.inputStream.use { input ->
                    part.outputStream().buffered().use { output ->
                        val buffer = ByteArray(64 * 1024)
                        while (true) {
                            val read = input.read(buffer)
                            if (read < 0) break
                            total += read
                            if (total > MAX_APK_BYTES) {
                                throw UpdateException("The update is larger than expected.")
                            }
                            digest.update(buffer, 0, read)
                            output.write(buffer, 0, read)
                            if (declared > 0) {
                                onProgress(
                                    ((total * 100) / declared).toInt().coerceIn(0, 100),
                                )
                            }
                        }
                    }
                }

                val actual = digest.digest().joinToString("") { "%02x".format(it) }
                if (!actual.equals(info.sha256, ignoreCase = true)) {
                    throw UpdateException("The update failed its integrity check.")
                }
                verifyApk(part, info.versionName)
                if (!part.renameTo(target)) {
                    part.copyTo(target, overwrite = true)
                    part.delete()
                }
                onProgress(100)
                target
            } catch (error: UpdateException) {
                part.delete()
                throw error
            } catch (_: Exception) {
                part.delete()
                throw UpdateException("The update could not be saved.")
            } finally {
                connection.disconnect()
            }
        }

    /** Returns a previously verified download, or null if there is none. */
    fun cachedFile(info: UpdateInfo): File? {
        val file = File(File(context.cacheDir, UPDATE_DIR), "beacon-${info.versionName}.apk")
        if (!file.exists()) return null
        return try {
            verifyApk(file, info.versionName)
            file
        } catch (_: Exception) {
            file.delete()
            null
        }
    }

    fun install(file: File): InstallResult {
        if (!file.exists()) return InstallResult.Failed("Download the update again.")
        try {
            if (!context.packageManager.canRequestPackageInstalls()) {
                val intent = Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:${context.packageName}"),
                ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                return InstallResult.NeedsPermission(intent)
            }
        } catch (_: Exception) {
            return InstallResult.Failed("Could not check the install permission.")
        }

        return try {
            val uri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.updates",
                file,
            )
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            InstallResult.Started
        } catch (_: ActivityNotFoundException) {
            InstallResult.Failed("No app installer is available on this device.")
        } catch (_: Exception) {
            InstallResult.Failed("The installer could not be opened.")
        }
    }

    private fun parse(body: String): UpdateCheck {
        val root = try {
            JSONObject(body)
        } catch (_: Exception) {
            throw UpdateException("The update service returned an invalid response.")
        }
        if (!root.optBoolean("ok")) {
            throw UpdateException("The update service rejected the request.")
        }
        val data = root.optJSONObject("data")
            ?: throw UpdateException("The update service returned an invalid response.")
        if (!data.optBoolean("enabled")) return UpdateCheck.Disabled

        val versionName = data.optString("versionName").trim().removePrefix("v")
        if (!VERSION_PATTERN.matches(versionName)) {
            throw UpdateException("The update service advertised an invalid version.")
        }
        if (compareVersions(versionName, BuildConfig.VERSION_NAME) <= 0) {
            return UpdateCheck.UpToDate
        }

        val apkUrl = data.optString("apkUrl")
        if (!apkUrl.startsWith("https://")) {
            throw UpdateException("The update download must use HTTPS.")
        }
        val sha256 = data.optString("sha256").trim().lowercase()
        if (!HASH_PATTERN.matches(sha256)) {
            throw UpdateException("The update service advertised an invalid checksum.")
        }

        return UpdateCheck.Available(
            UpdateInfo(
                versionName = versionName,
                apkUrl = apkUrl,
                sha256 = sha256,
                sizeBytes = data.optLong("sizeBytes", 0L).coerceIn(0L, MAX_APK_BYTES),
                notes = data.optString("notes").take(2000),
            ),
        )
    }

    private fun verifyApk(file: File, expectedVersion: String) {
        val manager = context.packageManager
        val flags = signingFlags()
        val archive = manager.getPackageArchiveInfo(file.absolutePath, flags)
            ?: throw UpdateException("The downloaded file is not an Android app.")
        if (archive.packageName != context.packageName) {
            throw UpdateException("The update belongs to a different app.")
        }
        if (archive.versionName != expectedVersion) {
            throw UpdateException("The update version does not match the advertised version.")
        }
        val installed = manager.getPackageInfo(context.packageName, flags)
        val downloadedCerts = certHashes(archive)
        val installedCerts = certHashes(installed)
        if (downloadedCerts.isEmpty() || downloadedCerts != installedCerts) {
            throw UpdateException("The update is not signed by the installed app's key.")
        }
    }

    @Suppress("DEPRECATION")
    private fun signingFlags(): Int =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            PackageManager.GET_SIGNING_CERTIFICATES
        } else {
            PackageManager.GET_SIGNATURES
        }

    private fun certHashes(info: PackageInfo): Set<String> {
        val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            info.signingInfo?.apkContentsSigners
        } else {
            @Suppress("DEPRECATION")
            info.signatures
        } ?: return emptySet()

        val digest = MessageDigest.getInstance("SHA-256")
        return signatures.map { signature ->
            digest.reset()
            digest.digest(signature.toByteArray()).joinToString("") { "%02x".format(it) }
        }.toSet()
    }

    private fun open(rawUrl: String, accept: String): HttpURLConnection {
        var current = rawUrl
        repeat(MAX_REDIRECTS + 1) {
            val url = URL(current)
            if (!url.protocol.equals("https", ignoreCase = true)) {
                throw UpdateException("Updates must use HTTPS.")
            }
            val connection = (url.openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = false
                useCaches = false
                connectTimeout = CONNECT_TIMEOUT_MS
                readTimeout = READ_TIMEOUT_MS
                setRequestProperty("Accept", accept)
                setRequestProperty("User-Agent", "Beacon-Android/${BuildConfig.VERSION_NAME}")
            }
            val status = connection.responseCode
            if (status in 300..399) {
                val location = connection.getHeaderField("Location")
                connection.disconnect()
                if (location.isNullOrBlank()) {
                    throw UpdateException("The update redirect was invalid.")
                }
                current = URL(url, location).toString()
            } else {
                return connection
            }
        }
        throw UpdateException("The update redirect looped too many times.")
    }

    private fun readText(input: InputStream, limit: Int): String? {
        val builder = StringBuilder()
        val buffer = CharArray(4096)
        input.bufferedReader(Charsets.UTF_8).use { reader ->
            while (builder.length < limit) {
                val read = reader.read(buffer, 0, minOf(buffer.size, limit - builder.length))
                if (read <= 0) break
                builder.append(buffer, 0, read)
            }
            if (reader.read() >= 0) return null
        }
        return builder.toString()
    }

    private companion object {
        const val UPDATE_DIR = "updates"
        const val MAX_MANIFEST_CHARS = 64 * 1024
        const val MAX_APK_BYTES = 250L * 1024 * 1024
        const val MAX_REDIRECTS = 5
        const val CONNECT_TIMEOUT_MS = 15_000
        const val READ_TIMEOUT_MS = 60_000
        val VERSION_PATTERN = Regex("^\\d+(\\.\\d+){1,3}$")
        val HASH_PATTERN = Regex("^[a-f0-9]{64}$")
    }
}

internal fun compareVersions(left: String, right: String): Int {
    fun parts(value: String): List<Int> = value
        .trim()
        .removePrefix("v")
        .split('.')
        .map { part -> part.takeWhile(Char::isDigit).toIntOrNull() ?: 0 }

    val a = parts(left)
    val b = parts(right)
    for (index in 0 until maxOf(a.size, b.size)) {
        val comparison = a.getOrElse(index) { 0 }.compareTo(b.getOrElse(index) { 0 })
        if (comparison != 0) return comparison
    }
    return 0
}
