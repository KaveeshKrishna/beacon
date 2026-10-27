# Operations

This is the runbook for a self-hosted Beacon instance. It assumes the reference deployment: Vercel + Neon Postgres + an external scheduler, with optional Relay/Resend email.

Beacon has no admin console. Operational work is done through the provider dashboards, SQL, and environment variables. Keep a password manager entry for every secret and a named owner for each procedure.

---

## 1. Health and monitoring

| Endpoint | Checks | Expected |
| --- | --- | --- |
| `GET /api/health/live` | Process is running | `200 {"status":"ok"}` |
| `GET /api/health` | `SELECT 1` against Postgres | `200 {"status":"ok"}` or `503 {"status":"degraded"}` |

Both are `no-store`. They do not reveal versions, configuration, or error details.

Monitor at least:

- `/api/health/live` every minute from an external uptime service.
- `/api/health` every five minutes. A single `503` can be a Neon cold start; alert after three consecutive failures.
- Cron success. The maintenance route returns `{ "ranAt": ..., "alertsSent": N }`; alert if it has not succeeded in 30 minutes.
- Email failure rate. Query `email_logs` for a spike in `status = 'failed'`.
- Database storage and compute. Neon shows both; location retention is the main driver.

Vercel logs are the primary application log. The logger redacts keys that look like tokens, passwords, secrets, and authorization headers, but treat all logs as sensitive. Do not paste full request bodies into issues.

### Useful queries

```sql
-- Devices that have not checked in for a day
select id, name, last_seen_at
from devices
where revoked_at is null and last_seen_at < now() - interval '24 hours'
order by last_seen_at nulls first;

-- Email failures in the last 24 hours, grouped by provider and template
select provider, template, count(*)
from email_logs
where status = 'failed' and created_at > now() - interval '24 hours'
group by provider, template
order by count(*) desc;

-- Table sizes (Neon SQL editor)
select relname, pg_size_pretty(pg_total_relation_size(relid)) as size
from pg_catalog.pg_statio_user_tables
order by pg_total_relation_size(relid) desc;
```

There is no server-side view of the Android queue. A device with a growing local queue looks offline from the server; the app shows the count and the last error.

---

## 2. Maintenance cron

`GET` or `POST /api/cron/maintenance` with:

```http
Authorization: Bearer <CRON_SECRET>
```

The route rejects missing `CRON_SECRET` with `503`, and a wrong token with `401`. The comparison is constant-time. It is safe to call more often than the schedule; cleanup is idempotent.

Each run:

1. Deletes expired sessions, pending MFA challenges, email tokens/codes, pairing codes, and rate-limit rows.
2. Deletes locations older than `LOCATION_RETENTION_DAYS`.
3. Deletes photos older than 30 days.
4. Deletes email logs older than 90 days, geofence events older than 180 days, and audit logs older than `AUDIT_RETENTION_DAYS`.
5. Marks `pending` and `delivered` commands past `expires_at` as `expired`.
6. Evaluates offline devices and sends at most one alert per device per 24 hours.

