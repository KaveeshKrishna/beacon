# Email Delivery

Beacon sends transactional email through an `EmailProvider` abstraction. Two providers are supported:

- **Relay** — a self-hosted transactional mail service reached over HTTPS at `/api/v1/send`.
- **Resend** — the managed service at `api.resend.com`.

Both are optional, but production needs at least one. Without either, verification, password reset, MFA codes, and alerts cannot be delivered.

---

## 1. Configuration

Set the shared sender first:

```dotenv
EMAIL_FROM=Beacon <no-reply@beacon.example.com>
EMAIL_REPLY_TO=support@beacon.example.com
EMAIL_TIMEOUT_MS=10000
EMAIL_DEV_LOG=false
```

`EMAIL_FROM` is the fallback for both providers. A provider-specific `RELAY_FROM` or `RESEND_FROM` overrides it. The address must be on a domain verified by the provider you actually use; the two providers may verify different domains.

### Relay

```dotenv
RELAY_API_BASE_URL=https://relay.your-domain.example
RELAY_API_KEY=...
RELAY_FROM=Beacon <no-reply@your-domain.example>
```

Relay is considered configured only when **both** `RELAY_API_BASE_URL` and `RELAY_API_KEY` are non-empty. Beacon sends:

```http
POST {RELAY_API_BASE_URL}/api/v1/send
Authorization: Bearer <RELAY_API_KEY>
Content-Type: application/json

{
  "from": "Beacon <no-reply@example.com>",
  "to": "user@example.com",
  "subject": "...",
  "text": "...",
  "html": "...",
  "replyTo": "support@example.com"
}
```

`replyTo` is omitted when `EMAIL_REPLY_TO` is empty. A `2xx` response may include `{ "messageId": "..." }`; otherwise the message is recorded as `accepted`. Keep the Relay hostname out of the repository and out of screenshots.

### Resend

```dotenv
RESEND_API_KEY=re_...
RESEND_FROM=Beacon <no-reply@your-domain.example>
```

Resend is configured when `RESEND_API_KEY` is non-empty. Beacon calls `POST https://api.resend.com/emails` with a single recipient, `text` and `html` bodies, and `reply_to` when set. The message ID is stored from the response.

### Local development

With no provider configured, `EMAIL_DEV_LOG=true`, and `NODE_ENV !== "production"`, Beacon prints the recipient, subject, and template to the server log and returns a synthetic `dev-log` message ID. The body is not logged, so verification links are not exposed in shared logs. Development mode never activates in production, and it never runs as a fallback when a configured provider fails.

---

## 2. Priority and failover

Each user has an `email_provider_priority` setting. `default` follows the deployment-wide `EMAIL_PROVIDER_PRIORITY`; the other modes are explicit:

| Mode | Order | Fallback |
| --- | --- | --- |
| `default` | Uses `EMAIL_PROVIDER_PRIORITY` | Depends on the resolved mode |
| `relay_first` | Relay, then Resend | Yes, if both are configured |
| `resend_first` | Resend, then Relay | Yes, if both are configured |
| `relay_only` | Relay only | No |
| `resend_only` | Resend only | No |

Only configured providers enter the order. Selecting `relay_only` on an instance without Relay credentials produces an error rather than silently using Resend.

### What happens on a failure

For each provider in order:

1. The request is attempted with `EMAIL_TIMEOUT_MS` as the timeout.
2. A network error, timeout, `408`, `425`, `429`, or any `5xx` is **retryable**. It is retried once, after a 300 ms pause, up to two attempts total.
3. Any other `4xx` is a permanent rejection for that provider and is not retried.
4. After the provider ultimately fails — retryable or permanent — Beacon moves to the next provider in the order, unless the mode is `*_only`.
5. Each provider outcome is written to `email_logs` with provider, status, latency, HTTP status (or `network`), and a truncated error message. The internal retry is included in that provider's latency but not logged as a separate row.

This means a misconfigured `EMAIL_FROM` on Relay will still consume the Relay attempt and then fail over to Resend. Failover is intentional even for permanent errors: a bad sender domain on one provider should not block a working second provider.

There is **no durable outbound queue**. If every provider fails, the send call throws, the caller logs or surfaces a generic error, and the email is not retried later. This is deliberate for verification and reset mail (the user can request another) and for alerts (the alert state prevents a retry storm). If you need guaranteed delivery, add an outbox table and a worker before increasing alert volume.

`Retry-After` headers are not currently honored inside the provider attempt; the fixed 300 ms retry is used. Rate-limit responses still trigger the single retry and then failover.

---

## 3. Templates

Templates are rendered server-side to both plain text and HTML. The HTML is inline-styled, light-only, uses no remote images, and contains no tracking pixels.

