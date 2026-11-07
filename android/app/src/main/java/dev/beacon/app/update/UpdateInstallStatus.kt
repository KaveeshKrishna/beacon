package dev.beacon.app.update

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Carries installer failures from [UpdateInstallReceiver] to the UI.
 *
 * The receiver usually runs while the activity is paused (the install
 * confirmation is on screen). Keeping the failure in memory updates the UI
 * immediately if the process is alive, while the small on-disk copy lets a
 * cold start show the reason instead of silently returning to the update card.
 */
object UpdateInstallStatus {
    private const val PREFS = "beacon_update_install"
    private const val KEY_ERROR = "error"
    private const val KEY_ERROR_AT = "error_at"
    private const val MAX_AGE_MS = 10 * 60 * 1000L

    private val _failure = MutableStateFlow<String?>(null)
    val failure: StateFlow<String?> = _failure.asStateFlow()

    fun recordFailure(context: Context, message: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_ERROR, message)
            .putLong(KEY_ERROR_AT, System.currentTimeMillis())
            .apply()
        _failure.value = message
    }

    /** Returns and clears the pending failure, ignoring stale entries. */
    fun takeFailure(context: Context): String? {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val message = prefs.getString(KEY_ERROR, null) ?: return null
        val recordedAt = prefs.getLong(KEY_ERROR_AT, 0L)
        prefs.edit().remove(KEY_ERROR).remove(KEY_ERROR_AT).apply()
        _failure.value = null
        return if (System.currentTimeMillis() - recordedAt <= MAX_AGE_MS) message else null
    }
}
