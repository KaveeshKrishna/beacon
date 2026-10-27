# Security Policy

Beacon handles location history and device control. Security reports are taken seriously, and good-faith research is welcome.

**Do not open a public issue for a vulnerability.** Use a private channel so users have time to patch.

---

## Supported versions

| Version | Supported |
| --- | --- |
| `0.1.x` | Security fixes, best effort |
| Older | Not supported |

`v0.1.0` is a self-hosted beta. It has not been independently audited. See [docs/LIMITATIONS.md](docs/LIMITATIONS.md) before relying on it for personal safety.

---

## Reporting a vulnerability

Preferred: open a **private security advisory** in the repository's GitHub Security tab. This keeps the report, discussion, and fix private until disclosure.

Include:

1. Affected version or commit.
2. Deployment type (self-hosted, preview, local) and relevant configuration, with secrets removed.
3. Reproduction steps or a proof of concept.
4. Impact: what data or capability an attacker gains.
5. Any suggested fix or mitigation.
6. Whether you intend to publish, and a preferred credit name.

If private advisories are unavailable, contact the operator of the instance where you found the issue. For vulnerabilities in this repository itself, open a minimal public issue that asks for a private contact channel **without disclosing the details**.

### What to expect

- Acknowledgement within 5 business days.
- An initial assessment and severity within 10 business days.
- A fix or mitigation plan for confirmed issues, with credit unless you prefer otherwise.
- Coordination on a disclosure date, normally within 90 days. Earlier disclosure is considered if the issue is being exploited.

This is a volunteer project. These timelines are targets, not contractual guarantees.

### Safe harbor

We will not pursue legal action for research that:

- Stays within your own account and devices, or a test instance you control.
- Avoids accessing, modifying, or deleting other people's data.
- Avoids denial-of-service, spam, and automated scanning that degrades service.
- Gives us reasonable time to fix the issue before publication.
- Follows applicable law.

Do not test against a hosted instance you do not own without written permission. If in doubt, ask first.

---

## Scope

In scope:

- Authentication, sessions, MFA, recovery, and account lifecycle.
- Authorization boundaries between users, devices, and photos.
- Device pairing, bearer tokens, and command handling.
- Location, geofence, command, and photo APIs.
- Cryptographic storage and key handling.
- CSP, CSRF, origin checks, rate limiting, and header configuration.
- Android token storage, local queue encryption, exported components, and intent handling.
- Supply-chain issues in direct dependencies or the build.

Out of scope:

- Findings that require a rooted device with an unlocked bootloader and a live privileged attacker, unless the impact exceeds the documented threat model.
- Physical attacks that require disassembly or chip-off.
- Social engineering of the operator.
- Missing features that are explicitly listed as limitations (for example, no remote wipe or no covert camera).
- Reports from automated scanners without a demonstrated impact.
- Denial of service through volumetric traffic.
- Issues in Vercel, Neon, Relay, Resend, OpenFreeMap, or Android itself. Report those upstream.

The full assets, adversaries, and residual risks are in [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).

---

## Security design summary

| Area | Control |
| --- | --- |
| Passwords | Argon2id with per-password salt; optional Have I Been Pwned k-anonymity check |
| Web sessions | Opaque 256-bit tokens; HMAC-SHA-256 at rest; HttpOnly, Secure, SameSite=Lax, `__Host-` in production |
| MFA | TOTP with replay protection, email OTP with attempt limits, single-use recovery codes; every session must pass the enabled factor before page or API access |
| Device auth | One-use pairing code → per-device bearer token; HMAC at rest; immediate revocation |
| Encryption at rest | AES-256-GCM with context-bound AAD for TOTP secrets, SMS numbers, FCM tokens, and photos |
| Photo intake | Decode-and-re-encode with a pixel ceiling; EXIF, ICC and appended payloads are discarded before encryption |
| Request integrity | Trusted `Origin`, JSON content type, strict CSP with per-request nonce, HSTS |
| Abuse control | Database-backed fixed-window rate limits on auth, pairing, ingest, commands, photos, and test email; limiter failures fail closed |
| Client address | Forwarded headers are trusted only on Vercel or when a self-hoster explicitly declares a proxy |
| Audit | Append-only application writes for security-relevant actions; hashed IPs and user agents |
| Android | HTTPS-only, no redirects, Keystore-encrypted token and queue, `FLAG_SECURE` release builds, backups disabled |
| Privacy | No analytics, trackers, session replay, or third-party scripts; map tiles fetched by the browser only for the visible viewport |

