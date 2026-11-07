# Changelog

All notable changes to Beacon are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

Because Beacon handles location data and device control, security-relevant changes are called out explicitly.

---

## 0.1.7 — 2026-11-07

### Added

- **Instant fence alerts.** Automatic mode with at least one fence can run a lightweight foreground watcher. It requests a coarse fix about every two minutes, compares it with the cached fence geometry, and uploads immediately when the inside/outside state changes. It is opt-out because it keeps a persistent notification visible.
- **Independent inside and outside intervals.** Automatic mode now exposes both values. Each can follow the dashboard profile or override it with 1, 2, 5, 10, 15, 30, 60, or 120 minutes. Fixed intervals remain available at 1, 2, 5, 10, 15, 30, 60, and 120 minutes and are still obeyed exactly.
- **Per-device app-access revocation.** Device Settings → Danger zone → Revoke app access signs the phone out of Find My and recovery on its next request without unpairing it or stopping tracking.
- **Immediate browser-session logout.** The dashboard checks session liveness every 30 seconds and when the tab regains focus. A session revoked from another browser redirects to sign-in with an explanation instead of looking active.
- **Read-only lost-mode status screen.** The phone shows state, last contact, queue, permissions, profile, and server host without exposing settings, account, unpair, or sibling-device controls.
- **15-minute control worker.** When no foreground service runs, a separate worker polls commands, sends the heartbeat, and checks the mobile link without requesting a location fix.

### Changed

- **A local fence crossing now triggers an immediate upload.** The tracking service compares each fresh fix with the cached fences, so an enter/exit email no longer waits for the next scheduled check-in. New or changed geometry resets the baseline so the first fix cannot create a false crossing.
- Heartbeats are no longer skipped just because the location queue is non-empty. A command poll makes a request even when no location and no heartbeat are due.
- Lost mode is enforced by the server, not only by the Compose overlay: mobile authentication and refresh, device geofence writes, and self-unpair return `403 device_lost`. Location ingest, heartbeat, command acknowledgement, and photo upload remain available so tracking and recovery still work.
- The maintenance cron retries geofence emails that were never delivered (last 24 hours, at most 50 per run) and reports `geofenceRetries`.
- The completed `v0.1.6` implementation plan was replaced by the `v0.1.7` plan and removed with this release.

### Fixed

- Geofence enter/exit emails could be delayed by a full check-in interval, or lost when the notification call failed after ingest.
- Lost mode could be bypassed from the device to reach the full home screen, sibling devices, settings, or unpair.
- The command poll could run for ten minutes without a request when neither a location flush nor a heartbeat was due.
- The automatic interval card exposed only the outside value; the inside value was fixed by profile.
- Fixed-interval and outside-fence dialogs omitted the supported 1 and 2 minute options.

### Security

- Revoking a browser session now signs that tab out within about 30 seconds instead of waiting for navigation.
- A lost device cannot use its mobile account link to read sibling locations or reset MFA, and cannot change fences or unpair itself. Blocked attempts are audited as `device.lost_blocked`.
- `DELETE /api/devices/:id/app-access` is owner-scoped, same-origin, and CSRF-protected like the other dashboard mutations.
- No new server environment variable is required.

### Migration

- No database migration is required. `v0.1.7` uses existing tables and columns.

### Verification

- Android unit tests — 23 pass (`PkceTest` 4, `GeofenceMathTest` 7, `TrackingIntervalsTest` 8, `VersionComparisonTest` 4).
- `npm run typecheck`, `npm run lint`, `npm test` (57 tests), and `npm run build` — pass.
- Android `assembleDebug`, `assembleRelease`, and `lintRelease` — pass.
- Release APK: versionCode 8, versionName 0.1.7, 24,943,207 bytes, SHA-256 `a639d62fbbca5ed89e6991ccd513a928725140f3af4e469bb5f134225220f74e`, signed with the existing Beacon certificate (`a2eb5d82…f53df4`). Release builds include `arm64-v8a` and `armeabi-v7a`.

---

## 0.1.6 — 2026-11-05

### Fixed

- **Check for updates now shows its result where the button is.** The last outcome stays under the button — update available, already up to date, the server does not publish Android updates, or the error — instead of relying on a transient snackbar. A manual check that finds a build scrolls the update card into view and also announces it with a snackbar. Previously the offer was inserted above the fold with no immediate feedback, so checking from the bottom of the long home screen looked like it did nothing.
- A browser reconnect approval opened from a signed-out session now survives sign-in. The middleware records the real same-origin path in a server-only header, and the app layout forwards it as a validated `next` value, so the challenge, state, and install hash are not dropped at `/login`.
- Middleware tests assert that the forwarded path cannot be spoofed by a client-supplied header and is not exposed on the response.

