# Architecture

Beacon is three cooperating systems: a stateless Next.js application, a Postgres database, and a native Android client. The server owns identity, authorization, policy, and history. The phone owns acquisition, short-term offline storage, and execution of remote actions. No server component ever needs a persistent process, which is what makes the free Vercel/Neon deployment practical.

---

## System map

```
┌───────────────────────────────┐
│ Web browser                   │
│ React 19 + MapLibre           │
│ cookies (HttpOnly, SameSite)  │
└───────────────┬───────────────┘
                │ HTTPS, same-origin
┌───────────────▼─────────────────────────────────────────────┐
│ Next.js 15 on Vercel                                        │
│                                                             │
│  middleware.ts       per-request CSP nonce, security headers│
│  app/                landing, security, privacy, terms      │
│  app/(auth)          login, signup, reset, MFA              │
│  app/app             dashboard, devices, settings, activity │
│  app/api/auth/*      sessions, TOTP, email OTP, recovery    │
│  app/api/devices/*   dashboard-scoped device operations     │
│  app/api/device/*    token-scoped device ingestion/actions  │
│  app/api/cron/*      retention + offline alerts             │
│                                                             │
│  lib/auth            sessions, MFA, device bearer tokens    │
│  lib/data            typed queries, DTO mapping             │
│  lib/email           Relay/Resend, templates, failover      │
│  lib/device          command claim, runtime config          │
│  lib/crypto          Argon2id, AES-256-GCM, HMAC, tokens    │
└───────────────┬─────────────────────────────────────────────┘
                │ pooled TLS (Neon serverless driver)
┌───────────────▼───────────────┐
│ Neon Postgres                 │
│ 20 tables, encrypted fields   │
│ encrypted photo payloads      │
│ DB-backed rate limits         │
└───────────────────────────────┘
                ▲
                │ HTTPS bearer token
┌───────────────┴───────────────────────────────┐
│ Android app (Kotlin, Compose, minSdk 26)      │
│                                               │
│  WorkManager  ── periodic sync, retry/backoff │
│  FGS          ── lost mode live tracking      │
│  QueueStore   ── encrypted SQLite outbox      │
│  ApiClient    ── HttpURLConnection, HTTPS only│
│  CommandHandler ── ring, lock, message, photo │
│  Keystore     ── token + queue + SMS at rest  │
└───────────────────────────────────────────────┘
```

---

## Request lifecycles

### Web page request

1. `middleware.ts` generates a 128-bit nonce and sets `Content-Security-Policy` on both the forwarded request and the response.
2. A server component calls `requireVerifiedUser()` (or `requireUser()`), which reads the session cookie and joins `sessions` → `users`.
3. Data helpers (`src/lib/data/*`) query through the pooled Neon driver and map rows to DTOs. Password hashes and TOTP secrets are never included in session objects.
4. Client components hydrate and use `fetch` to same-origin API routes. Mutations include JSON content type and are checked against the trusted origin.
5. The root layout reads the `beacon_theme` cookie and emits `<html class="dark">` when appropriate. There is no blocking inline theme script.

### Login

```
POST /api/auth/login
  ├─ rate limit by IP and by account
  ├─ normalize email, look up active user
  ├─ Argon2id verify
  ├─ failure: increment counter, lock after 10 failures for 15 minutes
  ├─ success but MFA enabled:
  │    ├─ create pending_mfa row (10 min, attempt-limited)
  │    └─ set short-lived MFA cookie, return "mfa_required"
  ├─ success and no MFA:
  │    └─ create opaque session token, store HMAC only, set HttpOnly cookie
  └─ audit + reset failure counter
```

MFA verification creates the real session. TOTP codes are checked with a ±1 step window and a monotonic `totp_last_step` guard, so a captured code cannot be replayed. Recovery codes are single-use rows; email codes allow five attempts and are consumed atomically.

### Device pairing

```
Dashboard: POST /api/devices/pairing-code
  → 8-character code (Crockford-style alphabet), 10-minute TTL, HMAC stored
  → QR/deep link: beacon://pair?server=https://host&code=XXXXXXXX

Android: POST /api/device/pair { code, name, ..., installHash }
  → consume code atomically
  → if installHash matches an active device row, reuse it (reconnected)
  → otherwise generate bc_dev_<256-bit token>
  → store HMAC(token) in devices.token_hash
  → return token once, plus deviceId, owner name, and reconnected flag
  → Android seals the token with an Android Keystore AES-GCM key
```

