package dev.beacon.app.ui.components

import android.graphics.PointF
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import dev.beacon.app.core.GeofenceMath
import java.util.Locale
import kotlin.math.ln
import kotlin.math.roundToInt
import org.maplibre.android.MapLibre
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.FillLayer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.PropertyFactory.circleColor
import org.maplibre.android.style.layers.PropertyFactory.circleRadius
import org.maplibre.android.style.layers.PropertyFactory.circleStrokeColor
import org.maplibre.android.style.layers.PropertyFactory.circleStrokeWidth
import org.maplibre.android.style.layers.PropertyFactory.fillColor
import org.maplibre.android.style.layers.PropertyFactory.fillOpacity
import org.maplibre.android.style.layers.PropertyFactory.lineColor
import org.maplibre.android.style.layers.PropertyFactory.lineWidth
import org.maplibre.android.style.sources.GeoJsonSource

/**
 * OpenFreeMap's Positron style matches the web dashboard and needs no API key.
 * Self-hosters who want a different style can replace this constant when they
 * build their own APK.
 */
private const val STYLE_URL = "https://tiles.openfreemap.org/styles/positron"

private const val CIRCLE_SOURCE = "beacon-fence-circle"
private const val CENTER_SOURCE = "beacon-fence-center"
private const val FILL_LAYER = "beacon-fence-fill"
private const val OUTLINE_LAYER = "beacon-fence-outline"
private const val CENTER_LAYER = "beacon-fence-center-dot"

private const val ACCENT = 0xFFFF6A45.toInt()
private const val WHITE = 0xFFFFFFFF.toInt()

/**
 * A draggable circular fence preview. Tapping the map moves the centre and
 * dragging the orange handle on the circle's eastern edge changes the radius.
 * The numeric slider in the editor remains available as a fallback for
 * accessibility and for precise values.
 */
@Composable
fun GeofenceMap(
    latitude: Double,
    longitude: Double,
    radiusM: Int,
    onCenterChange: (Double, Double) -> Unit,
    onRadiusChange: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val currentCenter by rememberUpdatedState(onCenterChange)
    val currentRadius by rememberUpdatedState(onRadiusChange)
    val latestLatitude by rememberUpdatedState(latitude)
    val latestLongitude by rememberUpdatedState(longitude)
    val latestRadius by rememberUpdatedState(radiusM)

    val mapView = remember {
        runCatching { MapLibre.getInstance(context) }
        MapView(context)
    }
    val controller = remember { GeofenceMapController() }

    DisposableEffect(mapView) {
        mapView.onStart()
        mapView.onResume()
        onDispose {
            mapView.onPause()
            mapView.onStop()
            mapView.onDestroy()
        }
    }

    AndroidView(
        modifier = modifier,
        factory = { viewContext ->
            FrameLayout(viewContext).apply {
                addView(
                    mapView,
                    FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT,
                    ),
                )

                val handleSize = (30 * resources.displayMetrics.density).roundToInt()
                val handle = View(viewContext).apply {
                    background = GradientDrawable().apply {
                        shape = GradientDrawable.OVAL
                        setColor(ACCENT)
                        setStroke((3 * resources.displayMetrics.density).roundToInt(), WHITE)
                    }
                    contentDescription = "Drag to resize the geofence"
                }
                addView(
                    handle,
                    FrameLayout.LayoutParams(handleSize, handleSize),
                )
                controller.frame = this
                controller.mapView = mapView
                controller.handle = handle
                controller.handleSize = handleSize

                handle.setOnTouchListener { _, event ->
                    controller.onHandleTouch(event) { value ->
                        currentRadius(value)
                    }
                }

                mapView.getMapAsync { map ->
                    controller.map = map
                    map.uiSettings.isRotateGesturesEnabled = false
                    map.uiSettings.isTiltGesturesEnabled = false
                    map.uiSettings.isCompassEnabled = false
                    map.uiSettings.setLogoGravity(Gravity.TOP or Gravity.START)
                    map.uiSettings.setLogoMargins(0, handleSize * 2, handleSize / 2, 0)
                    map.uiSettings.setAttributionGravity(Gravity.TOP or Gravity.END)
                    map.uiSettings.setAttributionMargins(0, handleSize * 2, handleSize / 2, 0)

                    map.setStyle(Style.Builder().fromUri(STYLE_URL)) { style ->
                        controller.attach(style)
                        controller.update(
                            latestLatitude,
                            latestLongitude,
                            latestRadius,
                        )
                        map.moveCamera(
                            CameraUpdateFactory.newLatLngZoom(
                                LatLng(latestLatitude, latestLongitude),
                                zoomForRadius(latestRadius),
                            ),
                        )
                    }

                    map.addOnMapClickListener { point ->
                        currentCenter(point.latitude, point.longitude)
                        controller.update(
                            point.latitude,
                            point.longitude,
                            latestRadius,
                        )
                        true
                    }
                    map.addOnCameraMoveListener { controller.positionHandle() }
                }
            }
        },
        update = {
            controller.update(latitude, longitude, radiusM)
        },
    )
}

