# API Reference

Beacon exposes a small JSON API over HTTPS. The dashboard and the Android app use the same deployment, but they authenticate differently:

- **Dashboard routes** (`/api/auth/*`, `/api/devices/*`, `/api/settings/*`, `/api/account/*`) use the `HttpOnly` session cookie. State-changing requests must also send an `Origin` header matching `APP_URL` (or a permitted Vercel origin) and `Content-Type: application/json`.
- **Device routes** (`/api/device/*`) use a per-device bearer token. They do not use cookies or Origin checks. The phone has no account password.

There is no API version prefix in `v0.1.0`. Breaking changes will be called out in [CHANGELOG.md](../CHANGELOG.md); additive fields may appear without notice.

---

## Conventions

### Base URL

Use the origin configured in `APP_URL`, for example `https://beacon.example.com`. Never call the API over plain HTTP. The Android client rejects non-HTTPS URLs and redirects.

### Response envelope

Successful JSON responses:

```json
{
  "ok": true,
  "data": { }
}
```

Errors:

```json
{
  "ok": false,
  "error": {
    "code": "invalid_credentials",
    "message": "Invalid email or password.",
    "details": []
  }
}
```

`details` is optional. For validation failures it is an array of `{ "path": "...", "message": "..." }`. Error messages are written for humans and may change; branch on `code` and HTTP status, not on message text.

All API responses set `Cache-Control: no-store, max-age=0` and `Pragma: no-cache`, except the two health endpoints. Photo bytes and exports set additional download/cache headers.

### Content types and limits

| Item | Limit |
| --- | --- |
| JSON request bodies | 64 KB by default |
| Location batches | 256 KB, 1–200 points |
| Photo uploads | 2.1 MB request body; 1.5 MB decoded JPEG |
| Command results | 4,000 characters before truncation |
| Device photo storage | 20 photos per device |

Send `Content-Type: application/json` on every request with a body. A missing or different content type returns `415 unsupported_media_type`.

### Timestamps

Timestamps are RFC 3339 strings in UTC, for example `2026-10-23T14:05:00.000Z`. Device-supplied location timestamps may be at most 10 minutes in the future and 30 days old.

### Status codes

| Status | Meaning |
| --- | --- |
| `200` | Success |
| `201` | Created (geofence) |
| `400` | Malformed request or invalid state |
| `401` | Missing, invalid, expired, or revoked credentials |
| `403` | Origin rejected, or a feature is unavailable |
| `404` | Resource not found or not owned by the caller |
| `405` | Wrong HTTP method |
| `409` | Conflict (device limit, duplicate photo request, already enabled) |
| `410` | Command expired or closed |
| `413` | Body too large |
| `415` | Wrong content type or non-JPEG photo |
| `422` | Schema or business validation failed |
| `429` | Rate limited; inspect `Retry-After` |
| `500` | Unexpected server error |
| `502` | Email provider rejected the message |
| `503` | Cron disabled or health check degraded |

### Rate limits

Limits are fixed-window counters stored in Postgres, so they survive serverless cold starts. A rejected request returns `429 rate_limited` with `Retry-After` in seconds. Identifiers are hashed before storage.

| Bucket | Limit |
| --- | --- |
| Login by IP | 30 / 15 min |
| Login by account | 10 / 15 min |
| Signup by IP | 5 / hour |
| Signup by email | 3 / hour |
| Forgot password by IP | 5 / hour |
| Forgot password by account | 3 / hour |
| Resend verification | 3 / 15 min |
| Email MFA send | 3 / 10 min |
| MFA attempts (TOTP, email, recovery) | 10 / 10 min |
| Pairing code creation | 10 / hour |
| Pairing attempts by IP | 30 / 15 min |
| Device location ingest | 120 / min per device + IP |
| Device heartbeat | 30 / min per device + IP |
| Device command poll | 30 / min per device + IP |
| Device command ack | 60 / min per device + IP |
| Device geofence writes | 20 / min per device + IP |
| Device photo upload | 6 / hour per device |
| Device unpair | 5 / hour per device |
| Dashboard command creation | 30 / min per user |
| Password change | 5 / 15 min |
| Test email | 5 / hour |

