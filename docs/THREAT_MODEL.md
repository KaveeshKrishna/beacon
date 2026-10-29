# Threat Model

This document describes what Beacon protects, who it protects against, and where the limits are. It is written for self-hosters and contributors, not as a marketing page. If a control is not implemented, it is listed under residual risk rather than implied.

**Last reviewed:** October 2026, for `v0.1.0`.

---

## 1. Assets

| Asset | Sensitivity | Where it lives |
| --- | --- | --- |
| Account password | Critical | Argon2id hash in `users.password_hash`; plaintext only in transit and browser memory |
| Web session | Critical | Opaque token in an HttpOnly cookie; HMAC in `sessions.token_hash` |
| Device bearer token | Critical | Android Keystore–sealed preference; HMAC in `devices.token_hash` |
| TOTP secret / recovery codes | Critical | AES-GCM ciphertext / HMAC hashes; plaintext shown once |
| Location history | High | `locations` rows; TLS to Neon; no field-level encryption |
| Evidence photos | High | AES-GCM ciphertext in `device_photos.data_enc` |
| SMS fallback number | High | AES-GCM ciphertext in `devices.fallback_sms_enc` |
| Email addresses | Medium | `users.email`, `email_logs.to_email`; needed for delivery |
| Device metadata | Medium | Model, Android version, battery, network, SIM state |
| Audit trail | Medium | `audit_logs`, hashed IP and user agent |
| Configuration secrets | Critical | Vercel environment variables; never in the repo |

---

## 2. Adversaries

### A. Opportunistic thief

Has the unlocked or locked phone, may remove the SIM, may reboot it, may not know the owner. Wants to keep or resell the device.

**What Beacon does:** continues last-known location, sends an SMS fallback if configured and data is unavailable, shows a lost screen and alarm, accepts a remote lock when device admin is enabled, and keeps location history available to the owner.

**What it cannot do:** survive a factory reset, prevent a determined thief from powering off or disabling the app in settings, or guarantee a fix indoors or without power.

### B. Network attacker

Can observe or modify traffic between the phone/browser and the server.

**Mitigations:** TLS everywhere, HSTS, HTTPS-only Android client, redirect rejection, no userinfo in server URLs, strict CSP, no third-party scripts, `no-store` on sensitive responses, session cookies with `Secure`/`HttpOnly`/`SameSite`.

**Residual:** a compromised system CA, or a rooted device with a modified trust store, can still intercept TLS. User-installed CAs are not trusted because the app trusts system CAs only. Certificate pinning is not implemented because it would complicate self-hosting and rotation.

### C. Account attacker

Has a password (phishing, reuse, breach) and wants device history or control.

**Mitigations:** Argon2id, account and IP rate limits, 10-failure/15-minute lockout, optional TOTP and email OTP, single-use recovery codes, session listing and revocation, password change revokes other sessions, security notifications.

**Residual:** SMS-based account recovery is not offered (good), but email compromise remains a path if the email provider itself is compromised. Users should enable TOTP.

### D. Malicious or compromised device

The phone is rooted, the app is modified, or someone has physical access and tries to extract data.

**Mitigations:** Keystore-backed AES-GCM for the token and queue, no backups, `FLAG_SECURE` in release, no account password on the device, per-device revocation, queue wiped on unpair.

**Residual:** a rooted device with an unlocked bootloader can often read app memory while the app runs. Keystore raises the cost; it is not a guarantee against a live, privileged attacker. Device-reported locations can be spoofed by a modified client; the server flags `is_mocked` when Android reports it but cannot prove authenticity.

### E. Malicious server operator

A self-hosted instance is controlled by whoever runs it. Users must trust that operator.

**Mitigations:** AGPL source availability, documented data flows, encryption at rest for the most sensitive fields.

**Residual:** the operator can read location history and decrypted photos while the process is running. This is inherent to a self-hosted locator. Host Beacon only on infrastructure you control.

### F. Abusive user

Someone uses Beacon to track another person without consent.

**Mitigations:** pairing requires an authenticated account and a visible app on the target device; lost mode displays a full-screen notice; photo capture is foreground and user-mediated; the app never hides its icon or notification; Android requires explicit permissions.

**Residual:** Beacon cannot verify consent. It is not a covert surveillance tool, and the project does not support using it as one. Hosters are responsible for applicable law.

---

## 3. Trust boundaries

```
[Browser] ──TLS──▶ [Next.js/Vercel] ──TLS──▶ [Neon Postgres]
                          │
                          ├──▶ [Relay / Resend]
                          ├──▶ [FCM] (server-side only; no client registration yet)
                          └──▶ [OpenFreeMap tiles] (browser only)

[Android app] ──TLS──▶ [Next.js/Vercel]
       │
       └──▶ [Android Keystore]  (hardware-backed on most devices)
```