private class GeofenceMapController {
    var map: MapLibreMap? = null
    var mapView: MapView? = null
    var frame: FrameLayout? = null
    var handle: View? = null
    var handleSize: Int = 0

    private var circleSource: GeoJsonSource? = null
    private var centerSource: GeoJsonSource? = null
    private var latitude = 0.0
    private var longitude = 0.0
    private var radiusM = 0
    private var hasGeometry = false

    fun attach(style: Style) {
        val circle = GeoJsonSource(CIRCLE_SOURCE, polygonJson(latitude, longitude, radiusM))
        val center = GeoJsonSource(CENTER_SOURCE, pointJson(latitude, longitude))
        style.addSource(circle)
        style.addSource(center)
        style.addLayer(
            FillLayer(FILL_LAYER, CIRCLE_SOURCE).withProperties(
                fillColor(ACCENT),
                fillOpacity(0.14f),
            ),
        )
        style.addLayer(
            LineLayer(OUTLINE_LAYER, CIRCLE_SOURCE).withProperties(
                lineColor(ACCENT),
                lineWidth(2.5f),
            ),
        )
        style.addLayer(
            CircleLayer(CENTER_LAYER, CENTER_SOURCE).withProperties(
                circleColor(ACCENT),
                circleRadius(7f),
                circleStrokeColor(WHITE),
                circleStrokeWidth(2f),
            ),
        )
        circleSource = circle
        centerSource = center
        hasGeometry = true
        positionHandle()
    }

    fun update(latitude: Double, longitude: Double, radiusM: Int) {
        val changed = !hasGeometry ||
            this.latitude != latitude ||
            this.longitude != longitude ||
            this.radiusM != radiusM
        if (!changed) {
            positionHandle()
            return
        }
        this.latitude = latitude
        this.longitude = longitude
        this.radiusM = radiusM
        circleSource?.setGeoJson(polygonJson(latitude, longitude, radiusM))
        centerSource?.setGeoJson(pointJson(latitude, longitude))
        positionHandle()
    }

    fun positionHandle() {
        val map = map ?: return
        val handle = handle ?: return
        if (!hasGeometry) return
        val edge = GeofenceMath.destination(
            latitude,
            longitude,
            90.0,
            radiusM.toDouble(),
        )
        val point = map.projection.toScreenLocation(LatLng(edge.first, edge.second))
        handle.x = point.x - handleSize / 2f
        handle.y = point.y - handleSize / 2f
        handle.visibility = View.VISIBLE
    }

    fun onHandleTouch(event: MotionEvent, onRadius: (Int) -> Unit): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                handle?.isPressed = true
                return true
            }
            MotionEvent.ACTION_MOVE -> {
                val map = map ?: return false
                val view = mapView ?: return false
                val location = IntArray(2)
                view.getLocationOnScreen(location)
                val point = map.projection.fromScreenLocation(
                    PointF(
                        event.rawX - location[0],
                        event.rawY - location[1],
                    ),
                )
                val meters = GeofenceMath.distanceMeters(
                    latitude,
                    longitude,
                    point.latitude,
                    point.longitude,
                )
                val rounded = (meters / 10.0).roundToInt() * 10
                onRadius(rounded.coerceIn(50, 5_000))
                return true
            }
            MotionEvent.ACTION_UP,
            MotionEvent.ACTION_CANCEL,
            -> {
                handle?.isPressed = false
                return true
            }
        }
        return false
    }
}

private fun polygonJson(
    latitude: Double,
    longitude: Double,
    radiusM: Int,
): String {
    val ring = GeofenceMath.circleRing(latitude, longitude, radiusM)
    val coordinates = ring.joinToString(",") { (lat, lon) ->
        "[${decimal(lon)},${decimal(lat)}]"
    }
    return """{"type":"Feature","properties":{},"geometry":{"type":"Polygon","coordinates":[[$coordinates]]}}"""
}

private fun pointJson(latitude: Double, longitude: Double): String =
    """{"type":"Feature","properties":{},"geometry":{"type":"Point","coordinates":[${decimal(longitude)},${decimal(latitude)}]}}"""

private fun decimal(value: Double): String =
    String.format(Locale.US, "%.7f", value)

private fun zoomForRadius(radiusM: Int): Double =
    (16.0 - ln(radiusM.coerceAtLeast(50) / 100.0) / ln(2.0)).coerceIn(9.0, 18.0)