Secrets live only in environment variables. No production credentials, keystores, or personal domains are committed. `.env*` is ignored except `.env.example`, which contains placeholders.

---

## Hardening checklist

Use this before exposing an instance to the public internet. It is also the checklist referenced by the release plan.

- [ ] `APP_URL` is the final HTTPS origin, with no trailing slash.
- [ ] `TRUSTED_PROXY` matches the deployment: `vercel` on Vercel, `forwarded` only behind a proxy that overwrites the peer address, otherwise `none`.
- [ ] `AUTH_SECRET`, `ENCRYPTION_KEY`, and `CRON_SECRET` are independently generated and stored in a password manager.
- [ ] `ENCRYPTION_KEY` decodes to exactly 32 bytes and has an offline backup.
- [ ] `EMAIL_DEV_LOG=false` and `ALLOW_SIGNUPS` reflects your intent.
- [ ] Relay/Resend domains are verified; SPF, DKIM, and DMARC are configured.
- [ ] Cron is protected and scheduled at least every 15 minutes.
- [ ] Database backups are enabled and a restore has been tested.
- [ ] Neon and Vercel access is limited to the operator, with MFA on both accounts.
- [ ] No `.env`, keystore, `local.properties`, APK, or personal notes are tracked.
- [ ] The release APK is signed with a key that is not in the repository, and its SHA-256 is published.
- [ ] `FLAG_SECURE` is active in the release build.
- [ ] Rate limits have been exercised with a manual burst.
- [ ] Dependabot alerts and code scanning are enabled.
- [ ] Logs have been reviewed for tokens, coordinates, and email bodies.
- [ ] The incident response steps in [docs/OPERATIONS.md](docs/OPERATIONS.md#6-incident-response) have a named owner.

---

## Known residual risks

These are accepted for `v0.1.0` and documented rather than hidden:

1. No independent audit or penetration test.
2. No certificate pinning; a compromised system CA, or a rooted device with a modified trust store, can intercept Android traffic. User-installed CAs are not trusted.
3. No hardware attestation; a rooted or modified client can report false locations.
4. Location history is not end-to-end encrypted; the operator can read it.
5. Photos are decrypted in the server process to serve them.
6. IP addresses are keyed-hashed, not anonymous. The HMAC key is `AUTH_SECRET`; if that secret leaks, IPv4 space can be enumerated.
7. Email is not end-to-end encrypted.
8. SIM removal cannot be prevented, and factory reset removes protection.
9. The free-tier cron is daily unless an external scheduler is added.
10. FCM is not wired into the Android app, so command latency is bounded by polling.
11. The 10-failure account lockout can be abused to deny sign-in for 15 minutes. The IP limiter raises the cost, but a distributed attacker who knows an address can still trigger it.
12. Device bearer tokens are long-lived credentials. Anyone who extracts one from a rooted device can act as that device until it is revoked.
13. Relay, Resend, FCM, and the Android custom-scheme pairing link are trust boundaries. A compromised provider or a malicious `beacon://pair` link can observe or redirect the pairing attempt; the app always shows the server URL before pairing, but it cannot prove the QR code came from your instance.

See [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) for the full analysis.

---

## Dependency and release security

- `package-lock.json` is committed; CI uses `npm ci`.
- `npm audit` and Dependabot cover the web dependency tree.
- Gradle dependencies are pinned in `android/app/build.gradle.kts` and the plugin block.
- GitHub Actions are pinned to major versions; pin to commit SHAs before a high-assurance release.
- Release artifacts are built from a clean checkout. The APK checksum is published next to the download.
- The Android signing key is generated and backed up by the operator, never by the project.

Report a suspected supply-chain issue through the same private channel.

---

## Contact and disclosure

There is no security email address in this repository by design; a personal address would outlive the maintainer and attract spam. Use the repository's private advisory feature or the operator's published contact on the instance you use.

Credit is given in release notes unless requested otherwise. Thank you for helping keep self-hosted location data safe.