- The server trusts the database and its own environment.
- The server does **not** trust client-supplied identity, timestamps, coordinates, or device models. It validates shape and ranges, binds tokens to a device row, and enforces per-user ownership joins.
- The browser does not receive device tokens, password hashes, or TOTP secrets.
- OpenFreeMap sees tile requests from the browser (IP, approximate area). It does not receive Beacon account data. A self-hoster can swap the style URL.
- Relay/Resend receive recipient addresses and email bodies. FCM receives a device token and a command notification when a client has registered one; the v0.1.0 Android app does not.

---

## 4. Threats and controls

### Spoofing

| Threat | Control |
| --- | --- |
| Stolen session cookie | HttpOnly, `Secure`, `SameSite=Lax`, `__Host-` prefix in production, server-side revocation, short-ish TTL (30 days default) |
| Stolen device token | HMAC-only storage, per-device scope, immediate revocation, no cross-device access |
| Forged pairing code | 8-character code with 10-minute TTL, HMAC storage, atomic single-use consumption, IP rate limit |
| TOTP replay | Monotonic last-used step; a code cannot be used twice even within its window |
| Email OTP brute force | Five attempts per code, 10-minute expiry, one active code per user, per-account/IP rate limits |

### Tampering

| Threat | Control |
| --- | --- |
| Modified location payload | Zod schemas, coordinate ranges, batch size, 256 KB body cap, timestamp skew/age checks |
| Command injection into device | Fixed command enum server-side and in the app; payload limited to a 200-character message; no shell or dynamic code |
| Photo polyglot / non-image upload | JPEG magic-byte check, size bounds, server-side decode and re-encode with a 36 MP ceiling, EXIF/ICC stripping, MIME normalization, `nosniff`, `Content-Disposition: inline` with a generated filename |
| GPS leak in uploaded photo | Image is re-encoded from pixels; EXIF, XMP, ICC and trailing data are discarded |
| CSRF | `Origin` allowlist on every state-changing route, JSON content type requirement, `SameSite=Lax` cookies |
| XSS | React escaping, strict CSP with nonce and `strict-dynamic`, no `dangerouslySetInnerHTML` in app surfaces, `object-src 'none'` |

### Repudiation

| Threat | Control |
| --- | --- |
| “I never unpaired that device” | `audit_logs` records actor, action, target, hashed IP, user agent, and timestamp |
| “I never changed the email provider” | Settings changes are audited |
| Log tampering | Audit rows are append-only from the application; database access is the operator’s responsibility |

### Information disclosure

| Threat | Control |
| --- | --- |
| Database dump exposes MFA secrets | AES-256-GCM with AAD; key lives in the environment, not the database |
| Database dump exposes photos | Encrypted photo bytes, per-device AAD |
| Photo URL guessing / IDOR | UUIDs plus an ownership join through `devices.userId`; cross-account requests return 404; `Cache-Control: private, no-store` |
| Sensitive data in logs | Logger redacts common keys; tokens and coordinates are never logged by the Android client; email logs store recipient and error text only |
| Browser caching of private pages | Authenticated routes are dynamic; sensitive API responses use `no-store`; `X-Robots-Tag` on photos |
| Screenshots of the app | `FLAG_SECURE` on release builds (not debug); screenshots are an explicit per-device opt-in |
| Backup extraction | `allowBackup=false`, data extraction rules exclude app data, Keystore-encrypted token |

### Denial of service

| Threat | Control |
| --- | --- |
| Auth brute force | DB-backed fixed-window limits per IP and account; lockout after repeated failures |
| Ingest flood | Per-device + IP limit (120/min), 200 points per request, 256 KB body |
| Command spam | 30 commands/minute per user; 24-hour expiry |
| Photo flood | 6 uploads/hour/device, 1.5 MB cap, 20 photos/device |
| Cron abuse | Bearer `CRON_SECRET` with constant-time comparison; `503` if unset |
| Enumeration | Generic login/reset responses; UUID validation before queries |

### Elevation of privilege

| Threat | Control |
| --- | --- |
| Access another user’s device | Every dashboard query includes `devices.userId = session.user.id`; every photo query joins through `devices` |
| Device token used on dashboard APIs | Dashboard routes require a session cookie; device routes require a bearer token; the two authenticators are separate |
| Revoked device keeps syncing | `authenticateDevice` filters `revokedAt IS NULL` and the owning user’s `deletedAt` |
| Email verification bypass | Sensitive actions use `requireVerifiedApiUser` / `requireVerifiedUser`; unverified users are redirected |
| MFA bypass via direct API | Every authenticated page and API guard requires that the session completed the account’s enabled factor; a pending-MFA cookie cannot access app routes |