The install hash is a SHA-256 over `ANDROID_ID`, the app signing certificate,
and the package name. It is stable across reinstall and app update but changes
with a different signing key or a factory reset. A partial unique index on
`(user_id, install_hash)` makes duplicates impossible under a race.

### Reinstalling and reconnecting

```
Android: beacon://reconnect?server=https://host
  → open <APP_URL>/app/reconnect?device=<id>&challenge=<S256>&state=<random>&install=<hash>
Browser (signed in): confirm which linked device this phone is
  → POST /api/device/reconnect/approve { deviceId, challenge, state, installHash }
  → bind install hash to a legacy row; reject a different phone's hash
  → create a 10-minute, single-use reconnect code
  → return beacon://reconnected?code=...&state=...

Android: POST /api/device/reconnect/exchange { code, verifier, state, installHash }
  → verify state, PKCE S256, and install hash
  → rotate the device token
  → create a fresh narrow mobile session (devices:read account:recover)
  → return device token plus mobile access/refresh tokens
```

Reconnect reuses the same `devices` row, so history, geofences, and commands
survive. The browser never sends an account password to the phone, and the
install fingerprint never leaves the phone except as the opaque hash. A
pairing code issued from the dashboard also reuses the row when the install
hash matches, but only reconnect restores the account link.

The token is scoped to one device row. There is no account password on the phone, so a compromised device cannot list other devices or change account settings. Revocation is a single column update; the next API request returns `401` and the app wipes its local queue. The owner can also revoke one device's separate mobile (Find My and recovery) sessions without stopping its tracking, and revoke an individual browser session; each is checked on the next request.

### Location ingest

```
Android SyncEngine
  ├─ collect a fix when permitted and not command-poll-only
  ├─ enqueue encrypted JSON in SQLite
  ├─ POST /api/device/locations { points: [...] }  (max 200, 256 KB)
  │    ├─ validate coordinates, timestamps (10 min future skew, 30 day age)
  │    ├─ sort ascending, insert with ON CONFLICT DO NOTHING
  │    ├─ update device lastSeen/lastLocation/battery/network
  │    ├─ mark offline alert resolved
  │    ├─ after(): geofences + low-battery notification
  │    └─ claim up to 8 pending commands, return them with runtime config
  └─ delete acknowledged queue rows, then execute returned commands
```

`client_point_id` is generated on the phone. Retries after a timeout therefore insert nothing new: the count comes back as `duplicates` and the client still deletes the batch. The queue deletes rows only after a successful HTTP response, so a crash between upload and delete is safe.

Geofence evaluation is server-side on ingest, but the phone keeps an encrypted cache of fence geometry. In Automatic mode with the default **Instant fence alerts**, a foreground watcher compares about every two-minute fix with that cache and uploads on a transition, so the server sees the event without waiting for the next scheduled check-in. If the watcher is off or Android refuses the service, the transition is noticed at the next check-in. The watcher is opt-out because it requires a persistent notification.

### Command lifecycle

```
pending ──claim──▶ delivered ──ack──▶ completed
   │                   │
   │                   ├──a deferred command (CAPTURE_PHOTO) stays delivered
   │                   │  until the photo is uploaded or the request expires
   └──expiry──▶ expired ◀──expiry──┘
```

- A dashboard POST inserts the row and calls FCM if a token exists (server-side only; the v0.1.7 Android client does not register a token).
- The device claims commands on every location upload, heartbeat, and polling cycle. Lost mode polls every two minutes, the instant-fence watcher every five minutes, and a control worker every 15 minutes when no foreground service runs.
- `claimPendingCommands` updates `pending → delivered` in the same transaction window as the read, so two concurrent claims cannot both return the same row in practice.
- The Android handler returns an ack with `completed`, `failed`, `unsupported`, or `deferred`.
- Lost-mode status changes immediately in the dashboard; execution is still confirmed by the device. The UI says so explicitly.
- Commands expire after 24 hours. The maintenance cron marks stale rows expired.

### Photo request

