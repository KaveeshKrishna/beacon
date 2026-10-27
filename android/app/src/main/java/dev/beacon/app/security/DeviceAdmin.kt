package dev.beacon.app.security

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent

object DeviceAdmin {
    private fun component(context: Context) = ComponentName(
        context.packageName,
        BeaconDeviceAdminReceiver::class.java.name,
    )

    fun isActive(context: Context): Boolean {
        val manager = context.getSystemService(DevicePolicyManager::class.java) ?: return false
        return try {
            manager.isAdminActive(component(context))
        } catch (_: Exception) {
            false
        }
    }

    fun requestIntent(context: Context): Intent {
        val manager = context.getSystemService(DevicePolicyManager::class.java)
        return Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
            putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, component(context))
            putExtra(
                DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                context.getString(dev.beacon.app.R.string.device_admin_description),
            )
            if (manager != null && !manager.isAdminActive(component(context))) {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        }
    }

    fun lock(context: Context): Boolean {
        val manager = context.getSystemService(DevicePolicyManager::class.java) ?: return false
        return try {
            if (!manager.isAdminActive(component(context))) return false
            manager.lockNow()
            true
        } catch (_: Exception) {
            false
        }
    }
}
