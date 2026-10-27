# Beacon — Implementation Plan

This is the working plan for the first public release. It records what was built, why the architecture looks the way it does, and what remains before a `1.0` tag. It is deliberately specific: a future maintainer should be able to see which decisions were intentional and which are still open.

- **Target release:** `v0.1.0` (self-hosted beta)
- **Platforms:** Android 8.0+ now; Windows and iOS later
- **Reference deployment:** Vercel Hobby + Neon Free + OpenFreeMap
- **License:** AGPL-3.0-or-later

---

## 1. Product scope

### In scope for `v0.1.0`

1. **Location history** that survives connectivity gaps and device reboots, at a configurable cadence.
2. **Last-known location** preserved when the device is offline; no empty dashboard.
3. **Remote actions**: locate, ring, lock, lost mode, owner message, force sync, photo request.
4. **Lost mode** with a visible lost screen, alarm, elevated tracking cadence, and foreground service where Android permits it.
5. **Best-effort SMS fallback** when mobile data is unavailable and the owner configured a number.
6. **Geofences** with enter/exit evaluation, deduplicated events, and notifications.
7. **User-mediated evidence photo** capture — no covert camera, no background capture.
8. **Accounts and MFA** with email verification, password reset, TOTP, email OTP, and recovery codes.
9. **Email delivery** through Relay and/or Resend with automatic failover and a per-user priority.
10. **Operational surfaces**: health checks, maintenance cron, audit log, rate limits, retention.

### Explicitly out of scope

- Remote wipe, password extraction, or device-erase commands.
- Covert audio, camera, screen, or keylogging.
- iOS and Windows clients (schema and API are platform-neutral, but no clients ship).
- Silent SIM-change lockout. SIM state is reported; Android does not allow an app to prevent the change.
- A guaranteed alarm after a factory reset. A reset erases the app and its token.
- Hosted multi-tenant SaaS. This is self-hosted software.
- Payment, subscriptions, or a managed control plane.

---

## 2. Architecture decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Web framework | Next.js 15.5 App Router | Server components keep secrets server-side; one deploy target; route handlers are enough for the API |
| Hosting | Vercel Hobby | Zero-cost reference deployment; cron and preview deployments included |
| Database | Neon Postgres + Drizzle | Serverless-friendly pooled driver; typed schema; SQL migrations checked into the repo |
| Map | MapLibre GL JS + OpenFreeMap | No API key, no per-load billing; two free styles; Google Maps link for directions |
| Android UI | Kotlin + Jetpack Compose | Native permissions, foreground service, Keystore, WorkManager; no WebView shell |
| Android networking | `HttpURLConnection` + `org.json` | Small dependency surface; HTTPS-only; no Retrofit/OkHttp metadata to leak |
| Device auth | Pairing code → per-device bearer token | The phone never holds an account password; revocation is per device |
| Web auth | Opaque sessions + Argon2id | No JWT revocation problem; memory-hard hashing |
| Field encryption | AES-256-GCM with AAD | Protects TOTP secrets, SMS numbers, FCM tokens, and photo bytes at rest |
| Photo capture | Foreground, user-mediated | Android blocks background camera access; pretending otherwise would be dishonest |
| Email | Relay + Resend abstraction | Self-hosted first, managed fallback; per-user routing; delivery logs |
| Theme | Cookie-driven light/dark/system | No inline theme script; CSP-friendly and SSR-stable |

### Why not Firebase as the primary backend?

Firebase would shorten the first version, but it makes self-hosting, data residency, and a clean AGPL release harder. Beacon instead uses an ordinary Postgres database and an HTTP API that a future iOS/Windows client can consume.

### Why not Google Maps?

The Google Maps SDK requires billing and API-key restrictions that are awkward for a free, self-hosted project. MapLibre renders OpenFreeMap vector tiles without a key. “Open in Google Maps” remains a plain link.

### Why not silent photo capture?

Android requires the app to be in the foreground for camera access. A hidden capture path would either be blocked or rely on an exploit. Beacon shows a notification, asks the person holding the device to open the app, and reports `unsupported` if nobody does.

---

## 3. Data model

17 tables, all created by Drizzle migrations in `drizzle/`:

