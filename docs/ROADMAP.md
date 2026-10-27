# Roadmap

This roadmap is ordered by risk and user value, not by novelty. Dates are deliberately omitted; a self-hosted security project should not ship a feature to hit a calendar.

`v0.1.0` is a complete vertical slice. The next releases focus on proving it, closing platform gaps, and only then broadening the client surface.

---

## Guiding constraints

1. **No covert capture.** Camera, microphone, and screen access stay foreground and user-mediated.
2. **No false guarantees.** If Android does not permit it, the UI says so.
3. **Self-hostable first.** Features must work on Vercel + Neon Free without an always-on worker.
4. **Small dependency surface.** Prefer platform APIs over new SDKs, especially on the device.
5. **Security changes need tests and documentation.** A control without a test is a hope.

---

## v0.1.x — Prove the release

### 1. Physical-device field test

- Install on at least three OEM builds (Pixel, Samsung, a Xiaomi/Redmi device).
- Exercise pairing, reboot, airplane mode, location off, battery saver, SIM removal, lost mode, alarm, lock, and photo.
- Record battery drain over 24 hours for each tracking profile.
- Document OEM-specific steps for keeping background work alive.

**Exit:** a written field report with measured results, linked from [LIMITATIONS.md](LIMITATIONS.md).

### 2. End-to-end database tests in CI

- Start a disposable Postgres service in GitHub Actions.
- Apply migrations.
- Exercise signup → verify → login → pair → ingest → command → ack → photo → unpair.
- Assert cross-account access returns `404`.

**Exit:** CI fails on a broken migration or auth boundary, with no production credentials.

### 3. Android tests

- JVM tests for server URL validation, point serialization, queue pruning, and command mapping.
- Compose UI tests for pairing validation, the permission checklist, lost mode, and photo request.
- A smoke test that installs the debug APK in an emulator and opens the main activity.

**Exit:** `./gradlew test` is meaningful, not `NO-SOURCE`.

### 4. Firebase Cloud Messaging

- Add Firebase Messaging to the app.
- Register the token on pairing, refresh, and heartbeat.
- Handle a high-priority `command` data message by triggering a sync.
- Keep polling as the fallback; never require push for correctness.
- Do not send location or message bodies in the push payload.

**Exit:** a command reaches a foreground or backgrounded device within seconds when push is configured, and still arrives within the polling window when it is not.

### 5. Photo retry and failure states

- Persist pending photo metadata across process death.
- Add a bounded retry with backoff for upload failures.
- Show a clear failed state in the app and a terminal status in the dashboard.
- Delete the temporary capture file in every path.

**Exit:** an upload interrupted by loss of connectivity completes after reconnect without retaking the photo.

### 6. Foreground-service start policy

- Add notification actions that open the app before starting lost mode.
- Detect `ForegroundServiceStartNotAllowedException` and explain the required action.
- Consider a user-initiated "arm lost mode" state instead of assuming the service can start from a command.

**Exit:** lost mode never claims live tracking when Android refused the service.

### 7. Dependency and supply-chain review

- Enable Dependabot alerts and code scanning.
- Pin GitHub Actions by commit SHA.
- Generate an SBOM for the web and Android artifacts.
- Document the release checksum and signing certificate fingerprint.

**Exit:** alerts are enabled, and a release can be verified against a published fingerprint.

---

## v0.2 — Operational maturity

### Durable email outbox

Add an `email_outbox` table with attempts, next attempt time, and terminal status. The cron drains it with bounded concurrency. This removes the current best-effort behavior and makes provider outages recoverable.

**Acceptance:** a message queued during a provider outage is delivered when the provider returns, with no duplicate on retry where the provider supports idempotency.

### Alert and delivery observability

- Aggregate delivery success by provider and template.
- Surface a simple status card in Settings: last successful email, last cron run, last device check-in.
- Add structured counters for rate-limit rejections and auth failures.
- Keep the metrics privacy-preserving; no per-user analytics.

### Admin-less recovery tooling

A documented CLI for operators:

- List a user's devices and sessions without exposing tokens.
- Revoke all sessions/devices for an account.
- Re-encrypt fields during `ENCRYPTION_KEY` rotation.
- Verify database integrity after a restore.

**Acceptance:** every runbook action has a tested command and a dry-run mode.

### Rate-limit and lockout polish

- Show a clear, non-enumerating message when an account is temporarily locked.
- Add a trusted-device or "remember this browser" option for MFA, with revocation.
- Consider WebAuthn/passkeys as a phishing-resistant second factor.

### Accessibility and internationalization

- Audit focus order, labels, contrast, and reduced-motion behavior on web and Android.
- Externalize strings and add a second locale as a proof of structure.
- Add RTL layout tests.

---

## v0.3 — Broader clients

### Windows client

A companion that can:

- Show the dashboard in a native shell or a hardened web view.
- Receive desktop notifications for alerts.
- Act as a trusted approver for sensitive account actions.

It is not a location source. Do not pretend a desktop is a tracked device.

### iOS client

- Reuse the existing device API; do not fork the contract.
- Accept iOS limits honestly: background location requires "Always" permission, background camera is unavailable, and significant-change location is coarse.
- Implement a local queue with Keychain-backed encryption.
- Ship only after a separate threat-model review; iOS background rules differ enough to invalidate assumptions.

### Device-owner / MDM mode

For organisations that control hardware:

- Android Enterprise device-owner provisioning.
- A documented policy bundle for fully managed devices.
- Remote lock with a stronger guarantee than device admin.
- Explicit separation from the consumer app; do not mix provisioning paths.

**Acceptance:** a factory-reset device can be enrolled without a Google account and still be managed, and the documentation states what the organisation can see.

---

## Later / exploratory

These are ideas, not commitments:

- **Certificate pinning with rotation** for self-hosters who can manage it.
- **Passkeys** as the primary web credential.
- **Location field encryption** with a searchable scheme or client-side decryption; requires careful key management and query redesign.
- **Offline map packs** from a self-hosted tile source, respecting OpenFreeMap fair use.
- **Multiple users per account** with roles and audit separation.
- **Native push for iOS** through APNs.
- **Reproducible Android builds** and a published attestation.
- **Signed web releases** with provenance.

---

## Explicit non-goals

- Remote wipe, password extraction, or device erase.
- Covert audio, camera, screen capture, or keylogging.
- SIM-removal lockout or a claim that it is possible.
- A hosted multi-tenant SaaS with a central control plane.
- Payments, subscriptions, or advertising.
- Bypassing Android permissions, Play Integrity, or OEM security.
- Guaranteed recovery of a factory-reset or powered-off device.

---

## How to contribute to the roadmap

Open an issue with:

1. The user problem, not only the proposed feature.
2. Which platform constraint applies.
3. The security and privacy impact.
4. A testable acceptance criterion.
5. Whether it works on Vercel Hobby + Neon Free.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the workflow. Roadmap items that weaken the threat model or require covert behavior will be declined.
