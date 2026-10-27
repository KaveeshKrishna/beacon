package dev.beacon.app.data

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import dev.beacon.app.core.KeystoreCrypto
import org.json.JSONObject

data class QueuedPoint(
    val id: String,
    val payload: JSONObject,
)

/**
 * Offline-first queue. The JSON payload is encrypted with a Keystore key before
 * it touches SQLite, so a rooted device or a stolen backup cannot read the
 * breadcrumb history directly.
 */
class QueueStore(context: Context) {
    private val helper = Db(context.applicationContext)

    fun enqueue(point: LocationPoint): Boolean {
        val values = ContentValues().apply {
            put("id", point.id)
            put("recorded_at", point.recordedAt)
            put("payload", KeystoreCrypto.encryptString(point.toJson().toString()))
            put("attempts", 0)
        }
        val db = helper.writableDatabase
        val inserted = db.insertWithOnConflict(
            "points",
            null,
            values,
            SQLiteDatabase.CONFLICT_IGNORE,
        ) != -1L
        if (inserted) prune(db)
        return inserted
    }

    fun pending(limit: Int = 200): List<QueuedPoint> {
        val result = mutableListOf<QueuedPoint>()
        val broken = mutableListOf<String>()
        helper.readableDatabase.query(
            "points",
            arrayOf("id", "payload"),
            null,
            null,
            null,
            null,
            "recorded_at ASC",
            limit.toString(),
        ).use { cursor ->
            val idIndex = cursor.getColumnIndexOrThrow("id")
            val payloadIndex = cursor.getColumnIndexOrThrow("payload")
            while (cursor.moveToNext()) {
                val id = cursor.getString(idIndex)
                val sealed = cursor.getString(payloadIndex)
                val json = KeystoreCrypto.decryptString(sealed)
                if (json == null) {
                    broken += id
                    continue
                }
                try {
                    result += QueuedPoint(id, JSONObject(json))
                } catch (_: Exception) {
                    broken += id
                }
            }
        }
        if (broken.isNotEmpty()) delete(broken)
        return result
    }

    fun delete(ids: Collection<String>) {
        if (ids.isEmpty()) return
        val placeholders = ids.joinToString(",") { "?" }
        helper.writableDatabase.delete(
            "points",
            "id IN ($placeholders)",
            ids.toTypedArray(),
        )
    }

    fun markAttempt(ids: Collection<String>, error: String?) {
        if (ids.isEmpty()) return
        val placeholders = ids.joinToString(",") { "?" }
        val args = ArrayList<Any?>(ids.size + 1).apply {
            add(error?.take(240))
            addAll(ids)
        }
        helper.writableDatabase.execSQL(
            "UPDATE points SET attempts = attempts + 1, last_error = ? " +
                "WHERE id IN ($placeholders)",
            args.toTypedArray(),
        )
    }

    fun count(): Int = helper.readableDatabase.rawQuery(
        "SELECT COUNT(*) FROM points",
        null,
    ).use { cursor ->
        if (cursor.moveToFirst()) cursor.getInt(0) else 0
    }

    fun clear() {
        helper.writableDatabase.delete("points", null, null)
    }

    fun close() {
        helper.close()
    }

    private fun prune(db: SQLiteDatabase) {
        db.execSQL(
            "DELETE FROM points WHERE id IN (" +
                "SELECT id FROM points ORDER BY recorded_at ASC LIMIT MAX(0, " +
                "(SELECT COUNT(*) FROM points) - $MAX_QUEUE))",
        )
    }

    private class Db(context: Context) : SQLiteOpenHelper(
        context,
        "beacon_queue.db",
        null,
        DATABASE_VERSION,
    ) {
        init {
            setWriteAheadLoggingEnabled(true)
        }

        override fun onCreate(db: SQLiteDatabase) {
            db.execSQL(
                """
                CREATE TABLE points (
                    id TEXT PRIMARY KEY NOT NULL,
                    recorded_at INTEGER NOT NULL,
                    payload TEXT NOT NULL,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    last_error TEXT
                )
                """.trimIndent(),
            )
            db.execSQL("CREATE INDEX points_recorded_idx ON points(recorded_at)")
        }

        override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
            db.execSQL("DROP TABLE IF EXISTS points")
            onCreate(db)
        }
    }

    private companion object {
        const val DATABASE_VERSION = 1
        const val MAX_QUEUE = 5000
    }
}