| Group | Tables |
| --- | --- |
| Identity | `users`, `sessions`, `pending_mfa`, `email_tokens`, `email_codes`, `recovery_codes` |
| Pairing | `pairing_codes`, `devices` |
| Telemetry | `locations`, `geofences`, `geofence_events` |
| Control | `commands`, `device_photos`, `device_alert_state` |
| Operations | `audit_logs`, `email_logs`, `rate_limits` |

Design notes:

- Device tokens are stored as HMAC-SHA-256 hashes, never plaintext.
- `locations` has a unique `(device_id, client_point_id)` constraint so retries are idempotent.
- `commands` expire after 24 hours; the cron marks stale `pending`/`delivered` rows `expired`.
- `device_photos.command_id` is nullable and `ON DELETE SET NULL`, so photo retention is independent of command cleanup.
- Photo bytes are encrypted with AAD `photo:{deviceId}` and stored as text; the API returns them only after an ownership join.
- `rate_limits` is a database table rather than in-memory state, so limits survive serverless cold starts.

---

## 4. Delivery phases

### Phase 1 — Foundations (complete)

- Next.js, TypeScript strict mode, Tailwind v4 design tokens.
- Drizzle schema and three migrations.
- Environment validation, DB client, crypto helpers, request helpers.
- Password hashing, TOTP, rate limiting, audit logging.
- Email provider abstraction, templates, delivery logs.
- Health endpoints.

**Exit criteria:** `npm run typecheck`, `npm run lint`, and `npm run build` pass; migrations apply to an empty Postgres database.

### Phase 2 — Accounts and sessions (complete)

- Signup, login, logout, email verification, resend verification.
- Password reset with single-use tokens.
- TOTP setup/enable/disable, email OTP, recovery codes, MFA challenge.
- Session listing and revocation; password change revokes other sessions.
- Account export and deletion.
- Settings for profile, notifications, security, and email delivery.

**Exit criteria:** every auth path has a rate limit, an audit event, and a generic error message that does not reveal whether an account exists.

### Phase 3 — Devices and tracking (complete)

- Pairing-code creation and consumption; QR/deep-link payload.
- Per-device bearer tokens; authentication scoped to one device row.
- Location ingest with batching, deduplication, validation, geofence evaluation.
- Heartbeat with battery, network, SIM state, and runtime config.
- Command queue, claim, acknowledgement, expiry.
- Device list, detail, settings, activity feed, and unpair/purge.

**Exit criteria:** a device can pair, upload a location, receive a command, acknowledge it, and be revoked without affecting another account.

### Phase 4 — Android app (complete for `v0.1.0`)

- Compose pairing screen, home dashboard, lost screen, permission checklist.
- Encrypted preferences and encrypted SQLite queue.
- WorkManager periodic sync; foreground service in lost mode.
- Boot receiver and scheduler rehydration.
- Ring/alarm, device-admin lock, owner message, locate, sync.
- Photo request notification and camera capture pipeline.
- SMS fallback and battery/profile prompts.
- Deep link `beacon://pair`.

**Exit criteria:** debug APK builds; pairing, home, photo request, and lost-mode screens render on an API 36 emulator without a crash.

### Phase 5 — Photos (complete)

- `device_photos` table and encrypted binary helpers.
- Device upload endpoint with JPEG magic-byte check, 1.5 MB cap, 24-hour capture window, and command binding.
- Dashboard list/image/delete routes with ownership checks.
- Photos tab with polling, lightbox, download, and delete.
- Per-device cap of 20, 30-day cron retention.
- Honest confirmation copy in the dashboard and app.

**Exit criteria:** upload completes the command; image fetch is authenticated and `no-store`; a photo from another account is a 404.

### Phase 6 — Brand, docs, release (complete for `v0.1.0`)

- Brand mark, icons, PWA metadata, OG image.
- Legal pages, security page, 404/error/loading states.
- Architecture, threat model, deployment, API, Android, email, operations, limitations, roadmap.
- CI, license, contribution policy, security policy.
- Final personal-data audit and clean commit.

**Exit criteria:** no personal information in the repository; all checks pass; a new self-hoster can deploy from the README without private context.

