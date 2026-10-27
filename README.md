# Beacon

**An Android-first, offline-resilient device locator.** A Next.js dashboard, a Neon Postgres data layer, and a native Kotlin app that keeps working when the network does not.

Beacon is designed for the worst day: the phone is lost or stolen, mobile data is unreliable, the battery is low, and the person holding it may not be cooperative. It stays deliberately honest about what Android permits — there is no covert camera, no silent background recording, and no pretend remote wipe.

[![License: AGPL-3.0-or-later](https://img.shields.io/badge/license-AGPL--3.0--or--later-FF6A45)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-15.5-000)](https://nextjs.org)
[![Android](https://img.shields.io/badge/Android-8.0%2B-3DDC84)](https://developer.android.com)

> **Status:** `v0.1.0` is a complete, self-hostable vertical slice. It has not yet been through an independent security audit. Read [docs/LIMITATIONS.md](docs/LIMITATIONS.md) before relying on it in a real emergency.

---

## What it does

| Area | Capability |
| --- | --- |
| Tracking | Foreground service in lost mode, WorkManager baseline otherwise, configurable tracking profiles, mocked-location flagging |
| Offline | Encrypted SQLite queue (Android Keystore AES-GCM), ordered upload, duplicate-safe ingestion, last-known location preserved across outages |
| Control | Locate now, ring, lock screen, lost mode, owner message, sync now, photo request |
| Photos | User-mediated camera capture, JPEG validation, AES-256-GCM at rest, per-device cap and 30-day retention |
| Geofences | Enter/exit evaluation on ingest, deduplicated events, in-app and email notifications |
| Accounts | Argon2id passwords, opaque sessions, TOTP, email OTP, recovery codes, session management, audit log |
| Email | Relay-first / Resend-first / single-provider modes, retry and failover, per-user override, delivery log |
| UI | Responsive dark/light dashboard, MapLibre + OpenFreeMap (no API key), Google Maps hand-off |
| Ops | Health checks, retention cron, rate limits, audit trail, Vercel + Neon deployment |

## Architecture

```
 Android app                         Vercel (Next.js 15)                Neon Postgres
 ┌──────────────────────┐   HTTPS   ┌────────────────────────┐   TLS   ┌──────────────────┐
 │ Compose UI           │ ────────▶ │ /api/device/*          │ ──────▶ │ 17 tables        │
 │ WorkManager + FGS    │  bearer   │ /api/devices/*         │  pooled │ encrypted fields │
 │ encrypted SQLite     │ ◀──────── │ /api/auth/*            │ ◀────── │ encrypted photos │
 │ Android Keystore     │  commands │ MapLibre + OpenFreeMap │         │ rate limits      │
 └──────────────────────┘           └────────────────────────┘         └──────────────────┘
         │                                      │
         └── best-effort SMS fallback           └── Relay / Resend (optional)
```

The web app never stores a device password. Pairing exchanges a short-lived, one-use code for a per-device bearer token; only an HMAC of that token is stored. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Quick start

### Requirements

- Node.js 22+ and npm 10+
- A PostgreSQL database with TLS — [Neon](https://neon.tech) free tier is the reference target
- JDK 17 and Android SDK 36 for the app (Android Studio or command-line tools)

### 1. Install and configure

```bash
npm ci
cp .env.example .env.local
```

Generate the three secrets independently:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" # AUTH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" # ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"    # CRON_SECRET
```

Set `DATABASE_URL`, `APP_URL`, and the generated values in `.env.local`. Every variable is documented in [`.env.example`](.env.example).

### 2. Migrate and run

```bash
npm run db:migrate
npm run dev
```

Open <http://localhost:3000>, create an account, verify the email printed to the server log (development email logging is on by default), and pair a device.

### 3. Build the Android app

```bash
cd android
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

The debug build uses `dev.beacon.app.debug` so it can sit beside a release install. It defaults to `https://beacon.example.com`; enter your own server on the pairing screen, pass `-PbeaconBaseUrl=https://your-host`, or deep-link `beacon://pair?server=https://your-host&code=XXXXXXXX`.

## Deploy

The reference deployment is Vercel Hobby + Neon Free:

1. Push the repository to GitHub.
2. Import it in Vercel and add the environment variables from `.env.example`.
3. Set `APP_URL` to the final HTTPS origin **before** the first production login.
4. Run `npm run db:migrate` against the production database.
5. Deploy. The included [`vercel.json`](vercel.json) registers one daily maintenance run.

Vercel Hobby allows only one cron run per day. Offline alerts therefore need an external scheduler hitting `/api/cron/maintenance` every 5–15 minutes with `Authorization: Bearer $CRON_SECRET`. Full instructions, including a free scheduler option, are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Security posture

- Argon2id password hashing (memory-hard, per-password salt) via `hash-wasm`
- Opaque 256-bit session tokens; only HMAC-SHA-256 hashes reach the database
- AES-256-GCM encryption for TOTP secrets, SMS numbers, FCM tokens, and photo bytes
- TOTP replay protection, email OTP attempt limits, single-use recovery codes
- Origin and content-type checks on state-changing requests; strict CSP with a per-request nonce
- Database-backed fixed-window rate limits on auth, pairing, ingest, commands, and photos
- Audit log for security-relevant actions, with configurable retention
- HTTPS-only Android client, no redirects, no cookies, no token logging
- `FLAG_SECURE` on release builds, no backups, no exported services, and only the device-admin receiver exported

The full threat model, residual risks, and reporting process are in [SECURITY.md](SECURITY.md) and [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).

## Project layout

```
src/
  app/                 App Router pages and API routes
  components/          Marketing, auth, app shell, maps, UI primitives
  db/                  Drizzle schema and client
  lib/
    auth/              Sessions, MFA, device tokens, guards
    data/              Typed queries and DTOs
    email/             Provider abstraction, templates, failover
    device/            Command claiming and runtime config
drizzle/               Generated SQL migrations
android/               Kotlin + Jetpack Compose app
test/                  Vitest unit tests
docs/                  Architecture, deployment, API, threat model, operations
scripts/               Brand asset generation
```

## Documentation

| Document | Purpose |
| --- | --- |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | Scope, phases, decisions, and current status |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Components, data flow, schema, and design choices |
| [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) | Assets, adversaries, controls, and residual risk |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Vercel, Neon, migrations, cron, domains, backups |
| [docs/API.md](docs/API.md) | Web and device API reference |
| [docs/ANDROID.md](docs/ANDROID.md) | Build, sign, pair, permissions, tracking internals |
| [docs/EMAIL.md](docs/EMAIL.md) | Relay and Resend setup, priority, failover, logs |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Monitoring, key rotation, incidents, retention |
| [docs/LIMITATIONS.md](docs/LIMITATIONS.md) | What Android and the free stack cannot do |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Planned work after `v0.1.0` |
| [SECURITY.md](SECURITY.md) | Vulnerability reporting and security policy |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Development workflow and review standards |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | Community expectations and enforcement |
| [CHANGELOG.md](CHANGELOG.md) | Release history and verification results |
| [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) | Dependency licenses and attribution |

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
cd android && ./gradlew :app:assembleDebug :app:assembleRelease :app:lintRelease
```

The unit suite covers cryptography, password hashing, TOTP, geofence math, and email provider ordering. End-to-end API and device flows require a live database; no production credentials are included in this repository.

## Design

The interface uses a warm bone/ink palette with a vermilion `#FF6A45` accent, Instrument Sans for text, and JetBrains Mono for telemetry. The mark is a geometric lighthouse with signal beams. Brand assets live in [`public/brand`](public/brand) and are generated by `npm run icons`.

## License

Copyright (C) 2026 the Beacon contributors.

Beacon is free software: you can redistribute it and/or modify it under the terms of the **GNU Affero General Public License, version 3 or later**. It is distributed in the hope that it will be useful, but **without any warranty**. If you run a modified version as a network service, section 13 requires you to offer its corresponding source. See [LICENSE](LICENSE).

Third-party dependencies retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Trademark and affiliation

Beacon is an independent project. It is not affiliated with Google, Android, Vercel, Neon, OpenFreeMap, MapLibre, Relay, or Resend. Product names are used only to describe interoperability.