Limiter writes fail open if the database is unavailable. Authentication still fails closed.

---

## Dashboard API

### Devices

#### `GET /api/devices`

Returns active (non-revoked) devices for the signed-in user, newest activity first.

```json
{
  "ok": true,
  "data": {
    "devices": [
      {
        "id": "4b0d5a9e-8f11-4d2c-a64e-1f4b7d8c9e01",
        "name": "Pixel 7",
        "manufacturer": "Google",
        "model": "Pixel 7",
        "androidVersion": "16",
        "appVersion": "0.1.0",
        "status": "active",
        "presence": "online",
        "trackingProfile": "balanced",
        "batteryLevel": 72,
        "isCharging": false,
        "networkType": "wifi",
        "simState": "READY",
        "fallbackSmsConfigured": false,
        "lostModeAt": null,
        "pairedAt": "2026-10-20T09:12:00.000Z",
        "lastSeenAt": "2026-10-23T14:02:00.000Z",
        "lastLocationAt": "2026-10-23T14:01:40.000Z",
        "offlineAlertMinutes": 45,
        "lastLocation": {
          "id": 9182,
          "recordedAt": "2026-10-23T14:01:40.000Z",
          "receivedAt": "2026-10-23T14:01:42.000Z",
          "latitude": 51.5072,
          "longitude": -0.1276,
          "accuracyM": 12,
          "altitudeM": 30,
          "speedMps": null,
          "headingDeg": null,
          "batteryLevel": 72,
          "isCharging": false,
          "provider": "gps",
          "networkType": "wifi",
          "isMocked": false,
          "sequence": 418
        }
      }
    ]
  }
}
```

`presence` is derived from `lastSeenAt`: `online` within 15 minutes, `stale` within 24 hours, otherwise `offline`. `status` is `active` or `lost`; revoked devices are omitted.

#### `POST /api/devices/pairing-code`

Creates a single-use pairing invitation. Requires a verified account. Previous unused codes for the user are invalidated.

Request:

```json
{ "deviceName": "Pixel 7" }
```

`deviceName` is optional and currently informational; the app sends its own name when pairing.

Response:

```json
{
  "ok": true,
  "data": {
    "code": "K7QM-3XPD",
    "expiresAt": "2026-10-23T14:15:00.000Z",
    "serverUrl": "https://beacon.example.com",
    "deepLink": "beacon://pair?server=https%3A%2F%2Fbeacon.example.com&code=K7QM-3XPD",
    "qrDataUrl": "data:image/png;base64,..."
  }
}
```

Codes are eight characters from an unambiguous alphabet, displayed as `XXXX-XXXX`, and expire after 10 minutes. The database stores only an HMAC. If the account already has `MAX_DEVICES_PER_USER` devices, the route returns `409 device_limit`.

#### `GET /api/devices/:id`

Returns a dashboard snapshot. Optional query: `range=1h|24h|7d|30d` (default `24h`, invalid values fall back to `24h`).

```json
{
  "ok": true,
  "data": {
    "summary": { "...": "DeviceSummary" },
    "points": [ { "...": "LocationDto" } ],
    "geofences": [ { "...": "GeofenceDto" } ],
    "commands": [ { "...": "CommandDto" } ],
    "range": "24h"
  }
}
```

`points` are ordered oldest to newest and capped at 1,500. `commands` contains the 12 most recent commands. All nested resources are scoped to the caller's user.

#### `PATCH /api/devices/:id`

Updates device settings. At least one field is required.

```json
{
  "name": "Pixel 7",
  "trackingProfile": "high",
  "offlineAlertMinutes": 30,
  "fallbackSmsNumber": "+447700900123"
}
```

| Field | Rules |
| --- | --- |
| `name` | 1–80 characters, control characters stripped |
| `trackingProfile` | `low`, `balanced`, or `high` |
| `offlineAlertMinutes` | Integer 10–10,080 |
| `fallbackSmsNumber` | E.164 (`+` and 7–15 digits); empty string clears it |

