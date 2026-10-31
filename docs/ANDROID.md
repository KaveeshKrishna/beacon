# Android App

The Android client is a native Kotlin app built with Jetpack Compose. It holds no account password: pairing exchanges a one-use code for a per-device bearer token, and every request is scoped to that device. An optional account link is approved in the browser and yields a separate, narrow mobile token for the Find My screen and Tier 1 MFA recovery.

- **Package:** `dev.beacon.app` (debug: `dev.beacon.app.debug`)
- **Minimum Android:** 8.0 (API 26)
- **Target / compile SDK:** 36
- **Stack:** Kotlin 2.2.21, AGP 8.13.2, Gradle 8.14.3, Compose BOM 2025.12.01, WorkManager 2.10.5
- **Size:** the minified release APK is roughly 1.9 MB; the debug APK is roughly 19 MB

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

### Check-in interval and geofences

The app offers Automatic, or a fixed interval of 1, 2, 5, 15, 30, or 60 minutes. Fixed intervals are always obeyed exactly; anything under 15 minutes runs through the foreground service, and the rest through WorkManager.

Automatic follows the dashboard profile and, when the server has geofences for this device, adapts to the phone's last fix:

| Profile | Inside a fence | Outside every fence |
| --- | --- | --- |
| `low` | 60 min | 30 min |
| `balanced` | 60 min | 15 min |
| `high` | 30 min | 15 min |

Fences can be created from the dashboard or from the app itself: **Geofences → Add current place** takes a fresh high-accuracy fix, asks for a name and a 100 m–2 km radius, and creates the fence through `POST /api/device/geofences` using the device token. The token is scoped to one device, so the app can only list, create, and delete its own fences. The server still performs enter/exit evaluation and notifications on ingest; the app's copy of the geometry only decides the next check-in.

Adaptation is evaluated when a check-in happens, using the fix that was just taken. A phone that leaves a fence is noticed at its next check-in, not at the moment it crosses the boundary. Instant exit detection would need Google Play services' `GeofencingClient` or an already-running foreground service, and Beacon deliberately avoids a Play services dependency.

### Linked account, Find My, and recovery

An optional account link lets one phone see the other devices on the same Beacon account and perform a Tier 1 recovery if the authenticator is lost. The link is separate from device pairing:

- The device token keeps reporting this phone's location. It is never widened to account scope.
- The account link adds a second, narrow mobile session with `devices:read account:recover`. It cannot issue commands or change settings.

**Linking.** Tap **Account → Link this phone**. The app generates a PKCE verifier, its S256 challenge, and a random `state`, then opens the browser at `/app/link-device`. The owner signs in, checks the device name, and approves. The browser returns through `beacon://account-linked?code=...&state=...`. Before exchanging the code the app compares `state` in constant time; a callback with the wrong state is ignored, so a malicious app that guesses the custom scheme cannot attach its own code. The verifier never leaves the phone. The link code is single-use and expires after five minutes.

**Linked phones.** The account screen lists every active device on the account with its presence, battery, and latest fix. Selecting another device shows:

- straight-line distance and cardinal direction from this phone's current fix;
- a compass dial that rotates with the phone when a rotation-vector sensor is available;
- age, accuracy, provider, and mocked-location warnings;
- buttons for **Direction** and **Maps** (a `geo:` handoff with an OpenStreetMap fallback).

The bearing is calculated from true north and corrected with the local magnetic declination. Without a magnetometer the arrow still points to true north; the screen tells the owner to hold the top of the phone north. This is not a walking route, indoor direction, or a replacement for maps.

**Recovery.** A linked phone becomes eligible to reset MFA after **seven continuous days** of linking. Recovery requires:

1. A biometric prompt using `BIOMETRIC_STRONG` on the phone.
2. The account password, verified again by the server.
3. Typing `RESET` in the confirmation dialog.

The server then removes the authenticator and recovery codes, requires a new factor enrollment on the next web sign-in, revokes every web session and every other linked phone, and emails the owner. The phone that performed the reset stays linked. This is **MFA reset only**: it does not change the password, and a brand-new link cannot use it. A phone that was linked for less than seven days shows the remaining days instead.

Unlinking clears the local access and refresh tokens first, then makes a best-effort server logout with a fresh token. If the server is unreachable, the phone still forgets the link; the owner can revoke the stale row under **Settings → Security → Linked phones**.

### SIM removal

`SimStateReceiver` listens for `ACTION_SIM_STATE_CHANGED`. When a usable SIM transitions to absent it triggers an immediate sync attempt, so the last fix has the best chance of uploading over Wi-Fi, a hotspot, or an eSIM before the phone goes dark.

**Lock on SIM removal** is opt-in and requires device admin. When enabled, the same transition calls `DevicePolicyManager.lockNow()`, putting the encrypted app data behind the owner's PIN. It cannot prevent the tray from being opened, erase the phone, or stop a thief who leaves the SIM in place and keeps the screen unlocked. Android has no API that lets a normal app prevent SIM removal.