`vercel.json` schedules one run per day at 03:00 UTC. Hobby accounts cannot run more often. For timely offline alerts, add an external scheduler every 5–15 minutes; see [DEPLOYMENT.md](DEPLOYMENT.md#3-schedule-maintenance).

A run is not transactional. If it fails partway, earlier deletes remain and later steps are skipped. Re-running is safe. The route has `maxDuration = 60`; on a very large database, split cleanup by lowering retention or running the SQL manually.

---

## 3. Retention

| Data | Default retention | Configured by |
| --- | --- | --- |
| Sessions | 30 days after expiry or revocation | Fixed cleanup window; session life is `SESSION_TTL_DAYS` |
| Pending MFA | 10 minutes | Fixed |
| Email tokens | Expiry, then 30 days for used rows |
| Email codes | Expiry | Fixed |
| Pairing codes | Expiry, then 30 days for used rows | Fixed |
| Rate limits | 2 days | Fixed |
| Locations | `LOCATION_RETENTION_DAYS` (90) | Environment |
| Photos | 30 days | Fixed |
| Email logs | 90 days | Fixed |
| Geofence events | 180 days | Fixed |
| Audit logs | `AUDIT_RETENTION_DAYS` (365) | Environment |

The latest location is not deleted early; retention is based on `recorded_at`, so a device that stops reporting will eventually have its whole history removed. The dashboard will show "no recent location" after that point.

Account deletion cascades devices, locations, geofences, commands, photos, sessions, and tokens. `email_logs.user_id` is set to `null` and the row remains until the 90-day cleanup, so delivery abuse can still be investigated without retaining an account link.

---

## 4. Key management

### `ENCRYPTION_KEY`

Encrypts:

| Field | AAD context |
| --- | --- |
| `users.totp_secret_enc` | `totp:<userId>` |
| `devices.fallback_sms_enc` | `sms:<deviceId>` |
| `devices.fcm_token_enc` | `fcm:<deviceId>` |
| `device_photos.data_enc` | `photo:<deviceId>` |

AES-256-GCM authenticates the context, so a ciphertext cannot be moved between fields. The key must decode to exactly 32 bytes. **There is no built-in rotation command in `v0.1.0`.** Losing the key makes TOTP secrets, SMS numbers, FCM tokens, and photos permanently unreadable; accounts and locations still work.

To rotate:

1. Generate a new 32-byte base64 key.
2. Take a verified database backup.
3. Run a one-off script with both keys available. For each encrypted row, decrypt with the old key and the row's AAD, then re-encrypt with the new key. Preserve the `v1.iv.ciphertext.tag` format.
4. Update `ENCRYPTION_KEY` in Vercel and redeploy.
5. Verify TOTP login, a device heartbeat (SMS number), and one photo fetch.
6. Keep the old key offline until the backup expires.

If a rotation is interrupted, some rows remain on the old key. Because there is no key ID in the ciphertext, the app cannot fall back automatically. Run the script to completion before swapping the environment variable, or restore the backup.

### `AUTH_SECRET`

Used for HMAC-SHA-256 of session tokens, device tokens, pairing codes, email tokens, recovery codes, pending-MFA tokens, and hashed IPs. Rotating it invalidates every session and every device token, and makes outstanding verification, reset, pairing, and recovery codes unusable.

Procedure:

1. Announce a maintenance window.
2. Generate a new base64 secret and update `AUTH_SECRET`.
3. Redeploy.
4. Every user must sign in again. Every device must be removed and re-paired.
5. Issue new recovery codes to users who rely on them.

Rotate immediately if the secret is exposed. The security cost of a forced re-pair is lower than leaving forged tokens valid.

### `CRON_SECRET`

Independent of all other secrets. Rotate it and update the scheduler in the same window:

1. Generate a new hex secret.
2. Update Vercel and the external scheduler.
3. Redeploy.
4. Confirm the next scheduled run returns `200`.

### Provider keys

Rotate Relay and Resend keys from their dashboards. Relay may allow overlapping keys; use a new key, deploy, verify a test email, then revoke the old one. Resend keys are shown once; store them in the password manager.

### Android signing key

The release keystore is not a server secret, but losing it prevents updates to an installed app. Keep two offline copies and the passwords in separate locations. If it is compromised, publish a new application ID or instruct users to uninstall the old app; Android will not accept an update signed by a different key.

---

## 5. Backups and disaster recovery

Neon Free includes a short restore window. Confirm the exact window in the Neon console and do not assume it is long enough.

- **RPO:** the last successful backup or point-in-time restore point.
- **RTO:** time to provision a database, restore, set `DATABASE_URL`, run migrations (normally no-op), and redeploy. Expect 15–60 minutes.

Practice a restore into a separate Neon branch:

```bash
pg_dump "$DATABASE_URL" --format=custom --file=beacon-backup.dump
pg_restore --clean --if-exists --no-owner --dbname "$RESTORE_URL" beacon-backup.dump
```

Use a direct (non-pooler) connection string for `pg_dump` when possible. After restoring, verify `/api/health`, sign in, and fetch one device and one photo. A backup is not proven until a restore is.

Keep offline copies of `ENCRYPTION_KEY` and `AUTH_SECRET`. A database restore without `ENCRYPTION_KEY` loses TOTP, SMS, push, and photos. A restore without `AUTH_SECRET` signs everyone out and requires re-pairing, but preserves data.

---

## 6. Incident response

### Severity

| Level | Example | Response |
| --- | --- | --- |
| Critical | Secret leak, cross-account data access, database compromise | Contain immediately, rotate, notify, preserve evidence |
| High | Auth bypass, mass email failure, device tokens exposed | Same-day containment and rotation |
| Medium | Single-account takeover, spam abuse, cron outage | Investigate and fix within 72 hours |
| Low | Misconfiguration without data exposure, noisy alert | Normal maintenance |

### Steps

1. **Preserve evidence.** Export relevant `audit_logs`, `email_logs`, and Vercel logs before rotating or deleting anything. Do not copy location data into tickets.
2. **Contain.** Depending on the incident:
   - Set `ALLOW_SIGNUPS=false`.
   - Rotate `AUTH_SECRET` (forces re-login and re-pairing).
   - Rotate `ENCRYPTION_KEY` only with the migration above; otherwise rotate provider keys and `CRON_SECRET`.
   - Revoke sessions for a user:
     ```sql
     update sessions set revoked_at = now()
     where user_id = '<uuid>' and revoked_at is null;
     ```
   - Revoke devices for a user:
     ```sql
     update devices set revoked_at = now()
     where user_id = '<uuid>' and revoked_at is null;
     ```
   - Disable a compromised email key at the provider.
3. **Assess.** Determine which accounts, devices, and data classes were affected. Use `audit_logs` (actor, action, target, hashed IP, user agent, time) and provider logs.
4. **Notify.** For a self-hosted instance, the operator is responsible for applicable breach notification law. Do not publish other users' data.
5. **Recover.** Restore from a known-good backup if integrity is in doubt, then force re-authentication.
6. **Review.** Write a short postmortem: cause, impact, detection, response, and the specific change that prevents recurrence. Add a test if the failure was code-level.

### Compromised database

Assume all location history, emails, and encrypted fields are exposed. `ENCRYPTION_KEY` may also be exposed if the attacker reached the environment. Rotate the database credentials, Neon project access, Vercel tokens, and — after restoring integrity — all application secrets. Inform users plainly; do not claim encryption saved data that the attacker could decrypt.

### Abusive tracking report

Beacon is not a covert surveillance product. If an instance is reported as used to track someone without consent:

1. Preserve the report and audit entries.
2. Suspend the account (`users.deleted_at` or revoke sessions/devices) pending review.
3. Do not disclose the reporter to the accused.
4. Follow local law and the operator's published policy.

---

## 7. Routine maintenance

### Weekly

- Confirm the cron ran and `alertsSent` looks plausible.
- Check `/api/health` and deployment errors.
- Review email failures and provider suppression lists.
- Check Neon storage trend.

### Monthly

- Apply dependency updates from Dependabot; run typecheck, lint, tests, and a production build.
- Verify a database backup restore into a branch.
- Review audit actions for unexpected admin-level changes (there is no admin role; look for account, MFA, and device events).
- Confirm the external scheduler is still enabled.
- Test one device: locate, ring, lost mode, photo.

### Quarterly

- Rotate `CRON_SECRET` and provider keys.
- Review session and device counts against expectations.
- Re-read [THREAT_MODEL.md](THREAT_MODEL.md) and update it for changes.
- Verify the Android release keystore backup.

### Before every release

Follow the deployment checklist in [DEPLOYMENT.md](DEPLOYMENT.md#6-backups-and-upgrades) and the release checklist in [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md#8-release-checklist).

---

## 8. Capacity and cost control

| Resource | Pressure point | Mitigation |
| --- | --- | --- |
| Neon storage | Location rows and photos | Lower `LOCATION_RETENTION_DAYS`; photos are capped per device and 30 days |
| Neon compute | Cold starts after idle | Accept the first-request latency; keep the scheduler warm if needed |
| Vercel function duration | Photo upload and cron | Photo cap is 1.5 MB; cron is 60 s |
| Vercel bandwidth | Photo downloads and map tiles | Map tiles come from OpenFreeMap, not Vercel; photos are the main cost |
| Resend | 3,000/month free | Alert cooldowns and per-user opt-in limit volume |
| OpenFreeMap | Fair use | No prefetching, offline tile packs, or bulk scraping |

Beacon has no always-on worker. The first scaling step is a paid database tier, not an architecture change.

---

## 9. Feature flags and emergency switches

Environment variables that can reduce exposure without a code change:

- `ALLOW_SIGNUPS=false` — close registration.
- `EMAIL_DEV_LOG=false` — never log email content outside development.
- `ENABLE_HIBP=false` — stop outbound Have I Been Pwned requests.
- `MAX_DEVICES_PER_USER` — cap pairing.
- `LOCATION_RETENTION_DAYS` and `AUDIT_RETENTION_DAYS` — shorten retention.

There is no global "disable device API" flag. To stop a specific device, revoke it in the dashboard or set `revoked_at` in SQL. To stop all devices, revoke all rows; they will clear their local queues and require re-pairing.