Changing `fallbackSmsNumber` encrypts it with AES-256-GCM and AAD `sms:{deviceId}`. The response is `{ "summary": DeviceSummary }`. The device receives the new configuration on its next location upload, heartbeat, or command poll.

#### `DELETE /api/devices/:id`

Revokes a device by default. Add `?purge=true` to delete the row and cascade locations, geofences, commands, photos, and alert state.

```json
{ "ok": true, "data": { "revoked": true, "purged": false } }
```

Revocation takes effect on the next device request (`401`). A revoked device disappears from the dashboard list. Purging is irreversible and also invalidates the device token.

### Locations

#### `GET /api/devices/:id/locations`

Polling endpoint for the map. Query parameters:

| Parameter | Values | Default |
| --- | --- | --- |
| `range` | `1h`, `24h`, `7d`, `30d` | `24h` |
| `since` | RFC 3339 timestamp | none |

Without `since`, returns up to 1,500 points in the range. With `since`, returns up to 500 points recorded after it, for incremental polling. Responses include the current summary even when no new points exist.

```json
{
  "ok": true,
  "data": {
    "points": [ { "...": "LocationDto" } ],
    "summary": { "...": "DeviceSummary" },
    "serverTime": "2026-10-23T14:05:00.000Z",
    "range": "24h",
    "incremental": false
  }
}
```

Invalid queries return `422 invalid_query`. A `since` value more than one minute in the future is rejected.

### Geofences

#### `GET /api/devices/:id/geofences`

Returns all geofences for the device. A device may have at most 20.

#### `POST /api/devices/:id/geofences`

```json
{
  "name": "Home",
  "centerLat": 51.5072,
  "centerLon": -0.1276,
  "radiusM": 250,
  "notifyOnEnter": true,
  "notifyOnExit": true
}
```

| Field | Rules |
| --- | --- |
| `name` | 1–60 characters |
| `centerLat` / `centerLon` | Valid WGS-84 coordinates |
| `radiusM` | Integer 50–50,000 |
| `notifyOnEnter` / `notifyOnExit` | Booleans, default `true` |

Returns `201` with `{ "geofence": GeofenceDto }`. The first location observed after creation establishes a baseline and does not send an alert; only transitions after that do.

#### `PATCH /api/geofences/:id`

Accepts any subset of `name`, `centerLat`, `centerLon`, `radiusM`, `notifyOnEnter`, `notifyOnExit`. Changing geometry clears the cached inside/outside state so the next observation re-baselines without an alert.

#### `DELETE /api/geofences/:id`

Deletes the fence and cascades its events. Returns `{ "deleted": true }`.

There is also `DELETE /api/devices/:id/geofences?geofenceId=...`, which behaves the same after checking that the fence belongs to the device. The `/api/geofences/:id` form is preferred for new clients.

### Commands

#### `GET /api/devices/:id/commands`

Returns the 20 most recent commands, newest first.

#### `POST /api/devices/:id/commands`

Queues a remote action. Requires a verified account.

```json
{ "type": "RING" }
```

`MESSAGE` additionally requires `message` (1–200 characters):

```json
{ "type": "MESSAGE", "message": "Please call this number." }
```

Allowed types:

| Type | Effect on the device | Notes |
| --- | --- | --- |
| `LOCATE_NOW` | Takes a high-accuracy fix, queues it, then flushes | Fails if no provider or permission |
| `RING` | Starts the alarm and alarm notification | Can be silenced on the device |
| `LOST_MODE_ON` | Enables lost mode, starts the foreground service if Android permits, starts a 60-second alarm | Dashboard status changes immediately; execution is confirmed by the device |
| `LOST_MODE_OFF` | Disables lost mode, stops the service and alarm | |
| `LOCK_DEVICE` | Calls `DevicePolicyManager.lockNow()` | Requires device-admin; otherwise `unsupported` |
| `CAPTURE_PHOTO` | Posts a photo-request notification and waits | Never silent; requires a person to open the app |
| `MESSAGE` | Shows a notification and stores the message for the lost screen | 200 characters |
| `SYNC_NOW` | Acknowledges, then immediately flushes the queue | |

