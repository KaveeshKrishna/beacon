# Contributing

Beacon is a security-sensitive, self-hosted project. Contributions are welcome when they preserve the threat model, keep the dependency surface small, and are honest about Android's limits.

By contributing, you agree that your contribution is licensed under **AGPL-3.0-or-later** and that you have the right to submit it. There is no separate CLA.

---

## Before you start

- Read [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) and [docs/LIMITATIONS.md](docs/LIMITATIONS.md).
- Open an issue for a large feature or a security-relevant change before writing code. A short design note saves a long review.
- Do **not** open a public issue for a vulnerability. Follow [SECURITY.md](SECURITY.md).
- Do not add analytics, advertising SDKs, session replay, crash-reporting SaaS, or covert device capabilities.
- Do not add personal domains, email addresses, server hostnames, keystores, or `.env` files.

---

## Development setup

### Requirements

- Node.js 22+ and npm 10+
- PostgreSQL with TLS (Neon Free is the reference), or a local Postgres for development
- JDK 17 and Android SDK 36 for the app

### Web

```bash
npm ci
cp .env.example .env.local
```

Generate independent secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" # AUTH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" # ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"    # CRON_SECRET
```

Set `DATABASE_URL` and `APP_URL=http://localhost:3000`, then:

```bash
npm run db:migrate
npm run dev
```

Development email is printed to the server log when no provider is configured and `EMAIL_DEV_LOG=true`.

### Android

```bash
cd android
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

The debug app is `dev.beacon.app.debug`. Set a local server with the pairing screen or `-PbeaconBaseUrl=https://your-tunnel.example`. The client only accepts HTTPS, so use a TLS tunnel or a deployed instance; do not weaken the HTTPS check for convenience.

---

## Checks

Run the same checks as CI before opening a pull request:

```bash
npm run typecheck
npm run lint
npm test
npm run build

cd android
./gradlew :app:assembleDebug
```

If you change the schema:

```bash
npm run db:generate
```

Commit the generated SQL and snapshot in `drizzle/`. Do not hand-edit applied migrations; add a new one. `npm run db:push` is for disposable local databases only.

If you change branding:

```bash
npm run icons
```

Commit the generated assets and the script together.

---

## Code standards

### TypeScript and React

- Strict TypeScript. No `any` unless it is at a boundary and justified.
- Server-only code imports `server-only`; secrets never reach a client component.
- Validate every external input with Zod at the route boundary.
- Use the existing response envelope: `{ ok: true, data }` or `{ ok: false, error }`.
- State-changing routes call `assertMethod`, `assertContentType`, and `assertTrustedOrigin`.
- Add a rate limit to any endpoint that costs money, sends email, writes rows, or checks a credential.
- Use the audit helper for security-relevant actions; never log tokens, coordinates, or email bodies.
- Keep components in the established visual system. No emojis, no gradient-heavy "AI" styling, no new font without a reason.
- Prefer server components. Add `"use client"` only at the smallest interactive boundary.
- Accessibility: label controls, preserve focus, respect reduced motion, and keep contrast at AA.

### Database

- UUID primary keys for externally referenced rows; integers for append-only telemetry where appropriate.
- Add indexes for every foreign key and for query predicates that will run on the hot path.
- Use `ON DELETE CASCADE` for user-owned data and `SET NULL` where retention must survive deletion (for example, delivery logs).
- Never store a plaintext session token, device token, pairing code, or recovery code.
- Encrypt new sensitive fields with `encryptSecret` or `encryptBuffer` and a unique AAD context.
- Document retention in [docs/OPERATIONS.md](docs/OPERATIONS.md).

### Android

- Kotlin, Compose, no WebView, no dynamic code loading.
- Do not add a networking library; use the existing `ApiClient`.
- Keep HTTPS-only, redirect-rejection, and no-cookie behavior.
- Encrypt anything persisted that contains a token, location, phone number, or message.
- Request permissions in context and explain why. Never request in the background.
- Do not add a foreground service type or exported component without a review.
- Respect `FLAG_SECURE` on release builds.
- Keep strings in resources if the change touches user-facing copy; the app is English-only today but should be ready for translation.

---

## Commits and pull requests

Use short imperative commit subjects, optionally with a Conventional Commits prefix:

```
fix: reject redirects in device client
feat: add photo retry backoff
docs: clarify cron cadence
```

A pull request should include:

- What changed and why.
- The user-visible or security impact.
- How it was tested, including the device/emulator and database version if relevant.
- Screenshots for UI changes, with no personal data.
- A migration note if the schema changed.
- A documentation update when behavior, configuration, or limits changed.

Keep pull requests focused. A security fix should not carry an unrelated redesign. Reviewers may ask for a threat-model update, a test, or a smaller scope.

### Review priorities

1. Authorization and data isolation.
2. Secret handling and logging.
3. Input validation and rate limits.
4. Android background behavior and battery impact.
5. Accessibility and honest copy.
6. Performance and bundle size.

---

## Tests

- Add a unit test for every crypto, parsing, geofence, or provider-ordering change.
- Tests live in `test/` and run with Vitest.
- Do not hit the network or a production database in a unit test; inject or mock the boundary.
- Integration tests against Postgres are planned; until then, describe the manual verification in the pull request.
- A bug fix should include a regression test when the bug is reachable in a unit test.

---

## Documentation

Update the relevant document when you change:

- An environment variable: `.env.example`, `README.md`, and `docs/DEPLOYMENT.md`.
- An endpoint or error code: `docs/API.md`.
- A device command or Android behavior: `docs/ANDROID.md`.
- Email behavior: `docs/EMAIL.md`.
- A security control or residual risk: `docs/THREAT_MODEL.md` and `SECURITY.md`.
- Operations or retention: `docs/OPERATIONS.md`.
- A limitation or non-goal: `docs/LIMITATIONS.md`.

Documentation should describe what the code actually does. If a behavior is best-effort, say so.

---

## Privacy and personal data

The repository is public and intended to be forkable.

- Use `example.com` and reserved example IP ranges in docs and tests.
- Never commit a real Relay/Resend/FCM key, database URL, domain, phone number, or email address.
- Scrub screenshots: no real device names, locations, email addresses, or server hostnames.
- Keep personal integration notes out of the tree; `.gitignore` excludes local integration notes and environment files.
- If you accidentally commit a secret, rotate it first, then rewrite history. Removing it from the latest commit is not enough.

---

## Releases

Maintainers tag releases from `main` after CI passes. Release notes come from [CHANGELOG.md](CHANGELOG.md). The Android APK is signed with a key held offline; contributors never need it.

The project follows a simple semantic version: `0.x` may change APIs, `1.0` will freeze the device contract and document a deprecation policy.

---

## Questions

Open a discussion or an issue with the `question` label. For anything that could expose user data, use the private security channel instead.