### Changed

- `versionCode` is 7 and `versionName` is `0.1.6`.
- No database migration or new server environment variable is required for this release.

### Verification

- Android unit tests — 20 pass (`PkceTest`, `GeofenceMathTest`, `TrackingIntervalsTest`, `VersionComparisonTest`).
- Release APK: versionCode 7, versionName 0.1.6, 24,943,099 bytes, SHA-256 `c5c9c8a01fd24d4326eb0845cd8a8742a68565c76f17e9c1c9a632b9e301af53`, signed with the existing Beacon certificate (`a2eb5d82…f53df4`). Release builds include `arm64-v8a` and `armeabi-v7a`.
- `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` — pass.

---

## 0.1.5 — 2026-11-02

### Added

- **Account-centric reconnect after reinstall.** The pairing screen now offers **Reconnect this phone**. It opens a browser approval page that lists the account's linked devices, confirms which physical phone is being restored, and returns a 10-minute, single-use code through `beacon://reconnected`. The app exchanges the code with PKCE S256 plus an install-fingerprint check, rotates the device token, restores tracking immediately, and receives a fresh narrow mobile session so Find My works without a second approval.
- **Install fingerprints prevent duplicate devices.** The app sends a SHA-256 hash of `ANDROID_ID`, the signing certificate, and the package name. Pairing or reconnecting claims the matching active device row instead of creating another one, so history, geofences, and commands survive a reinstall.
- **Map-drawn geofences.** The app's fence editor is now a full-screen MapLibre map. Tap to move the centre, drag the orange radius handle, or use the slider and presets from 50 m to 5 km. The old preset-only dialog is removed.
- **Configurable outside-fence check-in.** Automatic mode exposes the interval actually used outside every fence: follow the profile or 5, 10, 15, 30, 60, or 120 minutes. The check-in card shows the effective inside and outside values.
- **Server reconnect API.** `POST /api/device/reconnect/approve` and `POST /api/device/reconnect/exchange`; install hashes on pairing; `device_reconnect_codes`; a partial unique index on `(user_id, install_hash)`; browser reconnect page at `/app/reconnect`.
- **Pure interval and identity helpers** (`TrackingIntervals.kt`, `InstallIdentity.kt`) with JVM tests.

### Changed

- **Protection layout fixed.** Checklist rows are wrapped in a `Column` instead of being passed directly to `Surface`, which had stacked the title, description, and action at the same origin.
- Pairing now sends `installHash` and reports `reconnected`. A re-pair keeps the existing row but does not restore the mobile account link; reconnect does.
- Pair and reconnect rotate the device credential and revoke the row's previous mobile sessions.
- The maintenance cron now removes expired mobile link codes, device reconnect codes, and expired or revoked mobile sessions.
- `versionCode` is 6 and `versionName` is `0.1.5`.

### Security

- Reconnect codes are 10 minutes, single-use, HMAC-stored, and bound to the PKCE challenge, callback state, and install fingerprint. The browser must be signed in and same-origin; the verifier and fingerprint never leave the phone.
- A device row that already carries a different install fingerprint is never overwritten (`409 install_mismatch` / `install_in_use`). Legacy rows without a fingerprint require explicit owner confirmation in the browser.
- Revoked rows retain their fingerprint for audit but release it when the same install pairs again, so a normal reinstall is not blocked by history.
- Reconnect restores the mobile session with the same `devices:read account:recover` scope; it never elevates the device token.

### Fixed

- Protection cards no longer overlap at the top of the home screen.
- The check-in card now reports the configured outside-fence interval instead of repeating the inside value, and its foreground-service warning follows the interval actually in effect.
- Reinstalling or re-pairing no longer creates a duplicate device or leaves location tracking off.

### Migration

- `drizzle/0004_faithful_vivisector.sql` adds `devices.install_hash`, the partial unique index `devices_install_uq`, and the `device_reconnect_codes` table. Apply it with migration `0003` before deploying 0.1.5.

### Verification