---

## 5. Residual risks

These are known and accepted for `v0.1.0`:

1. **No certificate pinning.** Self-hosting and certificate rotation make pinning a poor default. A compromised system CA, or a rooted device with a modified trust store, can intercept traffic. User-installed CAs are not trusted.
2. **No hardware-backed attestation.** The server cannot prove the app binary is unmodified. Rooted clients can forge locations.
3. **Location data is not field-encrypted.** It is protected by TLS, database access controls, and Neon’s at-rest encryption, but a database operator can read it. Encrypting every coordinate would break range queries.
4. **Photos are decrypted in the server process.** The key is available to the running application; this is necessary to serve them.
5. **IP addresses are keyed-hashed, not anonymous.** The HMAC key is `AUTH_SECRET`; without it, IPv4 space cannot be enumerated cheaply. If the secret leaks, it can. Rotate the secret to break correlation.
6. **Email is not end-to-end encrypted.** Relay/Resend and the recipient provider can read verification and alert emails.
7. **SIM removal cannot be prevented.** Beacon reports state and can alert. With device admin enabled, the owner can opt into a screen lock after a READY→ABSENT transition, but a thief can avoid it by leaving the SIM in place; Android does not grant apps a lockout primitive.
8. **Factory reset removes protection.** A reset device cannot be tracked by the installed app.
9. **Free-tier cron is daily.** Without an external scheduler, offline alerts can be delayed by up to 24 hours.
10. **No independent audit.** The code has unit tests and a documented review, but no third-party penetration test.
11. **Account lockout is a denial-of-service lever.** Ten failed passwords lock an account for 15 minutes. Per-IP limits raise the cost, but a distributed attacker who knows an address can still trigger it. The lockout is intentional protection against password guessing.
12. **Device bearer tokens are long-lived credentials.** A rooted device can expose its Keystore-protected token while the app is running. Revoking the device from the dashboard ends access, but detection is the operator’s responsibility.
13. **External providers are trusted.** Relay/Resend see email content, FCM sees push metadata, and a malicious `beacon://pair` link can prefill an attacker-controlled server. The pairing screen always shows the server URL and requires an explicit Pair action, but it cannot authenticate the QR source.

---

## 6. Privacy commitments

- No analytics, advertising SDKs, session replay, or third-party trackers.
- No location data sent to map tile providers; MapLibre requests tiles for the visible viewport only.
- No personal domain, email, or operator identity is committed to this repository.
- Data export returns account, devices, locations, geofences, commands, and audit metadata as JSON.
- Account deletion cascades devices, locations, geofences, commands, photos, sessions, and tokens. Email delivery logs are retained without a user link (`user_id` set null) for abuse investigation, then deleted by the 90-day cron.
- The Android app explains every permission before asking and never enables a permission silently.

See the public [privacy page](../src/app/privacy/page.tsx) for the user-facing version.

---

## 7. Security review checklist

Use this before exposing an instance to the public internet:

- [ ] `APP_URL` is the final HTTPS origin; no trailing slash.
- [ ] `AUTH_SECRET`, `ENCRYPTION_KEY`, and `CRON_SECRET` are independently generated and stored in a password manager.
- [ ] `ENCRYPTION_KEY` decodes to exactly 32 bytes and has an offline backup.
- [ ] `EMAIL_DEV_LOG=false` in production.
- [ ] Relay/Resend domains are verified; SPF, DKIM, and DMARC are configured.
- [ ] Cron is protected and scheduled at least every 15 minutes.
- [ ] Database backups are enabled and restore-tested.
- [ ] Neon and Vercel access is limited to the operator, with MFA enabled on both.
- [ ] No `.env`, keystore, `local.properties`, or personal notes are tracked.
- [ ] Release APK is signed with a key that is not in the repository.
- [ ] `FLAG_SECURE` is active in the release build (it is disabled only in debug).
- [ ] Rate limits have been exercised with a load test or manual burst.
- [ ] Dependency alerts and CI are enabled.
- [ ] Logs are checked for tokens, coordinates, and email bodies.
- [ ] The incident response steps in [OPERATIONS.md](OPERATIONS.md#6-incident-response) have an owner.

---

## 8. Reporting

Do not open a public issue for a vulnerability. Follow [SECURITY.md](../SECURITY.md). Include the affected version, reproduction steps, impact, and any suggested fix. Good-faith research is welcome; do not access other people’s data or run destructive tests against a hosted instance without written permission.