```
Dashboard POST CAPTURE_PHOTO
  → command row (24 h)
  → device claims it
  → CommandHandler stores pendingPhoto { commandId, expiresAt }
  → notification: "Photo requested"
  → the person opens Beacon and taps Take photo
  → system camera intent → FileProvider URI
  → PhotoProcessor: EXIF rotate, scale to 1280 px, JPEG q82, ≤1.4 MB
  → POST /api/device/photos { commandId, capturedAt, width, height, base64 }
  → server: JPEG magic bytes, size, capture window, command ownership
  → AES-256-GCM encrypt with AAD photo:{deviceId}, insert device_photos
  → mark command completed, delete older photos beyond 20 per device
  → dashboard polls /api/devices/:id/photos and decrypts on demand
```

The command is acknowledged by the photo upload, not by the request handler. If nobody opens the app, it expires and the dashboard shows `expired`. There is no background camera path.

---

## Data model

### Identity and sessions

| Table | Purpose | Sensitive columns |
| --- | --- | --- |
| `users` | Account, preferences, MFA state | `password_hash`, `totp_secret_enc` |
| `sessions` | Opaque web sessions | `token_hash` |
| `pending_mfa` | Between password and second factor | `token_hash` |
| `email_tokens` | Verify-email and reset links | `token_hash` |
| `email_codes` | Six-digit email OTP | `code_hash` |
| `recovery_codes` | Single-use MFA recovery | `code_hash` |

### Devices and telemetry

| Table | Purpose | Notes |
| --- | --- | --- |
| `pairing_codes` | One-use pairing invitations | 10-minute TTL |
| `devices` | Device identity, config, revocation | `token_hash`, `install_hash`, `fallback_sms_enc`, `fcm_token_enc` |
| `mobile_sessions` | Narrow account link from a phone | access/refresh HMACs, rotation history |
| `mobile_link_codes` | Browser-approved phone link | 5-minute TTL, single use |
| `device_reconnect_codes` | Browser-approved reinstall recovery | 10-minute TTL, single use |
| `locations` | Breadcrumb history | unique `(device_id, client_point_id)` |
| `geofences` | Circles with enter/exit flags | `last_inside` caches state |
| `geofence_events` | Deduplicated transitions | 180-day retention |
| `commands` | Remote action queue | 24-hour TTL |
| `device_photos` | Encrypted JPEG evidence | 20/device, 30-day retention |
| `device_alert_state` | Suppression windows for alerts | one row per device |

### Operations

| Table | Purpose | Retention |
| --- | --- | --- |
| `audit_logs` | Security-relevant actions | `AUDIT_RETENTION_DAYS` (365 default) |
| `email_logs` | Provider, status, latency, error | 90 days |
| `rate_limits` | Fixed-window counters | 2 days after window |

Indexes are chosen for the two dominant reads: latest location per device, and locations in a time range for one device. `locations_device_time_idx` covers both the dashboard range query and the `since` poll. `sessions_token_uq` makes session lookup an index hit.

---

## Security boundaries

### Browser ↔ Next.js

- HttpOnly, `SameSite=Lax`, `Secure` when `APP_URL` is HTTPS.
- Production cookie names use the `__Host-` prefix.
- Every state-changing handler calls `assertTrustedOrigin` and `assertContentType`.
- CSP: no inline scripts; `connect-src` is restricted to self and OpenFreeMap; `object-src 'none'`; `frame-ancestors 'none'`.
- `X-Frame-Options: DENY`, HSTS, `nosniff`, strict referrer policy, restrictive permissions policy.

### Next.js ↔ Postgres

- TLS is required by the Neon connection string.
- Only server modules import `db`; `server-only` guards prevent accidental client bundling.
- Secrets are validated at boot. `ENCRYPTION_KEY` must decode to exactly 32 bytes.
- AES-GCM uses a unique 96-bit IV per encryption and AAD that binds ciphertext to its owner (`totp:{userId}`, `sms:{deviceId}`, `fcm:{deviceId}`, `photo:{deviceId}`).

### Phone ↔ Next.js

- HTTPS only. The URL parser rejects `http`, userinfo, query strings, and fragments.
- No redirects: a `3xx` is treated as a failure, preventing token leakage to another host.
- No cookies, no WebView, no logging of Authorization headers or coordinates.
- `FLAG_SECURE` on release builds blocks screenshots and recents thumbnails.
- Backups are disabled; the token and queue are additionally encrypted with a non-exportable Keystore key.
- Reinstall recovery binds a SHA-256 install fingerprint to one device row. A row that already carries a different fingerprint is never overwritten, so one phone cannot claim another phone's history.