- `npm run lint`, `npm run typecheck`, `npm test` (54 tests), and `npm run build` — pass.
- `npm audit --omit=dev` — 0 vulnerabilities.
- Android unit tests — 20 pass (`PkceTest`, `GeofenceMathTest`, `TrackingIntervalsTest`, `VersionComparisonTest`).
- Release APK: versionCode 6, versionName 0.1.5, 24,943,099 bytes, SHA-256 `d97939f8e474761748e6a31c8ccc358fb24d33e601a66ca772242303940b265e`, signed with the existing Beacon certificate (`a2eb5d82…f53df4`). Release builds include `arm64-v8a` and `armeabi-v7a`; the debug APK keeps all four ABIs for emulators.

---

## 0.1.4 — 2026-10-30

### Added

- **Linked phones and Find My.** A paired phone can be linked to its Beacon account through a browser approval page. The app lists every active device on the account with presence, battery, and latest fix, and shows distance plus a true-north compass arrow to another device. Maps hand-off uses `geo:` with an OpenStreetMap fallback.
- **Tier 1 MFA recovery.** A linked phone can reset a lost authenticator after seven continuous days, a `BIOMETRIC_STRONG` prompt, and the account password. The reset removes TOTP, email OTP, and recovery codes, requires new enrollment on the next web sign-in, revokes every web session and every other linked phone, keeps the performing phone linked, and emails the owner.
- **Mobile account API.** `POST /api/mobile/link/approve`, `POST /api/mobile/auth/exchange|refresh|logout`, `GET /api/mobile/devices`, `GET /api/mobile/devices/:id/location`, `GET|DELETE /api/mobile/sessions`, and `POST /api/mobile/recovery/mfa-reset`.
- **Linked phones card in Security settings**, with per-link revocation and recovery eligibility.
- **Forced MFA enrollment** at `/mfa/setup` after a reset, including a one-time recovery-code display.

### Changed

- Login redirects to `/mfa/setup` when the account has `mfaEnrollmentRequired`; only the enrollment routes accept that session until a new factor is enabled.
- The mobile session is narrower than the device token: `devices:read account:recover`, no commands, no settings, no history, no photos.
- The Android app now depends on `androidx.fragment` for biometric `FragmentActivity` support.

### Security

- Link codes are single-use, expire after five minutes, and are stored as HMACs. PKCE S256 keeps the verifier on the phone; the app compares the callback `state` in constant time before exchanging the code.
- Access tokens last 15 minutes; refresh tokens last 30 days and rotate on every use. Replaying a rotated token revokes the session family. A failed refresh with 401 clears the local link; a network failure keeps it.
- Re-linking a device revokes any previous mobile session for that device, so an orphaned token family cannot outlive the link the owner sees on the phone.
- Link approval verifies that the device belongs to the signed-in user. A wrong `state` does not clear a legitimate pending link; only expiry or a server error does.
- Recovery requires a link at least seven days old, verifies the password server-side, and revokes all web and other mobile sessions. It is not available from a pairing token and does not change the password.
- Unlink clears local tokens before the best-effort server logout, so an unreachable server cannot leave a usable refresh token behind.
- Schema adds `mobile_sessions`, `mobile_link_codes`, `users.mfa_enrollment_required`, and `users.mfa_reset_at` in migration `drizzle/0003_lethal_gravity.sql`.

### Verification

- `npm run typecheck`, `npm run lint`, `npm test` (7 files, 49 tests), and `npm run build` — pass.
- `npm audit` — 0 vulnerabilities.
- `./gradlew :app:testDebugUnitTest :app:lintRelease :app:assembleRelease -PbeaconBaseUrl=https://beacon.example.com` — pass; 15 Android unit tests.
- Release APK: versionCode 5, versionName 0.1.4, signed with the existing Beacon key, and scanned for personal strings before publication.

---

## 0.1.3 — 2026-10-29

### Added

- Geofences can be created for the current location and deleted from the Android app. The device token is scoped to one device, and the server caps a device at 20 fences.
- Automatic check-in adapts to the cached fence geometry: `low` 60/30, `balanced` 60/15, `high` 30/15 minutes inside/outside a fence. Fixed intervals are obeyed exactly.
- Opt-in **Lock on SIM removal** using device admin. A READY→ABSENT transition calls `lockNow()`; it is a deterrent, not a remote wipe.

### Changed

- Runtime device configuration now includes fence geometry so the app can schedule without another request.

### Fixed

- Leaving lost mode now restores periodic work instead of leaving the phone with no scheduled check-in.
- SIM-state reads no longer crash on devices that lack telephony support.