Commands expire after 24 hours. The server returns:

```json
{
  "ok": true,
  "data": {
    "command": {
      "id": "a3d5e1a2-06c4-4a1d-9a24-2f7b90cc0a11",
      "type": "RING",
      "status": "pending",
      "message": null,
      "createdAt": "2026-10-23T14:06:00.000Z",
      "deliveredAt": null,
      "completedAt": null,
      "result": null
    },
    "label": "Sound alarm"
  }
}
```

`LOST_MODE_ON` / `LOST_MODE_OFF` update the device row in the same request. Other actions are optimistic: the dashboard shows "pending" until the device acknowledges.

### Photos

#### `GET /api/devices/:id/photos`

Returns metadata for up to 40 recent photos, newest first. Image bytes are not included.

```json
{
  "ok": true,
  "data": {
    "photos": [
      {
        "id": "df6c2a54-0f8e-4a2d-9a43-1f6f2b7e9912",
        "capturedAt": "2026-10-23T13:55:00.000Z",
        "width": 960,
        "height": 1280,
        "byteSize": 184233,
        "url": "/api/devices/4b0d5a9e-8f11-4d2c-a64e-1f4b7d8c9e01/photos/df6c2a54-0f8e-4a2d-9a43-1f6f2b7e9912"
      }
    ]
  }
}
```

#### `GET /api/devices/:id/photos/:photoId`

Returns decrypted JPEG bytes. The query joins through `devices.userId`; a photo belonging to another account is a `404`, not a `403`. Headers include:

```
Content-Type: image/jpeg
Cache-Control: private, no-store, max-age=0
Content-Disposition: inline; filename="beacon-<photoId>.jpg"
X-Content-Type-Options: nosniff
X-Robots-Tag: noindex, nofollow
```

#### `DELETE /api/devices/:id/photos/:photoId`

Deletes one photo. Returns `{ "deleted": true }`.

Photos are also deleted automatically after 30 days and when a device exceeds 20 stored images. Purging a device cascades its photos.

### Auth

All auth mutations require a trusted `Origin` and JSON content type except where noted. Responses intentionally do not reveal whether an email address exists.

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| `POST` | `/api/auth/signup` | `{ name, email, password }` | Generic "check your inbox" message; `422` for policy failures |
| `POST` | `/api/auth/login` | `{ email, password }` | `{ mfaRequired, redirect }` or `{ mfaRequired: true, methods, email }` |
| `POST` | `/api/auth/logout` | none | Clears the session; `{ redirect: "/" }` |
| `POST` | `/api/auth/verify-email` | `{ token }` | Verifies the address |
| `POST` | `/api/auth/resend-verification` | `{ email }` | Generic message |
| `POST` | `/api/auth/forgot-password` | `{ email }` | Generic message |
| `POST` | `/api/auth/reset-password` | `{ token, password }` | Updates password, revokes all sessions |
| `POST` | `/api/auth/password` | `{ currentPassword, newPassword }` | Changes password, revokes other sessions |
| `GET` | `/api/auth/sessions` | none | Lists active sessions |
| `DELETE` | `/api/auth/sessions/:id` | none | Revokes one session |
| `POST` | `/api/auth/mfa/totp/setup` | none | `{ secret, uri, qrDataUrl }` |
| `POST` | `/api/auth/mfa/totp/enable` | `{ code }` | Enables TOTP; returns 10 recovery codes once |
| `POST` | `/api/auth/mfa/totp/disable` | `{ password, code }` | Disables TOTP and deletes recovery codes |
| `POST` | `/api/auth/mfa/totp` | `{ code }` | Completes an MFA login |
| `POST` | `/api/auth/mfa/email/send` | `{}` | Sends a 6-digit code; returns masked email |
| `POST` | `/api/auth/mfa/email/verify` | `{ code }` | Completes an MFA login |
| `POST` | `/api/auth/mfa/email/toggle` | `{ enabled, password }` | Enables/disables email OTP |
| `POST` | `/api/auth/mfa/recovery` | `{ code }` | Completes an MFA login with a single-use code |
| `POST` | `/api/auth/mfa/recovery/regenerate` | `{ password }` | Replaces all recovery codes |

