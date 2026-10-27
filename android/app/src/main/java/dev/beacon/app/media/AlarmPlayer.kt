package dev.beacon.app.media

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Handler
import android.os.Looper

/**
 * Plays the system alarm tone at full media volume. MediaPlayer runs on the
 * caller's thread but all state changes are serialized.
 */
object AlarmPlayer {
    private val handler = Handler(Looper.getMainLooper())
    private var player: MediaPlayer? = null
    private val stopRunnable = Runnable { stop() }

    @Synchronized
    fun start(context: Context, durationMs: Long = 5 * 60_000L) {
        stopLocked()
        val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            ?: return
        try {
            player = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build(),
                )
                setDataSource(context, uri)
                isLooping = true
                prepare()
                start()
            }
            handler.removeCallbacks(stopRunnable)
            handler.postDelayed(stopRunnable, durationMs)
        } catch (_: Exception) {
            stopLocked()
        }
    }

    @Synchronized
    fun stop() {
        handler.removeCallbacks(stopRunnable)
        stopLocked()
    }

    val isPlaying: Boolean
        get() = synchronized(this) {
            try {
                player?.isPlaying == true
            } catch (_: Exception) {
                false
            }
        }

    private fun stopLocked() {
        val current = player
        player = null
        try {
            current?.stop()
        } catch (_: Exception) {
            // Already stopped.
        }
        try {
            current?.release()
        } catch (_: Exception) {
            // Nothing to release.
        }
    }
}