### Security

- Removed the unused `READ_PHONE_STATE` permission. Android exposes SIM state to the manifest receiver without it.
- Fence names and geometry stay in app-private storage with backups disabled.

---

## 0.1.2 — 2026-10-28

### Added

- In-app Android updates: the paired server exposes `/api/app/update`, the app checks it every 12 hours and from Settings, and the APK is accepted only after an HTTPS download, SHA-256 match, package/version check, and signing-certificate match against the installed app.
- Update card and one-tap system installer flow. Sideloaded builds still require Android's install confirmation.

---

## 0.1.1 — 2026-10-28

### Added

- User-selectable check-in interval: Automatic or a fixed 1, 2, 5, 15, 30, or 60 minutes. Intervals under 15 minutes use a foreground service; the rest use WorkManager.
- Opt-in screenshots while secure-by-default `FLAG_SECURE` remains on.
- Immediate queue flush when connectivity returns or the SIM state changes.

### Fixed

- Protection card overlap on the Android home screen.
- Dashboard map worker loading.

---

## 0.1.0 — 2026-10-24

The first self-hosted release: a complete web dashboard, device API, and native Android client. Source-complete and build-verified; not independently audited. Read [docs/LIMITATIONS.md](docs/LIMITATIONS.md) before production use.

### Added

#### Web dashboard

- Next.js 15 App Router application with a warm bone/ink design system, light/dark/system themes, and a responsive app shell.
- Marketing, pricing-free landing, security, privacy, terms, and status pages.
- Dashboard with device list, live map, location history, activity feed, commands, geofences, photos, and settings.
- MapLibre GL JS with free OpenFreeMap `positron` and `dark` styles; no map API key. "Open in Google Maps" hand-off for directions.
- PWA metadata, install prompt, icons, and Open Graph image.
- Generated brand mark, favicon set, and app icons from `npm run icons`.

#### Accounts and authentication

- Email/password signup with Argon2id hashing via `hash-wasm`.
- Email verification with 24-hour single-use tokens and resend limits.
- Password reset with 60-minute single-use tokens; all other sessions are revoked on reset.
- Opaque 256-bit sessions stored as HMAC-SHA-256 hashes, with `HttpOnly`, `Secure`, `SameSite=Lax`, and `__Host-` cookies in production.
- Session listing, revocation, and "sign out everywhere".
- TOTP MFA with replay protection, email OTP, and ten single-use recovery codes.
- Pending-MFA challenge tokens that are short-lived and attempt-limited.
- Password change flow that verifies the current password and revokes other sessions.
- Account data export as JSON and cascading account deletion.
- Security notification emails for password, MFA, and new-login events.

#### Devices and tracking

- One-use, 10-minute pairing codes with HMAC storage and atomic consumption.
- QR code and `beacon://pair` deep link generation.
- Per-device bearer tokens, HMAC-hashed at rest, with immediate revocation.
- Batched location ingest with per-point UUID deduplication, coordinate validation, timestamp checks, and a 200-point/256 KB limit.
- Last-known location preserved when a device is offline.
- Heartbeat with battery, charging, network, SIM state, app version, and Android version.
- Runtime device configuration: tracking profile, lost mode, offline threshold, and encrypted SMS fallback number.
- Commands: locate, ring, lock, lost mode on/off, owner message, sync, and photo request; 24-hour expiry and acknowledgement states.
- Geofences with enter/exit evaluation, baseline suppression, deduplicated events, and optional email alerts.
- Offline, low-battery, and SIM-change alerts with per-device cooldowns and user opt-in.
- Device activity feed, location range filters, and CSV/JSON export.

#### Photos

- Foreground, user-mediated photo request flow; no covert camera.
- Device upload with JPEG magic-byte validation, 1.5 MB cap, 24-hour capture window, and command binding.
- AES-256-GCM encryption at rest with per-device AAD.
- Dashboard Photos tab with polling, lightbox, authenticated download, and delete.
- Per-device cap of 20 photos and 30-day retention.

#### Email

- Provider abstraction for Relay and Resend with per-user priority: relay-first, resend-first, relay-only, resend-only.
- One retry on retryable statuses (`408`, `425`, `429`, `5xx` and network errors), then failover to the next configured provider. Failover also occurs after a permanent rejection, unless a single-provider mode is selected.
- Inline-styled HTML and plain-text templates for verification, reset, security, MFA, geofence, offline, low-battery, SIM-change, test, and account-deletion messages.
- Delivery log with provider, status, latency, and truncated error; 90-day retention.
- Development logging when no provider is configured, disabled in production.