Login example:

```bash
curl -sS https://beacon.example.com/api/auth/login \
  -H 'Origin: https://beacon.example.com' \
  -H 'Content-Type: application/json' \
  -c cookies.txt \
  -d '{"email":"owner@example.com","password":"correct horse battery staple"}'
```

MFA challenge cookies are separate from session cookies, short-lived, and cannot access app routes. TOTP codes have a ±1 step window and a monotonic replay guard. Email codes allow five verification attempts and expire after 10 minutes. Recovery codes are stored as keyed hashes and become invalid when used.

### Account and settings

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| `GET` | `/api/account/export` | none | JSON attachment with account, devices, locations, geofences, commands, audit activity |
| `DELETE` | `/api/account` | `{ password, confirmation: "DELETE" }` | Deletes the account and cascades user data |
| `PATCH` | `/api/settings/profile` | `{ name, timezone? }` | Updated public user |
| `PATCH` | `/api/settings/notifications` | `{ notifyGeofence, notifyOffline, notifyLowBattery, notifySecurity }` | Saved preferences |
| `GET` | `/api/settings/email` | none | Provider configuration, default priority, user priority, 8 recent delivery logs |
| `PATCH` | `/api/settings/email` | `{ priority }` | `default`, `relay_first`, `resend_first`, `relay_only`, `resend_only` |
| `POST` | `/api/settings/email/test` | `{}` | Sends a test to the signed-in address; returns the provider used |

The export is capped at 20,000 locations and 1,000 commands. It is generated synchronously and marked `no-store`. Account deletion removes the user row; devices, locations, geofences, commands, photos, sessions, and tokens cascade. Email delivery logs keep the recipient and provider metadata with `user_id` set to null for abuse investigation, then age out after 90 days.

---

## Device API

All device routes require:

```http
Authorization: Bearer bc_dev_<random-token>
Accept: application/json
```

The server hashes the token with `AUTH_SECRET` and compares it to `devices.token_hash`. The token is scoped to one device row. Revoked devices and deleted users receive `401`. There are no cookies and no Origin requirement. The Android client refuses non-HTTPS URLs, redirects, userinfo, query strings, and fragments in the server URL.

### `POST /api/device/pair`

Unauthenticated; consumes a pairing code.

```json
{
  "code": "K7QM-3XPD",
  "name": "Pixel 7",
  "manufacturer": "Google",
  "model": "Pixel 7",
  "androidVersion": "16",
  "appVersion": "0.1.0"
}
```

`code` is 6–16 characters after normalization; the app sends eight. `name` is required, 1–80 characters. Optional metadata is truncated server-side.

```json
{
  "ok": true,
  "data": {
    "deviceId": "4b0d5a9e-8f11-4d2c-a64e-1f4b7d8c9e01",
    "token": "bc_dev_...",
    "serverTime": "2026-10-23T14:10:00.000Z",
    "ownerName": "Alex",
    "deviceName": "Pixel 7"
  }
}
```

The token is returned exactly once. Store it immediately in an Android Keystore–sealed preference and never log it. Invalid, expired, already-used, or unverified-account codes all return `400 invalid_pairing_code`. The device limit returns `409 device_limit`.

### `POST /api/device/locations`

Uploads a batch and claims pending commands in the same round trip.

```json
{
  "points": [
    {
      "id": "0f26e1c4-6aef-4d63-9d8f-3d2a1b7c4e10",
      "recordedAt": "2026-10-23T14:09:30.000Z",
      "latitude": 51.5072,
      "longitude": -0.1276,
      "accuracyM": 12.5,
      "altitudeM": 30,
      "speedMps": null,
      "headingDeg": null,
      "batteryLevel": 72,
      "isCharging": false,
      "provider": "gps",
      "networkType": "wifi",
      "isMocked": false,
      "sequence": 419
    }
  ]
}
```

Validation:

