# Limitations

Beacon is honest about what a phone app can and cannot do. This page is the list of things that will not work, may work slowly, or require a decision before you rely on Beacon for a real emergency.

**Read this before deploying.** `v0.1.0` has not had an independent security audit or a physical-device field trial.

---

## 1. Absolute limits of Android

These are not bugs and cannot be fixed by better code:

| Limit | Consequence |
| --- | --- |
| Uninstall or factory reset | The app, its token, and the local queue are gone. No installed product can survive this without device-owner provisioning. |
| Power off / dead battery | No location, no heartbeat, no command handling. The dashboard shows the last known point and a stale timestamp. |
| Safe mode | Third-party apps do not run. |
| Location turned off | No fix. The app may still check in if data is available. |
| Airplane mode | No data. SMS fallback may still work if a cellular network is available and `SEND_SMS` is granted. |
| Background camera / microphone | Blocked by Android. Photo capture requires a person to open the app and take the picture. |
| Silent install of a system app | Not possible. Beacon is a normal user app. |
| SIM removal lockout | Android gives apps no primitive to prevent SIM removal or lock the device because of it. Beacon reports the change; it cannot stop it. |
| Remote wipe | Not implemented, and deliberately not claimed. Device admin in Beacon only grants `force-lock`. |
| Surviving a determined thief | A thief can uninstall the app, disable location, revoke permissions, or keep the phone off. Encryption and device admin raise the cost; they do not guarantee recovery. |

Do not market Beacon as a covert tracker, a guaranteed recovery service, or a replacement for insurance and law enforcement.

---

## 2. Background execution is best-effort

Android does not promise exact background schedules.

- WorkManager periodic work is inexact. Doze and App Standby can delay it by hours.
- Aggressive OEM builds (Xiaomi/MIUI, Samsung, OnePlus, Oppo, Vivo) may kill background work even with a valid scheduler. Battery optimization exemption helps; it is not a guarantee.
- Android 12+ can refuse a foreground-service start from the background. Lost mode may fall back to periodic work until the app is opened.
- The lost-mode foreground service keeps a persistent notification. It cannot be hidden, and hiding it would violate Android policy.
- The app does not request exact alarms or hold an indefinite wake lock.

**Practical impact:** outside lost mode, a command can take 15–60 minutes to arrive. In the worst OEM case, it can take longer. Lost mode polls every two minutes while its service runs.

### No push on Android yet

The server can send a Firebase Cloud Messaging data message when a command is created, and it accepts an encrypted FCM token during heartbeat. The Android app in `v0.1.0` does **not** register for FCM or handle the message. Commands therefore rely on periodic sync and the lost-mode poll. Adding Firebase Messaging is the top item in [ROADMAP.md](ROADMAP.md).

---

## 3. Photos are user-mediated

- A photo request only posts a notification. Somebody must open the app and press **Take photo**.
- The system camera app is used. A device with no camera app or no camera cannot fulfil the request.
- Capture is capped at 1280 px, JPEG quality 82, and 1.4 MB on the client; the server caps at 1.5 MB.
- A dismissed request is acknowledged as `unsupported`; an expired request as `failed`. There is no hidden fallback.
- A failed upload leaves the request pending locally; there is no background retry queue for photos yet.
- Photos are retained for 30 days and capped at 20 per device.

---

## 4. SMS fallback is limited

- One SMS every 15 minutes at most.
- Only when the app has no internet at sync time, the fix is under 10 minutes old, a number is configured, and `SEND_SMS` is granted.
- SMS is unencrypted and visible to the carrier and anyone with the handset.
- Delivery is fire-and-forget. The server does not know whether it arrived.
- It is not a command channel; commands never travel by SMS.
- Carrier charges apply.

---

## 5. Email and alerting

- Production needs Relay and/or Resend. Without a provider, verification and password reset do not work.
- Email delivery is best-effort: a provider timeout can still result in a delivered message, and a total failure is not retried later.
- Failover happens after any provider failure, including permanent `4xx` errors. A misconfigured primary can add latency before the fallback is tried.
- `Retry-After` from a provider is not honored; there is one fixed 300 ms retry per provider.
- Offline alerts are evaluated by the maintenance route. On Vercel Hobby that is once a day unless an external scheduler calls it more often.
- Alert state has cooldowns: offline 24 h, low battery 12 h, SIM change 6 h. A resolved-then-recurring condition may wait for the cooldown.
- Geofence evaluation is server-side and runs only when a location arrives. A device that stops reporting cannot trigger an exit event.

---

## 6. Location and evidence quality