#### Security and operations

- AES-256-GCM field encryption with context-bound AAD for TOTP secrets, SMS numbers, FCM tokens, and photos.
- Database-backed fixed-window rate limits for auth, pairing, ingest, heartbeat, commands, photos, and test email.
- Trusted-origin and JSON content-type checks on state-changing requests.
- Strict CSP with a per-request nonce and `strict-dynamic`; HSTS, `nosniff`, frame denial, and a restrictive permissions policy.
- Append-only audit log with hashed IPs and user agents; configurable retention.
- Maintenance cron for expired sessions, tokens, pairing codes, rate limits, commands, locations, photos, email logs, geofence events, and audit rows, plus offline alerts.
- Health endpoints: `/api/health/live` and `/api/health`.
- Environment validation at boot with ranges for retention and session policy.
- `vercel.json` daily cron, GitHub Actions CI, and Dependabot configuration.

#### Android

- Native Kotlin 2.2.21 / Jetpack Compose app for Android 8.0+ (API 26), targeting API 36.
- Pairing screen with manual code, server override, and deep-link/QR prefill.
- Home screen with protection checklist, queue status, last sync, lost mode, and manual locate/sync.
- WorkManager periodic tracking with low/balanced/high profiles (60/30/15 minutes).
- Lost-mode foreground location service with 30-second updates, 2-minute command polling, alarm, and persistent notice.
- Encrypted SQLite offline queue (5,000-point cap, 200-point batches, ordered upload, duplicate-safe).
- Android Keystore AES-GCM for the device token, queue payloads, SMS number, and owner message.
- Commands for locate, sync, ring, lost mode, message, lock (device admin), and photo request.
- User-mediated camera capture with EXIF rotation, downsampling, JPEG compression, and temp-file cleanup.
- AndroidX `ExifInterface` for metadata parsing, avoiding the platform parser's known bugs on older releases.
- Blocking release lint (`abortOnError`) and a lint step in CI.
- Optional SMS fallback with a 15-minute floor and 10-minute fix-age limit.
- Boot and package-replacement receiver; scheduler rehydration; lost-mode restart.
- HTTPS-only `HttpURLConnection` client with no redirects, cookies, or token logging.
- `FLAG_SECURE` release builds, backups disabled, and a minimal exported surface.
- Optional release signing from `android/keystore.properties`.

#### Documentation

- `README.md`, `IMPLEMENTATION_PLAN.md`, and docs for architecture, threat model, API, deployment, Android, email, operations, limitations, and roadmap.
- Security policy, contribution guide, code of conduct, third-party notices, and AGPL-3.0-or-later license.
- `.env.example` with generation commands and placeholders only.
- Sanitized examples throughout; no production domain, email, or credential in the repository.

### Security notes

- Device tokens, session tokens, pairing codes, email tokens, and recovery codes are stored only as keyed hashes.
- TOTP secrets, SMS numbers, FCM tokens, and photos use AES-256-GCM with unique AAD contexts.
- All device traffic is HTTPS with redirect rejection; the app trusts only system CAs.
- The repository contains no personal domain or credential. Local integration notes are ignored.
- Known residual risks are documented in [SECURITY.md](SECURITY.md) and [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md). No independent audit has been performed.

### Verification

- `npm run typecheck` — pass.
- `npm run lint` — pass.
- `npm test` — 40 tests across 5 files.
- `npm run build` — pass, 58 routes.
- `./gradlew :app:assembleDebug :app:assembleRelease` — pass; release APK is unsigned without `keystore.properties`.
- `./gradlew :app:lintRelease` — pass; 0 errors, 36 warnings.
- Emulator (API 36.1, Pixel 7): pairing, home, photo request, and lost-mode screens render without a crash.

### Known limitations

- FCM is not wired into the Android app; command latency is bounded by periodic sync or lost mode.
- No live-database end-to-end tests in CI.
- No Android unit or instrumentation tests yet.
- No physical-device field test or independent security audit.
- Photo uploads have no durable retry queue.
- Offline alerts depend on an external scheduler for sub-daily cadence.

See [docs/LIMITATIONS.md](docs/LIMITATIONS.md) and [docs/ROADMAP.md](docs/ROADMAP.md).