- 1–200 points, 256 KB maximum.
- `id` is a client-generated UUID used for idempotency.
- `latitude` −90..90, `longitude` −180..180, `accuracyM` 0..100,000.
- Timestamps must not be more than 10 minutes in the future or 30 days old; invalid points are skipped, not rejected.
- `sequence` is a client-side monotonic counter for debugging.

Response:

```json
{
  "ok": true,
  "data": {
    "accepted": 1,
    "duplicates": 0,
    "skipped": 0,
    "commands": [ { "...": "DeviceCommand" } ],
    "config": {
      "trackingProfile": "balanced",
      "lostMode": false,
      "offlineAlertMinutes": 45,
      "fallbackSmsNumber": null,
      "geofences": [
        {
          "id": "7c2a4e6f-1b3d-4a5c-8e9f-0a1b2c3d4e5f",
          "name": "Home",
          "centerLat": 51.5072,
          "centerLon": -0.1276,
          "radiusM": 250
        }
      ],
      "serverTime": "2026-10-23T14:10:00.000Z"
    }
  }
}
```

`accepted` counts new rows returned by the insert. `duplicates` counts rows suppressed by the unique `(device_id, client_point_id)` constraint. `skipped` counts points rejected by timestamp validation. The device may safely delete the batch when the HTTP request succeeds; duplicate uploads are harmless.

Ingest updates `lastSeenAt`, latest battery/network state, clears the offline alert, evaluates geofences after the response, and may send a low-battery alert. Up to eight pending commands are claimed and returned.

### `POST /api/device/heartbeat`

Updates device state without a location fix and claims commands.

```json
{
  "batteryLevel": 68,
  "isCharging": false,
  "networkType": "cellular",
  "simState": "READY",
  "fcmToken": "optional-fcm-token",
  "appVersion": "0.1.0",
  "androidVersion": "16"
}
```

All fields are optional. An `fcmToken` is encrypted with AAD `fcm:{deviceId}`. A SIM state transition can trigger a SIM-change email, subject to a six-hour suppression window.

Response:

```json
{
  "ok": true,
  "data": {
    "commands": [ { "...": "DeviceCommand" } ],
    "config": { "...": "RuntimeConfig" },
    "serverTime": "2026-10-23T14:10:00.000Z"
  }
}
```

### `GET /api/device/commands`

Polls for pending commands. Returns the same `commands` and `config` shape as heartbeat. Claiming marks rows `delivered` and returns at most eight, oldest first. The Android lost-mode service polls every two minutes; WorkManager covers the baseline and may be much slower.

### `POST /api/device/commands/ack`

Acknowledges a command. Only `pending` and `delivered` commands can be closed.

```json
{
  "commandId": "a3d5e1a2-06c4-4a1d-9a24-2f7b90cc0a11",
  "status": "completed",
  "result": { "message": "Alarm started." }
}
```

`status` is `completed`, `failed`, or `unsupported`. `result` is free-form JSON, truncated to `{ "truncated": true }` if its serialized form exceeds 4,000 characters. Unknown, already-closed, or other-device commands return `404 not_found`.

Do not acknowledge `CAPTURE_PHOTO` as completed when the request is merely shown. The server completes it when the photo is uploaded. If the person dismisses the request, the app sends `unsupported`; if it expires locally, the app sends `failed`.

### `GET|POST|DELETE /api/device/geofences`

The paired app manages only the fences that belong to the device presenting the token. There is no device id parameter; the server derives it from the bearer token.

`GET` returns `{ "geofences": [Geofence] }`. `POST` creates one:

```json
{
  "name": "Home",
  "centerLat": 51.5072,
  "centerLon": -0.1276,
  "radiusM": 250,
  "notifyOnEnter": true,
  "notifyOnExit": true
}
```

`name` is 1–60 characters, coordinates are finite and in range, and `radiusM` is 50–50,000. A device can have at most 20 fences; the 21st returns `409 geofence_limit`. Creation returns `201` with `{ "geofence": Geofence }`.

`DELETE` takes `?id=<uuid>` and returns `{ "deleted": true }`. A fence that belongs to another device returns `404 not_found`, not `403`, so ids cannot be probed. Both writes are rate-limited and audited with `via: "android"`.

The runtime config includes the same geometry so the app can adapt its automatic check-in interval without another round trip.