### Trust boundaries and non-goals

The server trusts a device's reported location subject to validation and a mocked-location flag. It cannot cryptographically prove that a coordinate is genuine; a rooted or modified client can lie. Beacon is an anti-theft aid and a location history tool, not a cryptographic evidence system. See [THREAT_MODEL.md](THREAT_MODEL.md).

---

## Frontend structure

```
src/components/
  marketing/       hero, feature sections, footer, brand mark
  auth/            login, signup, reset, MFA, verification clients
  app/             shell, sidebar, device tabs, settings pages
  map/             MapLibre wrapper with styles, markers, geofence circles
  ui/              button, badge, dialog, field, toast, copy button
```

- **Theme:** CSS custom properties in `globals.css`; `.dark` overrides. The cookie is read on the server, so there is no flash of the wrong theme.
- **Map:** `maplibre-gl` is dynamically imported inside the client component. Styles come from `NEXT_PUBLIC_MAP_STYLE_LIGHT/DARK`; markers are DOM elements, and the map fits bounds when the point set changes.
- **Polling:** the device detail page polls locations every 20 seconds, commands every 25 seconds, photos every 20 seconds while the Photos tab is open. Polling is paused by unmounting effects when the tab changes.
- **State:** local React state plus server-rendered initial snapshots. There is no global store; the app shell is small enough that prop drilling is clearer.

---

## Android structure

```
dev.beacon.app/
  BeaconApplication.kt     container, state snapshot, scheduler boot
  MainActivity.kt          permissions, camera intent, deep links
  core/                    prefs, Keystore crypto, state model
  data/                    queue, device status reader, point model
  location/                sampler, WorkManager scheduler
  tracking/                lost-mode foreground service
  sync/                    sync engine, command handler
  network/                 HTTPS client, API models
  notifications/           channels, alarm, actions
  security/                device admin
  sms/                     best-effort fallback
  media/                   photo processing, alarm player
  work/                    worker + boot receiver
  ui/                      Compose screens, theme, components
```

Key design choices:

- **No DI framework.** `AppContainer` is constructed once in `Application`; workers and services reach it through the application cast. This keeps startup predictable and avoids reflection in release builds.
- **No Room.** The offline queue is one table with a hand-written `SQLiteOpenHelper`. The payload is already encrypted JSON; an ORM would add code without adding safety.
- **No Retrofit.** A handful of endpoints and one JSON envelope do not justify the dependency. Timeouts, redirect rejection, and response-size limits are explicit.
- **Foreground service only in lost mode or the opt-out fence watcher.** A permanent tracking notification is a battery and privacy cost that most users do not need. WorkManager handles the baseline, and a 15-minute control worker covers command latency when no service runs.
- **State is a snapshot.** `BeaconState` is rebuilt from preferences and the queue count; there is no long-lived in-memory state to drift after process death.

---

## Serverless considerations

- **Cold starts:** Argon2id runs in WASM; the module is cached by the runtime. Hashing is intentionally expensive (~100–300 ms) and only happens on auth paths.
- **Connections:** `@neondatabase/serverless` uses HTTP/WebSocket pooling, so there is no per-instance pool to exhaust.
- **Cron:** Vercel Hobby allows one run per day. The maintenance route is idempotent and safe to call from an external scheduler every 5–15 minutes. `CRON_SECRET` is mandatory when configured; the route returns `503` if it is absent.
- **`after()`:** geofence and alert work runs after the ingest response, keeping device uploads fast while still completing on Vercel.
- **Photo size:** request bodies are capped at ~2.1 MB and photos at 1.5 MB, staying under serverless body limits and keeping Postgres row sizes reasonable. Photos are not served through the Next.js image optimizer; the API route decrypts and returns bytes with `no-store`.

---

## Scaling notes

The current design comfortably handles a personal or small-family deployment (tens of devices, a few fixes per minute). For larger deployments:

1. Partition `locations` by month or device and archive cold partitions.
2. Move photo bytes to object storage with per-object encryption, keeping only metadata in Postgres.
3. Replace polling with FCM (Android) and server-sent events or WebSockets (web).
4. Add a queue for geofence/notification evaluation if `after()` work starts timing out.
5. Add read replicas for dashboard history queries.

None of these are required for the reference free-tier deployment.