- GPS is unavailable indoors, in basements, and in some vehicles. Network fixes can be off by hundreds of metres.
- The app reports `isMocked` when Android says a fix is mocked. A rooted or modified client can lie, and the server cannot prove authenticity.
- Location history is not end-to-end encrypted. TLS and database access controls protect it in transit and at rest, but the operator can read it.
- Photos are decrypted in the server process to serve them. The operator can read them.
- Map tiles come from OpenFreeMap and require an internet connection. An offline map is not bundled.
- OpenFreeMap is free and keyless but is a fair-use service. Do not prefetch tiles or build an offline tile archive from it.

---

## 7. Accounts and recovery

- There is no SMS-based account recovery, by design. If you lose your password, TOTP device, email access, and recovery codes, the account cannot be recovered by the operator through a backdoor.
- Email compromise is a path to account takeover if MFA is not enabled. Enable TOTP.
- Recovery codes are shown once. Beacon cannot regenerate the same set; you can generate a new set, which invalidates the old one.
- Account deletion is immediate and cascading. There is no undo and no soft-delete grace period exposed in the UI.
- Signups can be disabled with `ALLOW_SIGNUPS=false`, but there is no invitation system or admin role.
- A self-hosted operator can read user data. Beacon is not a zero-knowledge service.

---

## 8. Deployment and operations

- The reference stack is Vercel + Neon. Other Node hosts and Postgres providers should work, but are not tested by CI.
- Vercel Hobby allows one cron run per day. Without an external scheduler, offline alerts can be up to 24 hours late.
- Neon Free autosuspends; the first request after idle is slower.
- Free-tier storage is small. Locations and photos are the main consumers; retention defaults are chosen for a family-scale instance, not a fleet.
- There is no admin dashboard. Incident response is SQL and provider dashboards.
- There is no built-in `ENCRYPTION_KEY` rotation command. Losing the key makes TOTP secrets, SMS numbers, push tokens, and photos unreadable.
- There is no durable outbound email queue, no dead-letter queue, and no background job runner.
- Backup retention depends on your Neon plan. Test a restore; do not assume point-in-time recovery covers your worst outage.

---

## 9. Clients and platforms

- Android 8.0+ only. iOS and Windows clients do not exist yet.
- The web dashboard is responsive and installable as a PWA, but it is not a substitute for the Android app: a browser cannot provide continuous background location.
- The Android UI is English-only and has not had a formal accessibility audit.
- There are no Android unit or instrumentation tests in the repository yet. CI builds the debug APK; it does not run on a device.
- The app has been exercised on an API 36 emulator. It has not been tested on a physical handset, across OEM skins, or through a full battery cycle.

---

## 10. Security assurance

- No independent penetration test or code audit has been commissioned.
- The web unit suite covers cryptography, hashing, TOTP, geofence math, and email ordering. It does not exercise API routes against a live database.
- No end-to-end test covers pairing → ingest → command → acknowledgement → photo against Postgres.
- Dependabot and a CI workflow are included, but you must enable alerts and keep dependencies current.
- Certificate pinning is not implemented; a compromised system CA, or a rooted device with a modified trust store, can intercept Android traffic. User-installed CAs are not trusted.
- The ten-failure account lockout is a denial-of-service lever: someone who knows an account's email address can lock it for 15 minutes. Per-IP limits raise the cost but do not remove it.
- Device bearer tokens are long-lived. A rooted device can expose its token while the app runs; revoke the device from the dashboard if that happens.
- Relay, Resend, FCM, and the unverified `beacon://pair` custom scheme are trust boundaries. A compromised provider or a malicious pairing link can observe or redirect a pairing attempt, although the app displays the target server before pairing.
- Audit logs record hashed IPs, not raw addresses. They are append-only from the app, but a database administrator can alter them.
- The Android release build is minified with R8, but no reproducible-build attestation is published.
- The APK is distributed outside Google Play. Users must verify the source, signature, and checksum themselves.

---

## 11. Legal and ethical limits

Beacon is for locating devices you own or are authorised to manage. It is not for tracking people without their knowledge.

- Pairing requires an authenticated account and physical access to an unlocked device.
- The app is visible, its notification is persistent in lost mode, and photo capture requires user action.
- Consent cannot be verified by software. The operator is responsible for complying with applicable law, including notification and data-protection rules.
- The AGPL requires source availability to network users if you modify and host Beacon. See [LICENSE](../LICENSE).

---

## 12. What would make Beacon unsuitable

Do not use Beacon as the only safeguard if any of these are true:

- You need guaranteed recovery of a stolen phone.
- You need covert monitoring.
- You need a legally admissible chain of custody for photos or locations.
- You need real-time (sub-minute) command delivery on stock Android without push.
- You cannot operate a database, rotate secrets, or read a runbook.
- You are not prepared to test a restore and a physical device.

For those cases, use a mature commercial MDM or device-owner deployment, and treat Beacon as a transparency-first alternative rather than a guarantee.
