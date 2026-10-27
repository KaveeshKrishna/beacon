# Deployment

Beacon is designed to run on free infrastructure with no always-on server. The reference stack is **Vercel Hobby + Neon Free + OpenFreeMap**, with optional Relay/Resend for email. Server-side FCM plumbing exists, but the Android client does not register for push in `v0.1.0`.

If you change any of these choices, keep three invariants: HTTPS everywhere, a Postgres database with TLS, and a scheduler that can call the maintenance route.

---

## 1. Provision the database

1. Create a project at [neon.tech](https://neon.tech).
2. Choose the region closest to your Vercel deployment.
3. Copy **both** connection strings from the dashboard:
   - **Pooled** (host contains `-pooler`): use for `DATABASE_URL` in Vercel and locally.
   - **Direct**: use for migrations if your tooling has trouble with the pooler.
4. Append `?sslmode=require` if it is not already present.

Neon Free includes a small storage and compute allowance. Beacon stores one row per location fix. At one fix every 30 minutes, one device produces roughly 17,500 rows per year; a 90-day retention window keeps this comfortably small.

### Apply migrations

```bash
# from the repository root, with DATABASE_URL pointing at the target database
npm ci
npm run db:migrate
```

Migrations live in `drizzle/` and are applied in order. They create all 17 tables. Apply them before the first request; the app validates its environment at boot but does not auto-migrate.

> **Never point a production `db:push` at a database with real data.** `db:push` is a development convenience and can drop columns. Use `db:migrate` for deployments.

---

## 2. Create the Vercel project

1. Push the repository to GitHub (see [CONTRIBUTING.md](../CONTRIBUTING.md) for the contribution workflow).
2. In Vercel: **Add New → Project → Import** the repository.
3. Framework preset: **Next.js**. Build command `npm run build`, output `.next` (defaults).
4. Add environment variables for **Production**, **Preview**, and **Development** as appropriate.

### Required variables

| Variable | Example | Notes |
| --- | --- | --- |
| `APP_URL` | `https://beacon.example.com` | Final HTTPS origin, no trailing slash. Used for cookies, email links, and origin checks. |
| `TRUSTED_PROXY` | `vercel` | `vercel`, `forwarded`, or `none`. See the reverse proxy note below. |
| `DATABASE_URL` | `postgresql://...-pooler.../beacon?sslmode=require` | Neon pooled string. |
| `AUTH_SECRET` | 32 random bytes, base64 | Signs HMACs for sessions, tokens, and IP hashes. |
| `ENCRYPTION_KEY` | 32 random bytes, base64 | Must decode to exactly 32 bytes. **Back this up.** |
| `CRON_SECRET` | 32 random bytes, hex | Required to enable the maintenance route. |

Generate them independently:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Recommended variables

| Variable | Default | Notes |
| --- | --- | --- |
| `ALLOW_SIGNUPS` | `true` | Set `false` after creating your account on a private instance. |
| `MAX_DEVICES_PER_USER` | `10` | Keep small on free tiers. |
| `SESSION_TTL_DAYS` | `30` | 1–90. |
| `LOCATION_RETENTION_DAYS` | `90` | 7–730. |
| `AUDIT_RETENTION_DAYS` | `365` | 30–1095. |
| `EMAIL_PROVIDER_PRIORITY` | `relay_first` | `relay_first`, `resend_first`, `relay_only`, `resend_only`. |
| `EMAIL_DEV_LOG` | `false` | Logs recipient, subject, and template when no provider is configured. Leave `false` in production; recipients and subjects are sensitive metadata. |
| `ENABLE_HIBP` | `true` | Checks passwords against Have I Been Pwned using k-anonymity. |
| `NEXT_PUBLIC_APK_URL` | empty | Stable HTTPS link to your signed APK. |
| `NEXT_PUBLIC_GITHUB_URL` | empty | Source link for AGPL compliance. |
| `NEXT_PUBLIC_OPERATOR_NAME` | `Beacon Project` | Shown on legal pages. |
| `NEXT_PUBLIC_CONTACT_EMAIL` | `security@example.com` | Replace with a monitored address. |

The full list, including Relay/Resend/FCM and map style overrides, is in [`.env.example`](../.env.example).

> **Reverse proxy note:** IP rate limits and audit hashes need the real client address. Forwarded headers can be forged by clients, so Beacon ignores them by default outside Vercel. On Vercel, leave `TRUSTED_PROXY=vercel`; the edge sets the headers and `VERCEL=1`. Behind nginx, Caddy, or Traefik, set `TRUSTED_PROXY=forwarded` **and** make the proxy replace or append the peer address, for example: `proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`. If the app is exposed directly, use `TRUSTED_PROXY=none` (all requests share one rate-limit bucket). Never set `forwarded` if clients can reach the origin without passing through the proxy.

5. Deploy. The first build should take 1–3 minutes.
6. Open the deployment URL and confirm `/api/health/live` returns `200` and `/api/health` reports the database as reachable.

### Set the domain before first login

Cookies and email links depend on `APP_URL`. If you log in on `https://project.vercel.app` and later switch to a custom domain, sessions are scoped to the wrong host and links break. Add the custom domain first, then set `APP_URL`, then redeploy.

Vercel’s own `VERCEL_URL` is also accepted as an origin, so preview deployments can be used for review. They share the production database unless you create a separate Neon branch — **do not test destructive flows on previews**.

---

## 3. Schedule maintenance

The maintenance route (`/api/cron/maintenance`) does six things:

1. Deletes expired sessions, MFA challenges, email tokens/codes, pairing codes, and rate-limit rows.
2. Deletes locations older than `LOCATION_RETENTION_DAYS`.
3. Deletes geofence events older than 180 days.
4. Deletes photos older than 30 days.
5. Deletes audit and email logs past their retention.
6. Sends offline alerts and expires stale commands.

`vercel.json` includes:

```json
{
  "crons": [{ "path": "/api/cron/maintenance", "schedule": "0 3 * * *" }]
}
```

Vercel Hobby runs cron **once per day**. That is enough for cleanup, but offline alerts could be delayed by up to 24 hours. For a usable anti-theft deployment, add an external scheduler that calls the route every 5–15 minutes.

### External scheduler options

Any HTTPS scheduler works. The request must be:

```http
GET /api/cron/maintenance
Authorization: Bearer <CRON_SECRET>
```

Free or low-cost options:

- **cron-job.org** — free minute-level schedules, custom headers.
- **GitHub Actions** — a scheduled workflow with `curl`; note that GitHub’s scheduler can be delayed during busy periods.
- **Cloudflare Cron Triggers** — a tiny Worker that fetches the route.
- **Uptime monitoring** — many services support an authenticated HTTP check every 5 minutes.

Do not put `CRON_SECRET` in a URL query string. Use an `Authorization` header. Rotate the secret if it is exposed in scheduler logs.

A GitHub Actions example:

```yaml
name: beacon-maintenance
on:
  schedule:
    - cron: "*/10 * * * *"
  workflow_dispatch:
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Run maintenance
        run: |
          curl --fail --silent --show-error \
            -H "Authorization: Bearer ${{ secrets.BEACON_CRON_SECRET }}" \
            "https://beacon.example.com/api/cron/maintenance"
```

Store the secret as a repository secret, not in the workflow file.

---

## 4. Configure email

Email is optional for local development because `EMAIL_DEV_LOG=true` prints messages to the server log. Production needs at least one provider.

### Resend (simplest)

1. Create a [Resend](https://resend.com) account and add your sending domain.
2. Add the DNS records Resend shows (SPF, DKIM, and ideally DMARC).
3. Create an API key with send permission.
4. Set:

```dotenv
RESEND_API_KEY=re_...
RESEND_FROM=Beacon <no-reply@your-domain.example>
EMAIL_FROM=Beacon <no-reply@your-domain.example>
EMAIL_REPLY_TO=support@your-domain.example
EMAIL_DEV_LOG=false
```

### Relay (self-hosted)

Relay is a separate self-hosted transactional mail service. Beacon calls its `/api/v1/send` endpoint. Set:

```dotenv
RELAY_API_BASE_URL=https://relay.your-domain.example
RELAY_API_KEY=...
RELAY_FROM=Beacon <no-reply@your-domain.example>
```

Keep your Relay hostname out of the repository and out of screenshots. Do not commit real hostnames, credentials, or sending domains.

### Verify

After deployment, sign in, open **Settings → Email delivery**, and send a test message to your own address. The page shows which provider handled it and the latency. If both providers fail, the API returns a generic error and the delivery log records the provider status.

Detailed behavior, priority modes, and troubleshooting: [EMAIL.md](EMAIL.md).

---

## 5. Build and publish the Android app

The app is not on Google Play. Distribute a signed APK from GitHub Releases, your own HTTPS host, or an MDM.

### Create a release keystore

Create the keystore at `android/beacon-release.jks`. Run this from the repository root:

```bash
keytool -genkeypair \
  -keystore android/beacon-release.jks \
  -alias beacon \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10000
```

Store the keystore and passwords in a password manager. **Never commit them.** `*.jks` and `keystore.properties` are git-ignored.

Create `android/keystore.properties`:

```properties
storeFile=../beacon-release.jks
storePassword=...
keyAlias=beacon
keyPassword=...
```

`storeFile` is resolved relative to `android/app` by Gradle, so `../beacon-release.jks` points at `android/beacon-release.jks`. Copying [`android/keystore.properties.example`](../android/keystore.properties.example) gives you the same layout.

Build with your server baked in as the default:

```bash
cd android
./gradlew assembleRelease -PbeaconBaseUrl=https://beacon.example.com
```

The APK is at `android/app/build/outputs/apk/release/app-release.apk`. Verify the signature:

```bash
apksigner verify --print-certs app-release.apk
```

Upload the APK to a stable HTTPS URL and set `NEXT_PUBLIC_APK_URL`. The landing page and site footer link to it. Publish the SHA-256 checksum next to the download.

### Release checklist for the app

- [ ] `versionCode` and `versionName` incremented in `android/app/build.gradle.kts`.
- [ ] `beaconBaseUrl` is the production HTTPS origin.
- [ ] Keystore backed up in two places.
- [ ] APK signed and `apksigner verify` passes.
- [ ] SHA-256 checksum published.
- [ ] Fresh install pairs, syncs, and survives a reboot.
- [ ] Upgrade over the previous version keeps the pairing.
- [ ] Lost mode, alarm, lock, and photo request tested on a physical device.

Full build and permission details: [ANDROID.md](ANDROID.md).

---

## 6. Backups and upgrades

### Database

Enable Neon’s point-in-time restore or schedule `pg_dump`:

```bash
pg_dump "$DATABASE_URL" --format=custom --file=beacon-$(date +%F).dump
```

Use the direct (non-pooler) connection string for `pg_dump` when possible. Test a restore into a separate database at least once. A backup you have never restored is a hope, not a backup.

### Encryption key

`ENCRYPTION_KEY` is not stored in the database. If you lose it, TOTP secrets, SMS numbers, FCM tokens, and photos become unreadable. Keep at least two offline copies. Rotating it requires a migration that decrypts with the old key and re-encrypts with the new one; there is no built-in rotation command in `v0.1.0` (see [OPERATIONS.md](OPERATIONS.md#4-key-management)).

### Application updates

1. Read [CHANGELOG.md](../CHANGELOG.md).
2. Back up the database.
3. Apply migrations (`npm run db:migrate`).
4. Deploy.
5. Check `/api/health`, sign in, and verify a device check-in.
6. Keep the previous Vercel deployment available for rollback.

Vercel retains previous deployments; “Promote to Production” is the fastest rollback. Database migrations are forward-only, so avoid destructive migrations without a tested restore path.

---

## 7. Free-tier limits to plan for

| Resource | Hobby/Free limit | Impact |
| --- | --- | --- |
| Vercel cron | 1 run/day | Use an external scheduler for alerts |
| Vercel function duration | 10 s default, 60 s configured for cron | Photo upload is capped well below this |
| Vercel bandwidth | 100 GB/month | Photos are the largest consumer; 20/device at ~1 MB is small |
| Neon storage | 0.5 GB free | 90-day retention keeps location history small |
| Neon compute | Autosuspend | First query after idle has a cold start |
| Resend | 3,000 emails/month | Verification, resets, alerts; plenty for a family |
| OpenFreeMap | No key, fair use | Do not prefetch or bulk-download tiles |

If you outgrow these, the first upgrade should be Neon storage and a paid Vercel plan, not a rewrite. The architecture has no always-on workers.

---

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `Invalid environment configuration` at boot | Missing or malformed variable | Compare with `.env.example`; `ENCRYPTION_KEY` must decode to 32 bytes |
| Login redirects in a loop | `APP_URL` host differs from the browser host | Set `APP_URL` to the exact origin and redeploy |
| `403 forbidden_origin` | Request came from a different origin | Use the canonical host; check proxy headers |
| Device gets `401` after pairing | Token revoked, user deleted, or `APP_URL` changed | Re-pair the device; check the device list |
| Email never arrives | Provider not configured, domain unverified, or dev logging on | Check **Settings → Email delivery**; inspect `email_logs` |
| Cron returns `503` | `CRON_SECRET` unset | Add it and redeploy |
| Cron returns `401` | Scheduler header missing or wrong | Use `Authorization: Bearer <secret>` |
| Map is blank | CSP or style URL blocked | Check the browser console; keep OpenFreeMap in `connect-src` |
| Photos list empty after capture | Command expired, upload failed, or app in background | Check the Commands tab and Android notification |
| Offline alerts late | Hobby cron cadence | Add an external 5–15 minute scheduler |

For incidents and key rotation, see [OPERATIONS.md](OPERATIONS.md).