### `POST /api/device/photos`

Uploads a foreground-captured photo and completes the bound `CAPTURE_PHOTO` command.

```json
{
  "commandId": "a3d5e1a2-06c4-4a1d-9a24-2f7b90cc0a11",
  "capturedAt": "2026-10-23T13:55:00.000Z",
  "mimeType": "image/jpeg",
  "dataBase64": "/9j/4AAQSkZJRgABAQ...",
  "width": 960,
  "height": 1280
}
```

Rules:

- `mimeType` must be `image/jpeg`.
- The decoded image must start with `FF D8 FF` and be 200 bytes–1.5 MB.
- `width` and `height` are accepted for client compatibility but ignored. The server decodes the image with a 36-megapixel ceiling, applies EXIF orientation, downscales to fit 1920×1920, and re-encodes it as JPEG. EXIF, ICC and any appended data are discarded before the image is stored.
- `capturedAt` must be within the last 24 hours and not more than 10 minutes in the future.
- The command must belong to the device, be `CAPTURE_PHOTO`, and be `pending` or `delivered`.
- A command that is already completed returns `409 already_uploaded`; expired/closed commands return `410`.
- Uploads are limited to six per device per hour.

Response: `{ "photoId": "..." }`.

The server encrypts the sanitized bytes with AES-256-GCM and AAD `photo:{deviceId}`, inserts the row using the dimensions it measured, marks the command completed, and trims the oldest photos beyond 20. It also writes an audit entry.

### `POST /api/device/unpair`

Revokes the calling device. Body: `{}` (JSON content type required). Returns `{ "revoked": true }`. The Android app calls this before clearing local state; if the network fails, it still clears local data and the dashboard can revoke the device.

---

## Operational endpoints

### `GET /api/health/live`

Liveness probe. Does not touch the database.

```json
{ "status": "ok" }
```

Returns `200` with `Cache-Control: no-store`.

### `GET /api/health`

Readiness probe. Executes `select 1` against Postgres.

```json
{ "status": "ok", "service": "beacon", "time": "2026-10-23T14:10:00.000Z" }
```

Returns `503` with `{ "status": "degraded", "service": "beacon" }` if the database is unreachable. These two endpoints deliberately do not use the `{ ok, data }` envelope.

### `GET|POST /api/cron/maintenance`

Protected by `Authorization: Bearer <CRON_SECRET>`. `CRON_SECRET` must be at least 24 characters. If it is unset, the route returns `503 cron_disabled`; a wrong or missing token returns `401`.

The route is idempotent and safe to call frequently. It:

1. Deletes expired sessions, pending MFA challenges, email tokens/codes, pairing codes, and rate-limit rows.
2. Deletes locations older than `LOCATION_RETENTION_DAYS`.
3. Deletes photos older than 30 days.
4. Deletes audit logs older than `AUDIT_RETENTION_DAYS` and email logs older than 90 days.
5. Deletes geofence events older than 180 days.
6. Marks stale `pending`/`delivered` commands `expired`.
7. Sends offline alerts and returns the count.

```json
{
  "ok": true,
  "data": { "ranAt": "2026-10-23T03:00:00.000Z", "alertsSent": 1 }
}
```

Schedule it every 5–15 minutes with an external scheduler when using Vercel Hobby; the built-in cron runs only once per day. Never put the secret in a query string.

---

## Error codes