Phase completion reflects implemented code and local build verification. Database-backed paths (migrations, auth, pairing, ingest, commands, photos) have not been exercised against a live Postgres instance in this environment; see section 7 and [docs/LIMITATIONS.md](docs/LIMITATIONS.md).

---

## 5. Security requirements

These are release blockers, not aspirations:

- [x] Passwords hashed with Argon2id and a unique salt.
- [x] Session and device tokens stored only as hashes.
- [x] TOTP secret, SMS number, FCM token, and photo bytes encrypted at rest.
- [x] MFA challenge tokens are single-use, short-lived, and attempt-limited.
- [x] State-changing requests require a trusted `Origin` and JSON content type.
- [x] CSP with a per-request nonce; no `unsafe-inline` scripts.
- [x] Rate limits for login, signup, reset, pairing, ingest, commands, photos.
- [x] Device revocation is immediate for API authentication.
- [x] Photo responses are `private, no-store` and ownership-checked.
- [x] Android release builds set `FLAG_SECURE` and disable backups.
- [ ] Independent security review (not yet commissioned).
- [ ] Automated dependency updates via Dependabot (config added; enable alerts in repository settings).

---

## 6. Known gaps and next steps

Ordered by user risk, not by implementation difficulty:

1. **FCM on Android.** The server can send pushes, but the app does not register a token yet. Commands are therefore bounded by WorkManager (15–60 minutes) or the lost-mode poll (2 minutes). Implement Firebase Messaging, token upload in heartbeat, and a high-priority data message that triggers an immediate sync.
2. **End-to-end testing with a live database.** Current tests are unit-level. Add a disposable Postgres service to CI and exercise pairing → ingest → command → ack → photo.
3. **Android instrumentation tests.** Add Compose UI tests for pairing validation, lost screen, and photo request.
4. **Foreground-service start policy.** Lost mode can be enabled while the app is backgrounded; Android 12+ may refuse the FGS start. Surface a notification action that opens the app so the service can start in the foreground.
5. **SIM-change response.** The app reports SIM state and the server can email a SIM-change alert, but the phone cannot lock itself on removal. Add a local notification and document the limit; do not claim remote lockout.
6. **Photo retry semantics.** A failed upload leaves the pending command in place. Add a retry queue with backoff and a user-visible failure state.
7. **Accessibility audit.** Verify focus order, contrast, and screen-reader labels on both platforms.
8. **Internationalization.** UI strings are English-only; externalize them before adding locales.
9. **Windows and iOS clients.** Reuse the device API; do not fork the server contract.
10. **Independent penetration test** before recommending Beacon for high-risk users.

---

## 7. Verification log

Last full local run (2026-10-24):

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `npm test` | Pass — 40 tests, 5 files |
| `npm run build` | Pass — 58 routes |
| `./gradlew :app:assembleDebug` | Pass |
| `./gradlew :app:assembleRelease` | Pass — unsigned APK without `keystore.properties` |
| `./gradlew :app:lintRelease` | Pass — 0 errors, 36 warnings |
| Emulator (API 36.1, Pixel 7) | Pairing, home, photo request, lost mode render; no crash |
| Live database flows | Not run — no production credentials in the repo |

The checks were run on 2026-10-24 from the repository root after `npm ci`; `package-lock.json` pins the dependency graph and the Gradle versions are pinned in `android/`.

---

## 8. Release checklist

- [ ] Rotate every secret used during development.
- [ ] Confirm `APP_URL` is the final HTTPS origin.
- [ ] Apply migrations to production with a backup in place.
- [ ] Configure Relay and/or Resend; send a test email from Settings.
- [ ] Configure `CRON_SECRET` and an external scheduler (5–15 minute cadence).
- [ ] Build and sign the release APK with a keystore that is not in the repo.
- [ ] Host the APK at a stable HTTPS URL and set `NEXT_PUBLIC_APK_URL`.
- [ ] Run the [security review checklist](SECURITY.md#hardening-checklist).
- [ ] Verify the repository contains no personal domains, emails, keystores, or `.env` files.
- [ ] Tag `v0.1.0` and publish release notes from [CHANGELOG.md](CHANGELOG.md).
