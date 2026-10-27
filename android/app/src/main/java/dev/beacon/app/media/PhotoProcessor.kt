package dev.beacon.app.media

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import android.util.Base64
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream

data class PreparedPhoto(
    val base64: String,
    val width: Int,
    val height: Int,
    val byteSize: Int,
)

object PhotoProcessor {
    private const val MAX_DIMENSION = 1280
    private const val QUALITY = 82

    fun prepare(context: Context, uri: Uri): PreparedPhoto? {
        val decoded = decodeSampled(context, uri) ?: return null
        val rotated = applyRotation(context, uri, decoded)
        if (rotated !== decoded) decoded.recycle()

        val scale = minOf(
            1f,
            MAX_DIMENSION.toFloat() / maxOf(rotated.width, rotated.height),
        )
        val scaled = if (scale < 1f) {
            Bitmap.createScaledBitmap(
                rotated,
                (rotated.width * scale).toInt().coerceAtLeast(1),
                (rotated.height * scale).toInt().coerceAtLeast(1),
                true,
            ).also { if (it !== rotated) rotated.recycle() }
        } else {
            rotated
        }

        val output = ByteArrayOutputStream()
        scaled.compress(Bitmap.CompressFormat.JPEG, QUALITY, output)
        val width = scaled.width
        val height = scaled.height
        scaled.recycle()
        val bytes = output.toByteArray()
        if (bytes.isEmpty() || bytes.size > MAX_BYTES) return null
        return PreparedPhoto(
            base64 = Base64.encodeToString(bytes, Base64.NO_WRAP),
            width = width,
            height = height,
            byteSize = bytes.size,
        )
    }

    fun newCaptureFile(context: Context): File {
        val directory = File(context.cacheDir, "photo_captures").apply { mkdirs() }
        return File.createTempFile("beacon_", ".jpg", directory)
    }

    fun compressForTest(context: Context, source: File, target: File): Boolean {
        return try {
            val decoded = BitmapFactory.decodeFile(source.absolutePath) ?: return false
            FileOutputStream(target).use { stream ->
                decoded.compress(Bitmap.CompressFormat.JPEG, QUALITY, stream)
            }
            decoded.recycle()
            true
        } catch (_: Exception) {
            false
        }
    }

    private fun decodeSampled(context: Context, uri: Uri): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        context.contentResolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, bounds)
        }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

        var sampleSize = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / sampleSize > MAX_DIMENSION * 2) {
            sampleSize *= 2
        }
        val options = BitmapFactory.Options().apply {
            inSampleSize = sampleSize
            inPreferredConfig = Bitmap.Config.ARGB_8888
        }
        return context.contentResolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, options)
        }
    }

    private fun applyRotation(context: Context, uri: Uri, bitmap: Bitmap): Bitmap {
        val orientation = try {
            context.contentResolver.openInputStream(uri)?.use { stream ->
                ExifInterface(stream).getAttributeInt(
                    ExifInterface.TAG_ORIENTATION,
                    ExifInterface.ORIENTATION_NORMAL,
                )
            }
        } catch (_: Exception) {
            null
        } ?: return bitmap

        val matrix = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
            ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
            ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
            else -> return bitmap
        }
        return try {
            Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
        } catch (_: Exception) {
            bitmap
        }
    }

    private const val MAX_BYTES = 1_400_000
}
