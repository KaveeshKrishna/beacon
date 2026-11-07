package dev.beacon.app.update

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import android.util.Log
import dev.beacon.app.notifications.NotificationHelper

/**
 * Receives the outcome of a [PackageInstaller] session started by
 * [UpdateChecker.install]. Android always sends
 * [PackageInstaller.STATUS_PENDING_USER_ACTION] first; the confirmation
 * activity that it supplies is what the owner sees as "Install update".
 */
class UpdateInstallReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (val status = intent.getIntExtra(
            PackageInstaller.EXTRA_STATUS,
            PackageInstaller.STATUS_FAILURE,
        )) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                val confirmation = intent.intentExtra(Intent.EXTRA_INTENT)
                if (confirmation == null) {
                    fail(context, "Android's install confirmation is unavailable. Try again.")
                    return
                }
                confirmation.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                try {
                    context.startActivity(confirmation)
                } catch (_: Exception) {
                    fail(context, "Android's install confirmation could not be opened. Try again.")
                }
            }
            PackageInstaller.STATUS_SUCCESS -> {
                Log.i(TAG, "Update installed from ${intent.getStringExtra(EXTRA_APK_PATH)}")
            }
            PackageInstaller.STATUS_FAILURE_ABORTED -> {
                // The owner closed the confirmation on purpose. Leave the
                // Install update button in place without an alarming message.
                Log.i(TAG, "Update install was cancelled")
            }
            else -> {
                val raw = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
                Log.w(TAG, "Update install failed: status=$status message=$raw")
                fail(context, failureMessage(status, raw))
            }
        }
    }

    private fun fail(context: Context, message: String) {
        UpdateInstallStatus.recordFailure(context, message)
        NotificationHelper.showUpdateInstallFailed(context, message)
    }

    private fun failureMessage(status: Int, raw: String?): String = when (status) {
        PackageInstaller.STATUS_FAILURE_BLOCKED ->
            "Android blocked the update. Allow Beacon to install unknown apps, then try again."
        PackageInstaller.STATUS_FAILURE_CONFLICT ->
            "Android could not replace the installed Beacon app. Uninstall it first, then install the update."
        PackageInstaller.STATUS_FAILURE_INCOMPATIBLE ->
            "This update is not compatible with this device."
        PackageInstaller.STATUS_FAILURE_INVALID ->
            "The downloaded update is not a valid app. Download it again."
        PackageInstaller.STATUS_FAILURE_STORAGE ->
            "Android ran out of storage while installing the update."
        else -> raw
            ?.take(200)
            ?.takeIf { it.isNotBlank() }
            ?.let { "Android could not install the update: $it" }
            ?: "Android could not install the update. Try again."
    }

    @Suppress("DEPRECATION")
    private fun Intent.intentExtra(name: String): Intent? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getParcelableExtra(name, Intent::class.java)
        } else {
            getParcelableExtra(name)
        }

    companion object {
        const val EXTRA_APK_PATH = "dev.beacon.app.extra.APK_PATH"
        private const val TAG = "UpdateInstall"
    }
}
