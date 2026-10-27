package dev.beacon.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import dev.beacon.app.media.PhotoProcessor
import dev.beacon.app.security.DeviceAdmin
import dev.beacon.app.ui.BeaconApp
import dev.beacon.app.ui.BeaconViewModel
import java.io.File
class MainActivity : ComponentActivity() {
    private val viewModel: BeaconViewModel by viewModels()
    private var captureFile: File? = null
    private var captureUri: Uri? = null

    private val locationPermissions = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) {
        viewModel.refresh()
    }

    private val backgroundLocation = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) {
        viewModel.refresh()
    }

    private val notificationPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) {
        viewModel.refresh()
    }

    private val smsPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) {
        viewModel.refresh()
    }

    private val cameraPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) {
            openCamera()
        } else {
            viewModel.notify("Camera permission is required to take a requested photo.")
        }
        viewModel.refresh()
    }

    private val takePicture = registerForActivityResult(
        ActivityResultContracts.TakePicture(),
    ) { saved ->
        val uri = captureUri
        val file = captureFile
        if (saved && uri != null) {
            // The view model reads the file asynchronously and deletes it after
            // the upload attempt. Deleting it here would race the read.
            viewModel.onPhotoCaptured(uri, file)
        } else {
            file?.delete()
        }
        captureFile = null
        captureUri = null
        viewModel.refresh()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        if (!BuildConfig.DEBUG) {
            window.setFlags(
                WindowManager.LayoutParams.FLAG_SECURE,
                WindowManager.LayoutParams.FLAG_SECURE,
            )
        }
        viewModel.handleDeepLink(intent?.data)
        setContent {
            BeaconApp(
                viewModel = viewModel,
                onRequestLocation = ::requestLocation,
                onRequestBackground = ::requestBackgroundLocation,
                onRequestNotifications = ::requestNotifications,
                onRequestSms = ::requestSms,
                onRequestBattery = ::requestBatteryExemption,
                onRequestAdmin = ::requestDeviceAdmin,
                onOpenDashboard = ::openDashboard,
                onOpenPrivacy = ::openPrivacy,
                onOpenSettings = ::openAppSettings,
                onTakePhoto = ::requestCamera,
            )
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        viewModel.handleDeepLink(intent.data)
        viewModel.refresh()
    }

    override fun onResume() {
        super.onResume()
        viewModel.refresh()
    }

    private fun requestLocation() {
        locationPermissions.launch(
            arrayOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION,
            ),
        )
    }

    private fun requestBackgroundLocation() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
            ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.ACCESS_BACKGROUND_LOCATION,
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            backgroundLocation.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
        } else {
            openAppSettings()
        }
    }

    private fun requestNotifications() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.POST_NOTIFICATIONS,
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            openNotificationSettings()
        }
    }

    private fun requestSms() {
        smsPermission.launch(Manifest.permission.SEND_SMS)
    }

    private fun requestBatteryExemption() {
        val direct = Intent(
            Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
            Uri.parse("package:$packageName"),
        )
        try {
            startActivity(direct)
        } catch (_: Exception) {
            try {
                startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
            } catch (_: Exception) {
                openAppSettings()
            }
        }
    }

    private fun requestDeviceAdmin() {
        try {
            startActivity(DeviceAdmin.requestIntent(this))
        } catch (_: Exception) {
            viewModel.notify("This Android build does not expose device administration.")
        }
    }

    private fun requestCamera() {
        if (ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.CAMERA,
            ) == PackageManager.PERMISSION_GRANTED
        ) {
            openCamera()
        } else {
            cameraPermission.launch(Manifest.permission.CAMERA)
        }
    }

    private fun openCamera() {
        try {
            val file = PhotoProcessor.newCaptureFile(this)
            val uri = FileProvider.getUriForFile(
                this,
                "$packageName.photos",
                file,
            )
            captureFile?.delete()
            captureFile = file
            captureUri = uri
            takePicture.launch(uri)
        } catch (_: Exception) {
            viewModel.notify("No camera app is available on this device.")
            captureFile?.delete()
            captureFile = null
            captureUri = null
        }
    }

    private fun openDashboard() {
        val server = viewModel.state.value.serverUrl
        if (server.isBlank()) return
        openUrl(server)
    }

    private fun openPrivacy() {
        val server = viewModel.state.value.serverUrl
        if (server.isBlank()) return
        openUrl("${server.trimEnd('/')}/privacy")
    }

    private fun openUrl(url: String) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        } catch (_: Exception) {
            viewModel.notify("No browser is available to open that link.")
        }
    }

    private fun openAppSettings() {
        try {
            startActivity(
                Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:$packageName"),
                ),
            )
        } catch (_: Exception) {
            viewModel.notify("Android settings are not available.")
        }
    }

    private fun openNotificationSettings() {
        try {
            startActivity(
                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                    putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
                },
            )
        } catch (_: Exception) {
            openAppSettings()
        }
    }
}