| Template | Trigger | Contents |
| --- | --- | --- |
| `verify_email` | Signup, resend verification | 24-hour verification link |
| `reset_password` | Forgot-password request | 60-minute reset link |
| `password_changed` | Password change or reset | Security notice with time |
| `mfa_code` | Email OTP challenge | 10-minute numeric code |
| `mfa_enabled` / `mfa_disabled` | MFA settings change | Security notice |
| `new_login` | Successful login from a new session | Time and user-agent summary |
| `geofence` | Enter or exit event | Device, geofence, time, dashboard and Maps links |
| `offline` | Maintenance cron finds a stale device | Last-seen time and dashboard link |
| `low_battery` | Ingest sees ≤15% and not charging | Battery level and time |
| `sim_change` | SIM state transitions from ready to absent/unknown | Device and time |
| `test` | Settings → Email delivery → Send test | Confirmation and settings link |
| `account_deleted` | Account deletion | Confirmation only |

All links use `APP_URL`. If `APP_URL` is wrong, emails are delivered but every link points at the wrong host. Set the final origin before the first production signup.

---

## 4. Alerts

Alert email is opt-in per user and per alert type in **Settings → Notifications**.

| Alert | Evaluation | Cooldown |
| --- | --- | --- |
| Geofence enter/exit | On location ingest, after the first baseline observation | Per event; deduplicated by state change |
| Offline | Maintenance cron, after `offlineAlertMinutes` (default 45) | 24 hours per device |
| Low battery | On ingest, ≤15%, not charging | 12 hours per device |
| SIM change | On heartbeat/ingest when the state changes | 6 hours per device |

Alert state lives in `device_alert_state`. A successful check-in clears the offline marker, so a device that reconnects and later goes offline can alert again after the cooldown. The maintenance route must run frequently for offline alerts to be timely; the Vercel Hobby cron is once daily. See [DEPLOYMENT.md](DEPLOYMENT.md#3-schedule-maintenance).

Alert delivery is best-effort and swallowed after logging. A failed alert does not block location ingest or other devices.

---

## 5. Delivery log

`email_logs` records:

- user ID (set to `null` if the account is deleted)
- recipient address
- template name
- provider (`relay` or `resend`)
- status (`sent` or `failed`)
- provider message ID
- HTTP status or `network`
- error message, truncated to 500 characters
- latency in milliseconds
- creation time

The dashboard shows the eight most recent rows for the signed-in user. Rows older than 90 days are deleted by the maintenance cron. Logging failure is non-fatal: if the database insert fails, the email result is unaffected and a warning is logged.

Admins do not get a cross-user delivery log in the UI. Query the table directly if you operate the instance.

---

## 6. Testing

1. Configure one provider and set `EMAIL_DEV_LOG=false`.
2. Sign in with a verified account.
3. Open **Settings → Email delivery**.
4. Confirm the provider shows as configured.
5. Choose a priority and save. The change is audited.
6. Send a test message. It always goes to the account's own verified address; the API does not accept an arbitrary recipient.
7. The response reports which provider handled it. The recent table shows status and latency.

The test endpoint is limited to five messages per hour per user.

Useful checks:

```bash
# Verify the provider configuration without sending
curl -s https://beacon.example.com/api/health

# Tail Vercel logs for the email subsystem
vercel logs --follow
```

The health endpoint reports database reachability, not email credentials. A provider can be configured and still reject mail because of an unverified domain.

---

## 7. Deliverability

1. **Verify the domain** at Relay or Resend, not just the From address.
2. **Publish SPF and DKIM** exactly as the provider instructs.
3. **Add DMARC** (`v=DMARC1; p=none; rua=mailto:...`) and move to `quarantine` once reports are clean.
4. **Use a subdomain** such as `mail.example.com` for transactional mail to isolate reputation.
5. **Keep `EMAIL_FROM` stable.** Changing it after launch can invalidate warm-up and filters.
6. **Do not send alerts to role addresses** that bounce; repeated bounces damage the domain.
7. **Check the provider dashboard** for suppressions. Beacon records what the provider accepted, not final inbox placement.

---

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `No email provider is configured` | No credentials, or `*_only` mode with that provider unconfigured | Set Relay/Resend values; choose a mode that includes a configured provider |
| Test returns `502 email_delivery_failed` | Both providers rejected the message | Check `email_logs`, provider dashboard, and sender domain |
| Verification link goes to the wrong host | `APP_URL` mismatch | Set the final HTTPS origin and redeploy |
| Emails land in spam | Missing SPF/DKIM/DMARC or new domain | Complete DNS, warm the domain, avoid link shorteners |
| Relay returns `401` | Wrong or rotated API key | Update `RELAY_API_KEY` and redeploy |
| Resend returns `403` | Sending domain not verified or key lacks permission | Verify DNS and create a sending key |
| `EMAIL_DEV_LOG` does not help | A provider is configured, or `NODE_ENV=production` | It only applies with zero configured providers outside production |
| Duplicate emails | Two providers accepted after a timeout | Check `email_logs`; a timeout can occur after provider acceptance |

The last case is inherent to retrying after a timeout: the provider may have accepted the message before the connection failed. There is no idempotency key shared across providers in `v0.1.0`.
