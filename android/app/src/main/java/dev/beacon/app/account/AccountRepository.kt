package dev.beacon.app.account

import dev.beacon.app.core.AppPreferences
import dev.beacon.app.core.MobileSession
import dev.beacon.app.network.ApiClient
import dev.beacon.app.network.ApiResult
import dev.beacon.app.network.FailureKind
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Owns the narrow mobile session. Access tokens are short-lived and refresh
 * tokens rotate on every use, so callers never talk to the token endpoints
 * directly.
 */
class AccountRepository(
    private val api: ApiClient,
    private val prefs: AppPreferences,
) {
    private val refreshMutex = Mutex()

    fun current(): MobileSession? = prefs.mobileSession

    fun recoveryEligible(session: MobileSession? = current()): Boolean {
        if (session == null) return false
        val age = System.currentTimeMillis() - session.sessionCreatedAt
        return age >= RECOVERY_MIN_AGE_MS
    }

    fun recoveryDaysRemaining(session: MobileSession? = current()): Int {
        if (session == null) return RECOVERY_MIN_AGE_DAYS
        val age = System.currentTimeMillis() - session.sessionCreatedAt
        val remaining = RECOVERY_MIN_AGE_MS - age
        if (remaining <= 0) return 0
        return ((remaining + DAY_MS - 1) / DAY_MS).toInt().coerceIn(1, 7)
    }

    suspend fun exchange(
        serverUrl: String,
        code: String,
        verifier: String,
        state: String,
    ): ApiResult<MobileSession> {
        return when (val result = api.mobileExchange(serverUrl, code, verifier, state)) {
            is ApiResult.Failure -> result
            is ApiResult.Success -> {
                val value = result.value
                if (value.deviceId.isBlank()) {
                    return ApiResult.Failure(
                        FailureKind.INVALID,
                        "The server returned an incomplete link response. Try again.",
                    )
                }
                val session = MobileSession(
                    serverUrl = serverUrl,
                    accessToken = value.accessToken,
                    refreshToken = value.refreshToken,
                    accessExpiresAt = value.accessExpiresAt,
                    refreshExpiresAt = value.refreshExpiresAt,
                    sessionCreatedAt = value.sessionCreatedAt,
                    linkedAt = System.currentTimeMillis(),
                    accountName = value.accountName,
                    accountEmailMasked = value.accountEmailMasked,
                    deviceId = value.deviceId,
                    deviceName = value.deviceName,
                )
                prefs.mobileSession = session
                prefs.pendingAccountLink = null
                ApiResult.Success(session)
            }
        }
    }

    /**
     * Returns a session with a usable access token. A network failure is
     * retryable and keeps the stored session; a 401 means the refresh family
     * was revoked and the link must be recreated.
     */
    suspend fun ensureAccess(): ApiResult<MobileSession> {
        val initial = prefs.mobileSession
            ?: return ApiResult.Failure(
                FailureKind.UNAUTHORIZED,
                "Link this phone to your account first.",
            )
        val now = System.currentTimeMillis()
        if (initial.accessExpiresAt - now > ACCESS_SKEW_MS) {
            return ApiResult.Success(initial)
        }

        return refreshMutex.withLock {
            val current = prefs.mobileSession
                ?: return@withLock ApiResult.Failure(
                    FailureKind.UNAUTHORIZED,
                    "This phone is no longer linked. Link it again.",
                )
            val currentTime = System.currentTimeMillis()
            if (current.accessExpiresAt - currentTime > ACCESS_SKEW_MS) {
                return@withLock ApiResult.Success(current)
            }
            if (current.refreshExpiresAt <= currentTime) {
                prefs.mobileSession = null
                return@withLock ApiResult.Failure(
                    FailureKind.UNAUTHORIZED,
                    "This link expired after 30 days. Link this phone again.",
                )
            }

            when (val result = api.mobileRefresh(current.serverUrl, current.refreshToken)) {
                is ApiResult.Failure -> {
                    if (result.kind == FailureKind.UNAUTHORIZED) {
                        prefs.mobileSession = null
                    }
                    result
                }
                is ApiResult.Success -> {
                    val refreshed = current.copy(
                        accessToken = result.value.accessToken,
                        refreshToken = result.value.refreshToken,
                        accessExpiresAt = result.value.accessExpiresAt,
                        refreshExpiresAt = result.value.refreshExpiresAt,
                    )
                    prefs.mobileSession = refreshed
                    ApiResult.Success(refreshed)
                }
            }
        }
    }

    suspend fun logout(): ApiResult<Unit> {
        val initial = prefs.mobileSession
        if (initial == null) {
            prefs.pendingAccountLink = null
            return ApiResult.Success(Unit)
        }
        // Try once with a fresh access token so the server can revoke the
        // session. The local link is removed either way: an unreachable server
        // must not leave this phone holding a usable refresh token.
        val access = ensureAccess()
        val session = (access as? ApiResult.Success)?.value ?: initial
        prefs.mobileSession = null
        prefs.pendingAccountLink = null
        return api.mobileLogout(
            serverUrl = session.serverUrl,
            accessToken = session.accessToken,
            refreshToken = session.refreshToken,
        )
    }

    companion object {
        const val RECOVERY_MIN_AGE_DAYS = 7
        const val PENDING_LINK_MAX_AGE_MS = 6 * 60_000L
        private const val DAY_MS = 86_400_000L
        private const val RECOVERY_MIN_AGE_MS =
            RECOVERY_MIN_AGE_DAYS * DAY_MS
        private const val ACCESS_SKEW_MS = 60_000L
    }
}