### Boot and updates

`BootReceiver` listens for `BOOT_COMPLETED` and `MY_PACKAGE_REPLACED`, re-schedules periodic work, and restarts lost mode if it was active. The app does not start before the user unlocks the device for the first time after a reboot, because credential-encrypted storage is unavailable.

### In-app updates

The app asks its paired server for `/api/app/update` at most once every 12 hours, and whenever the owner taps **Check for updates**. The server advertises the latest build from `BEACON_ANDROID_UPDATE_MANIFEST_URL` (a GitHub `releases/latest` response) or from the explicit `BEACON_ANDROID_VERSION`, `BEACON_ANDROID_APK_URL`, and `BEACON_ANDROID_APK_SHA256` variables.

A downloaded APK is accepted only when:

- the URL uses HTTPS (redirects are followed only to other HTTPS URLs),
- the file's SHA-256 matches the advertised checksum,
- the package name and version name match,
- the signing certificate matches the installed app's certificate.

Android then shows its own install confirmation. A sideloaded app cannot install an update silently unless it is a Device Owner or distributed through Play. Configure the update variables on the server; nothing about the update channel is embedded in the APK, so every self-hoster controls their own. The build that first contains this feature (0.1.2) had to be installed manually; 0.1.3 and later update in place.

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
- Geofence names and geometry are cached in app-private preferences so automatic scheduling works offline. They are not written to logs or exported.
- Account links use a PKCE S256 exchange plus an app-side constant-time `state` check. The mobile access token lasts 15 minutes; the rotating refresh token lasts 30 days and is rejected if replayed.
- Account recovery requires a link at least seven days old, `BIOMETRIC_STRONG`, and the account password. The server verifies the password and revokes all other sessions.
- `FLAG_SECURE` on release builds prevents screenshots and screen recording of the app (opt-out in Settings).
- Lock on SIM removal is opt-in and uses device-admin `lockNow()` only after a READY→ABSENT transition. It is a deterrent, not a wipe, and a thief can bypass it by never removing the SIM.
- Only the main activity (launcher and `beacon://` links) and the device-admin receiver are exported. The device-admin receiver requires `BIND_DEVICE_ADMIN`.
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
| `SEND_SMS` | Optional SMS fallback | No SMS fallback |
| `CAMERA` | Requested photo | Photo requests cannot be fulfilled |
| `VIBRATE`, `WAKE_LOCK` | Alarm and reliable work | Reduced alarm effect |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | Prompt only; user decides | OEM battery savers may delay work |
| `REQUEST_INSTALL_PACKAGES` | Open the system installer for a verified update | Updates must be downloaded and installed manually |
| `USE_BIOMETRIC` | Gate a Tier 1 MFA reset behind the device biometric | MFA reset is unavailable on this phone |

The app explains each permission in context. It never requests a permission in the background or enables a capability silently.

---

## 9. Package map

```
dev.beacon.app
├── BeaconApplication.kt      App container, startup, state snapshot
├── MainActivity.kt           Deep links, permission flows, camera, biometric prompt, FLAG_SECURE
├── account/                  PKCE link, token rotation, recovery eligibility, logout
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
./gradlew :app:testDebugUnitTest
./gradlew :app:assembleDebug
./gradlew :app:assembleRelease
./gradlew :app:lintRelease
```

Unit tests cover version comparison for the in-app updater, geofence distance/bearing math, and PKCE verification; there is no instrumentation suite yet. Verification is otherwise a build plus a manual pass. A headless emulator is enough to check rendering and permission flows:

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
| Link approval returns to the app but nothing happens | The callback was opened by another app, or the link expired | Start the link again from the app; approval codes last five minutes |
| "Recovery becomes available after this phone has been linked for 7 days" | The mobile link is newer than the trust period | Keep the phone linked; use recovery codes or email OTP instead |
| "Two-factor authentication is not enabled" | The account has no TOTP or email OTP | Nothing to reset; enable MFA in the browser |
| Linked phones list is empty | No other active devices, or the account link was revoked | Pair the other phone or link this one again |
| Direction arrow does not move | No rotation-vector sensor, or the phone is flat and still | The arrow still points to true north; hold the top of the phone north |
| Check for updates says the server does not publish updates | `BEACON_ANDROID_*` variables are missing | Set the update variables and redeploy |
| Install opens system settings | "Allow installing unknown apps" is off | Allow it for Beacon, return, tap Install again |
| Update download fails its integrity check | Release asset and `.sha256` do not match, or the server is stale | Re-upload both release assets; wait for the manifest cache |
| Queue keeps growing | Server unreachable or certificate invalid | Check the server URL and device clock; verify HTTPS from the browser |

For server-side diagnosis, see [OPERATIONS.md](OPERATIONS.md).
