package dev.beacon.app.core

/**
 * The single source of truth for check-in intervals. Keeping the arithmetic
 * out of preferences makes it testable and stops "automatic" from silently
 * drifting between the scheduler and the screen.
 */
object TrackingIntervals {
    const val FOLLOW_PROFILE = 0
    const val MIN_OVERRIDE_MINUTES = 1
    const val MAX_OVERRIDE_MINUTES = 1440

    fun automaticBase(profile: String): Int = when (profile) {
        "low" -> 60
        "high" -> 15
        else -> 30
    }

    fun automaticInside(profile: String): Int = when (profile) {
        "high" -> 30
        else -> 60
    }

    fun automaticOutside(profile: String, overrideMinutes: Int): Int {
        if (overrideMinutes in MIN_OVERRIDE_MINUTES..MAX_OVERRIDE_MINUTES) {
            return overrideMinutes
        }
        return when (profile) {
            "low" -> 30
            "high" -> 15
            else -> 15
        }
    }

    /**
     * @param chosenMinutes 0 for Automatic, otherwise a fixed interval that is
     * obeyed exactly and ignores profiles and fences.
     * @param hasFences whether any fence geometry is cached on the device.
     * @param inside whether the last fix is inside one of those fences.
     * @param outsideOverride 0 to follow the profile, otherwise the interval to
     * use only while outside all fences.
     */
    fun effective(
        chosenMinutes: Int,
        profile: String,
        hasFences: Boolean,
        inside: Boolean,
        outsideOverride: Int,
    ): Int {
        if (chosenMinutes > 0) return chosenMinutes
        if (!hasFences) return automaticBase(profile)
        return if (inside) {
            automaticInside(profile)
        } else {
            automaticOutside(profile, outsideOverride)
        }
    }
}
