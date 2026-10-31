# Changelog

All notable changes to Beacon are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

Because Beacon handles location data and device control, security-relevant changes are called out explicitly.

---

## Unreleased

Nothing yet. Planned work is tracked in [docs/ROADMAP.md](docs/ROADMAP.md).

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
