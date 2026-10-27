# Android App

The Android client is a native Kotlin app built with Jetpack Compose. It holds no account password: pairing exchanges a one-use code for a per-device bearer token, and every request is scoped to that device.

- **Package:** `dev.beacon.app` (debug: `dev.beacon.app.debug`)
- **Minimum Android:** 8.0 (API 26)
- **Target / compile SDK:** 36
- **Stack:** Kotlin 2.2.21, AGP 8.13.2, Gradle 8.14.3, Compose BOM 2025.12.01, WorkManager 2.10.5
- **Size:** the minified release APK is roughly 1.3 MB; the debug APK is roughly 19 MB

---

## 1. Build

### Requirements

- JDK 17 (`JAVA_HOME` set)
- Android SDK Platform 36 and Build Tools
- Android Studio, or command-line tools with `ANDROID_HOME` set

`android/local.properties` (git-ignored) can point Gradle at the SDK:

```properties
sdk.dir=/path/to/Android/Sdk
```

### Debug

```bash
cd android
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

On Windows use `gradlew.bat`. The debug build has an `applicationId` suffix, so it can coexist with a release install. It is not covered by `FLAG_SECURE`, which makes screenshots possible during development.

### Release

A release build is minified with R8 and resource shrinking enabled. Signing is optional and read from `android/keystore.properties`:

```properties
storeFile=../beacon-release.jks
storePassword=...
keyAlias=beacon
keyPassword=...
```

With that file present:

```bash
cd android
./gradlew assembleRelease -PbeaconBaseUrl=https://beacon.example.com
# app/build/outputs/apk/release/app-release.apk
```

Without it, Gradle produces `app-release-unsigned.apk`. That file builds and can be inspected, but it cannot be installed or distributed. See [DEPLOYMENT.md](DEPLOYMENT.md#5-build-and-publish-the-android-app) for keystore creation and verification.

### Server address

Resolution order, highest first:

1. The server field on the pairing screen.
2. `-PbeaconBaseUrl=https://your-host` at build time.
3. The default, `https://beacon.example.com`.

The URL must be HTTPS, must have a host, and must not contain user info, a query, or a fragment. HTTP is not accepted, even in debug. The app has no cleartext exception and trusts only system CAs.

### Pairing link

The dashboard generates a QR code and a link:

```
beacon://pair?server=https://beacon.example.com&code=ABCD1234
```

Scanning the QR with a generic camera app opens the pairing screen with both values prefilled. The code remains single-use and expires after 10 minutes.

---

## 2. First run

1. **Pair.** Enter the eight-character code from the dashboard. Device name defaults to the manufacturer and model and can be edited.
2. **Grant location.** Fine or coarse location is required for any tracking. Background location ("Allow all the time") is required for periodic work while the app is closed.
3. **Allow notifications.** Android 13+ asks explicitly. Without it, command notifications, the lost-mode notice, and the photo request are invisible, and Android may refuse the foreground service.
4. **Optional: SMS fallback.** Grant `SEND_SMS` only if you configure a fallback number in the dashboard. SMS is a last resort and costs carrier rates.
5. **Optional: ignore battery optimizations.** This is the single largest reliability improvement on Xiaomi, Samsung, OnePlus, and other aggressive OEM builds.
6. **Optional: device admin.** Needed only for remote screen lock. It grants the `force-lock` policy and nothing else.

The home screen shows a protection checklist. Items are advisory, not gates; tracking still runs with partial permissions, within Android's limits.

---

## 3. How tracking works

### Baseline: WorkManager

A unique periodic worker syncs on a profile-controlled cadence:

| Profile | Interval | Flex | Typical use |
| --- | --- | --- | --- |
| `low` | 60 min | 30 min | Battery priority |
| `balanced` (default) | 30 min | 15 min | Normal |
| `high` | 15 min | 7.5 min | Active recovery |

WorkManager is inexact. Doze, App Standby, and OEM task killers can delay a run by hours. A failed attempt uses exponential backoff starting at 30 seconds. The worker captures one fix, uploads the queue, sends a heartbeat when due, and processes returned commands.

A heartbeat is sent at most every 10 minutes and only when the location queue is empty. It carries battery level, charging state, network type, SIM state, app version, and Android version. This is what powers offline and low-battery alerts.

### Lost mode: foreground service

Enabling lost mode starts a location foreground service with a persistent notification. While it runs:

- GPS and network fixes are requested every 30 seconds with a 20 m displacement filter.
- Each accepted fix triggers an immediate sync, rate-limited to one attempt per 20 seconds.
- Commands are polled every 2 minutes.
- The service is `START_STICKY` and restarts after process death where Android allows it.
- The service stops itself if the device is unpaired, revoked, or lost mode is switched off.