| Code | Typical status | Meaning |
| --- | --- | --- |
| `invalid_json` | 400 | Body is not valid JSON |
| `validation_error` | 422 | Zod validation failed; inspect `details` |
| `method_not_allowed` | 405 | Wrong HTTP method |
| `unsupported_media_type` | 415 | Content type is not JSON |
| `payload_too_large` | 413 | Body exceeds the route limit |
| `origin_required` | 403 | Mutation has no `Origin` header |
| `origin_rejected` | 403 | Origin or `Sec-Fetch-Site` is not trusted |
| `unauthorized` | 401 | No valid web session or device token |
| `invalid_credentials` | 401 | Wrong email/password, or account locked |
| `mfa_expired` | 401 | MFA challenge expired or too many attempts |
| `invalid_code` | 401 | TOTP, email OTP, or recovery code rejected |
| `method_unavailable` | 403 | Requested MFA method is not enabled |
| `invalid_token` | 400 | Email verification/reset token invalid or used |
| `weak_password` | 422 | Password policy failure |
| `breached_password` | 422 | Password found in HIBP |
| `invalid_password` | 400 | Current password was wrong |
| `already_enabled` | 409 | TOTP already enabled |
| `not_enabled` | 409 | TOTP not enabled |
| `setup_required` | 400 | TOTP setup must start first |
| `invalid_pairing_code` | 400 | Code invalid, expired, used, or account unverified |
| `device_limit` | 409 | Account reached `MAX_DEVICES_PER_USER` |
| `not_found` | 404 | Resource missing or not owned by caller |
| `rate_limited` | 429 | Rate limit exceeded; see `Retry-After` |
| `invalid_query` | 422 | Location query is invalid |
| `geofence_limit` | 409 | More than 20 geofences on one device |
| `command_expired` | 410 | Command TTL elapsed |
| `command_closed` | 410 | Command is not pending/delivered |
| `already_uploaded` | 409 | Photo command already completed |
| `invalid_photo` | 422 | Empty/oversized image |
| `unsupported_photo` | 415 | Bytes are not JPEG |
| `invalid_capture_time` | 422 | Photo timestamp outside the 24-hour window |
| `email_delivery_failed` | 502 | No provider accepted the message |
| `cron_disabled` | 503 | `CRON_SECRET` is not configured |
| `internal_error` | 500 | Unexpected failure; check server logs |

---

## Worked flows

### Pair an Android device

```bash
# 1. Dashboard creates a code (session cookie required)
curl -sS https://beacon.example.com/api/devices/pairing-code \
  -H 'Origin: https://beacon.example.com' \
  -H 'Content-Type: application/json' \
  -b cookies.txt \
  -d '{}'

# 2. App exchanges it for a device token
curl -sS https://beacon.example.com/api/device/pair \
  -H 'Content-Type: application/json' \
  -d '{"code":"K7QM-3XPD","name":"Pixel 7"}'
```

The app stores `token` in the Keystore and uses it for every subsequent request. The dashboard never sees the token again.

### Upload an offline batch and receive commands

```bash
curl -sS https://beacon.example.com/api/device/locations \
  -H "Authorization: Bearer $BEACON_DEVICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"points":[{"id":"0f26e1c4-6aef-4d63-9d8f-3d2a1b7c4e10","recordedAt":"2026-10-23T14:09:30.000Z","latitude":51.5072,"longitude":-0.1276,"accuracyM":12.5}]}'
```

If the response is successful, delete those queue rows locally. If the request times out after the server committed, retry: the `(device_id, client_point_id)` constraint turns the retry into `duplicates`.

### Trigger and acknowledge a ring

```bash
curl -sS https://beacon.example.com/api/devices/$DEVICE_ID/commands \
  -H 'Origin: https://beacon.example.com' \
  -H 'Content-Type: application/json' \
  -b cookies.txt \
  -d '{"type":"RING"}'

# The device claims it on its next upload/heartbeat/poll, then:
curl -sS https://beacon.example.com/api/device/commands/ack \
  -H "Authorization: Bearer $BEACON_DEVICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"commandId":"'$COMMAND_ID'","status":"completed","result":{"message":"Alarm started."}}'
```

---

## Compatibility notes

- Field additions are non-breaking. Clients should ignore unknown fields.
- `CAPTURE_PHOTO` is intentionally human-in-the-loop. A server-side or app-side attempt to capture without a foreground user action is unsupported, not a bug.
- `fallbackSmsNumber` is returned only to the authenticated device, decrypted from `devices.fallback_sms_enc`. It is never included in dashboard responses, which expose only `fallbackSmsConfigured`.
- Location history is returned in ascending time order for map rendering; command history is newest first.
- The Android client is the reference device implementation. A future iOS or Windows client can implement the same seven device endpoints without changes to the server contract.