Android 12+ restricts starting a foreground service from the background. If the start is refused, the command is acknowledged as `failed` with an explanation, and periodic tracking continues. Opening the app or tapping the notification gives Android the foreground context it requires.

The app does **not** request `SCHEDULE_EXACT_ALARM`, wake locks held indefinitely, or a boot-time foreground service. Those choices trade a small amount of punctuality for store-policy and battery sanity.

### Boot and updates

`BootReceiver` listens for `BOOT_COMPLETED` and `MY_PACKAGE_REPLACED`, re-schedules periodic work, and restarts lost mode if it was active. The app does not start before the user unlocks the device for the first time after a reboot, because credential-encrypted storage is unavailable.

### Location quality

The sampler prefers a recent last-known fix that meets the accuracy target, then requests a fresh fix with a timeout (15 seconds low-power, 28 seconds high-accuracy). It keeps the best available result rather than failing when GPS is unavailable. Mock locations are reported as `isMocked`; the server records the flag but cannot prove a fix is genuine.

---

## 4. Offline queue

Locations are written to a local SQLite database before any network call.

- Payloads are encrypted individually with an Android Keystore AES-GCM key before insertion.
- The queue holds at most 5,000 points; the oldest are pruned first.
- Uploads are ordered by `recorded_at`, up to 200 points per request.
- A point is deleted only after the server accepts the batch.
- Failed batches increment an attempt counter and store a truncated error for diagnostics.
- Undecryptable or corrupt rows are deleted rather than retried forever.
- The queue and the Keystore key are cleared on unpair or revocation.

Each point carries a client-generated UUID. The server has a unique `(device_id, client_point_id)` constraint, so a retry after a lost response does not duplicate history.

The last known location remains visible in the dashboard while it is inside the retention window. It is not hidden merely because the device is offline.

---

## 5. Commands

Commands arrive in the response to a location sync or heartbeat, or from the lost-mode poll. They expire after 24 hours.

| Command | Behavior | Acknowledged as |
| --- | --- | --- |
| `LOCATE_NOW` | Requests a high-accuracy fix, queues it, flushes immediately | `completed` or `failed` |
| `SYNC_NOW` | Flushes the queue and polls again | `completed` |
| `RING` | Plays the alarm at alarm volume and posts a notification | `completed` |
| `LOST_MODE_ON` | Enables lost mode, starts the alarm for 60 seconds, starts the service | `completed` or `failed` |
| `LOST_MODE_OFF` | Stops the alarm and service, clears lost mode | `completed` |
| `LOCK_DEVICE` | Calls `DevicePolicyManager.lockNow()` if device admin is active | `completed`, `failed`, or `unsupported` |
| `MESSAGE` | Stores and displays up to 200 characters in a notification | `completed` or `failed` |
| `CAPTURE_PHOTO` | Posts a photo request; waits for a person to open the app | Deferred until upload/dismissal |

Alarms can always be silenced on the device. The app does not fight the volume keys, and it cannot prevent uninstallation or a factory reset.

### Photo requests

Android does not permit silent background camera capture. The flow is deliberately user-mediated:

1. The command posts a high-priority notification.
2. The owner opens the app and taps **Take photo**.
3. The system camera app captures a frame through a `FileProvider` URI.
4. The app downsamples to at most 1280 px, applies EXIF rotation, compresses to JPEG at quality 82, and enforces a 1.4 MB client cap.
5. The JPEG is uploaded base64-encoded with the command ID; the server validates magic bytes, a 1.5 MB cap, and a 24-hour capture window.
6. The server stores the bytes encrypted and marks the command completed.
7. The local temporary file is deleted after the attempt, including on failure.

If the request is dismissed, the app acknowledges `unsupported`. If it expires unopened, it acknowledges `failed`. Neither path pretends a photo was taken.

---

## 6. SMS fallback

SMS is used only when the app has no usable internet connection at sync time, a fallback number is configured, `SEND_SMS` is granted, and the fix is less than 10 minutes old.

- At most one SMS every 15 minutes.
- One multipart message containing a Google Maps link, accuracy, and timestamp.
- No account data, device name, or owner name.
- SMS is not encrypted. The carrier and anyone with the handset can read it.

This is a best-effort breadcrumb, not a control channel. Beacon never sends commands by SMS, and the server does not know whether an SMS was delivered.

---

## 7. Security properties

- HTTPS only; redirects are not followed; no cookies, proxies, or cached responses.
- Bearer token stored in SharedPreferences encrypted with a non-exportable Android Keystore AES-GCM key.
- Queue rows encrypted individually with the same Keystore.
- No token, coordinate, or command payload is logged.
- `allowBackup=false`; data extraction rules exclude app data.
- `FLAG_SECURE` on release builds prevents screenshots and screen recording of the app.
- Only the main activity (launcher and `beacon://` link) and the device-admin receiver are exported. The device-admin receiver requires `BIND_DEVICE_ADMIN`.
- No dynamic code loading, no WebView, no third-party analytics or crash SDK.
- Release builds are minified; mapping files are not published by default.

Residual risk is documented in [THREAT_MODEL.md](THREAT_MODEL.md). A rooted device can read memory while the app is unlocked, and a modified client can report false locations.

---

## 8. Permissions

| Permission | Why | If denied |
| --- | --- | --- |
| `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` | Location fixes | No tracking |
| `ACCESS_BACKGROUND_LOCATION` | Periodic sync while closed | WorkManager may be restricted to foreground use |
| `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION` | Lost-mode live tracking | Lost mode falls back to periodic work |
| `POST_NOTIFICATIONS` | Command, alarm, and photo notices | Notices are invisible; FGS may not start |
| `RECEIVE_BOOT_COMPLETED` | Re-schedule after reboot | Tracking resumes only after the app is opened |
| `READ_PHONE_STATE` | SIM state changes | No SIM-change signal |
| `SEND_SMS` | Optional SMS fallback | No SMS fallback |
| `CAMERA` | Requested photo | Photo requests cannot be fulfilled |
| `VIBRATE`, `WAKE_LOCK` | Alarm and reliable work | Reduced alarm effect |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | Prompt only; user decides | OEM battery savers may delay work |

The app explains each permission in context. It never requests a permission in the background or enables a capability silently.

---

## 9. Package map

```
dev.beacon.app
├── BeaconApplication.kt      App container, startup, state snapshot
├── MainActivity.kt           Deep links, permission flows, camera, FLAG_SECURE
├── core/                     Preferences, Keystore crypto, UI state model
├── data/                     Location point, queue, device status readers
├── location/                 Sampler, WorkManager scheduler
├── network/                  HttpURLConnection API client and DTOs
├── sync/                     Sync engine, command handler
├── tracking/                 Lost-mode foreground service
├── work/                     Worker and boot receiver
├── notifications/            Channels, alarm, photo and command notices
├── security/                 Device admin receiver and wrapper
├── sms/                      Rate-limited SMS fallback
├── media/                    Alarm player, JPEG preparation
└── ui/                       Compose screens, components, theme, view model
```

State flows from `AppContainer` into `BeaconViewModel`; there is no second source of truth. The sync mutex is process-wide, so a manual sync, a worker, and the lost-mode poll cannot race each other.

---

## 10. Testing

```bash
cd android
./gradlew :app:assembleDebug
./gradlew :app:assembleRelease
```

There are no Android unit or instrumentation tests in `v0.1.0`; this is a known gap tracked in [ROADMAP.md](ROADMAP.md). Verification is currently a build plus a manual pass. A headless emulator is enough to check rendering and permission flows:

```bash
adb shell am start -n dev.beacon.app.debug/dev.beacon.app.MainActivity
adb logcat -s Beacon:D
```

The app writes almost nothing to logcat by design. Use the in-app status line, the notification, and the dashboard activity feed for diagnosis. Before distributing a release, complete the physical-device checklist in [DEPLOYMENT.md](DEPLOYMENT.md#release-checklist-for-the-app).

---

## 11. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| "Enter a valid HTTPS server address" | HTTP, user info, query, or missing host | Use the exact `https://` origin |
| Pairing returns `invalid_code` | Code used, expired, or mistyped | Generate a new code in the dashboard |
| Commands take 15–60 minutes | No FCM; WorkManager is inexact | Use lost mode for a 2-minute poll, or open the app |
| Lost mode says the service was refused | Android 12+ background FGS restriction | Open the app, then enable lost mode again |
| No tracking with the screen off | Background location denied or OEM battery saver | Grant "Allow all the time"; exempt from battery optimization |
| Photo request does nothing | Notifications denied or request expired | Check notification settings; request a new photo |
| "This device is no longer authorised" | Device revoked or unpaired | Remove the old device and pair again |
| Queue keeps growing | Server unreachable or certificate invalid | Check the server URL and device clock; verify HTTPS from the browser |

For server-side diagnosis, see [OPERATIONS.md](OPERATIONS.md).
