# Implementation Plan — Reliable, battery-frugal tracking (0.1.9)

**Status:** Complete — shipped in 0.1.9
**Scope:** Server geofence evaluation, Android tracking cadence and sampling, offline queue recovery, tests, and documentation.
**Supersedes:** None. There was no outstanding implementation-plan file in the repository (the 0.1.6 and 0.1.7 plans were removed when their releases shipped).

---

## 1. Problem statement

Two problems are being fixed together because they share the same root causes:

1. **False "entered home" alerts.** A phone that has been inside a home fence for hours still receives enter (and sometimes exit) alerts.
2. **Battery cost of reliable tracking.** The opt-out instant-fence watcher keeps GPS active every two minutes all day, and every baseline check-in also wakes GPS even when a cheap network fix is already available.

The goal is a *lower* number of false alerts, fewer dropped or stalled check-ins, and less radio and GPS time — not a more aggressive tracker.

## 2. Root causes found in the code

### 2.1 Server geofence evaluation has no noise handling

`evaluateGeofences()` in `src/lib/notifications.ts` compares one fix to the circle and flips state immediately:

- **No hysteresis.** A fix 2 m outside a 250 m fence is an "exit"; the next fix 2 m inside is an "enter". Indoor GPS/network jitter around the edge produces a stream of events.
- **No accuracy gate.** A network fix with 800 m accuracy is treated exactly like a 10 m GPS fix.
- **No confirmation.** A single bad fix can move `lastInside` and send an email.
- **No ordering guard.** `after()` tasks from two ingest requests run concurrently and can finish out of order. An older batch can overwrite a newer state and then the newer state arrives as a second transition. Retried or late queue batches make this worse.
- **Non-atomic transition.** Two concurrent evaluations can both read `lastInside = false` and both insert an `enter` event.

### 2.2 The phone repeats the same mistakes

`GeofenceMath.containing()` and `AppPreferences.observeGeofence()` use the raw radius with no accuracy or hysteresis. A jittery fix flips the cached state, which triggers a zero-gap upload and a scheduler restart; flipping back triggers another. `applyConfig()` also overwrites the cached state from a single fix.

### 2.3 Tracking can go quiet when Android filters fixes

The tracking service syncs **only** from location callbacks. It asks for updates with a `minDistance` filter, and Android may suppress callbacks when the phone is stationary. When the fence watcher is active, periodic WorkManager is cancelled. A stationary phone can therefore miss its documented check-in cadence unless a command poll heartbeat happens to run.

### 2.4 Battery-heavy sampling

- The fence watcher asks GPS **and** network for a fix every two minutes, even when the phone is 2 km inside a fence.
- Baseline sampling requests GPS and network together and waits up to 15 s, even when a good network fix is available immediately.
- The command-only control worker runs every 15 minutes for every profile, including the battery-priority 60-minute profile.

### 2.5 Poison queue rows can stall uploads

A server-side `422`/`400` for one malformed point is classified as retryable. Because uploads are ordered, the same batch is retried forever and all newer points wait behind it. A schema change or one corrupt row can silently stop history.

---

## 3. Design

### 3.1 Shared geofence state machine

Use the **same rules** on the server and the phone so the two never disagree about the current fence state.

For a fence with radius `r` and fix accuracy `a`:

- **Accuracy gate:** ignore the fix for state purposes when `a > max(40, min(500, r × 0.5))`.
- **Hysteresis margin:** `m = min(max(a × 0.75, 25), r × 0.35)`.
- **Enter threshold:** `r − m`. **Exit threshold:** `r + m`.
- **Deadband:** between the two thresholds the state is unchanged; the reading is ambiguous.
- **Deep transition:** `distance ≤ r − 2m` (enter) or `distance ≥ r + 2m` (exit) confirms immediately.
- **Shallow transition:** the first reading in a new state is *pending*; a second consecutive reading in that state confirms it.
- **Baseline:** the first confident reading for a fence records state without an alert.
- **Ordering:** a reading is ignored when its `recordedAt` is not newer than the fence's `lastFixAt`; the watermark always advances.
- **Atomic claim:** the state update is conditional on the `lastFixAt` value that was read. A conflicting concurrent writer retries against the fresh row. Only the writer that moves the state inserts an event.

Resulting behaviour for a 250 m home fence with 80 m fixes: the phone must be about 60 m inside the edge to count as entering, about 70 m outside the edge to count as leaving, and a shallow edge reading must repeat before an alert fires. A 250 m fix is ignored entirely.

### 3.2 Server schema

`geofences` gains three columns:

| Column | Purpose |
| --- | --- |
| `pending_inside` | Candidate state awaiting a second consistent fix |
| `pending_since` | When the candidate was first seen (audit and diagnostics) |
| `last_fix_at` | Monotonic watermark for out-of-order and retried batches |

Geometry edits reset `last_inside`, `pending_inside`, `pending_since`, and `last_fix_at` together.

### 3.3 Ingest ordering

- Evaluate geofences only when the newest point in the batch was actually inserted, so a retried all-duplicate batch does nothing.
- Never move `devices.lastLocationAt`, battery, charging, or network fields backwards when a late batch arrives.
- Keep `lastSeenAt` updating on every accepted request (it records contact, not fix age).

### 3.4 Android state and cadence

- Cache `pending_inside`, `pending_since`, and `last_fix_at` in preferences next to the confirmed fence id.
- Feed accuracy and fix time into the same evaluator.
- A confirmed crossing syncs immediately; a pending or deadband reading does not.
- Adaptive fence watcher:
  - **Near a fence edge** (≤ 250 m from any boundary), or when the state is unknown: 2-minute fixes, GPS + network, 50 m displacement.
  - **Deep inside or far outside:** 5-minute fixes, network provider first, 100 m displacement.
  - **Lost mode:** unchanged — 30-second high-accuracy fixes.
- A once-a-minute service ticker requests a check-in when the effective interval is due and no location callback has produced one. This guarantees the documented cadence when Android suppresses stationary updates.
- On service start (including lost-mode enable), run one immediate sync so tracking does not wait for the first callback.

### 3.5 Battery: sampling and workers

- Low-power sampling becomes staged: try network/passive for up to 7 s; only fall back to GPS for the remaining 8 s if no acceptable network fix arrived. High-accuracy (lost mode, manual locate, fence editor) is unchanged.
- The control worker interval follows the profile: 30 minutes for `low`, 15 minutes for `balanced` and `high`. Command latency for `low` becomes up to ~30 minutes; this is documented.
- No new wake locks, exact alarms, or always-on GPS.

### 3.6 Queue recovery

- Treat `400`, `413`, `415`, and `422` as permanent for the current batch: record the server message, delete those queued rows, and continue with newer points. Authentication still stops tracking and asks for re-pair.
- Treat `408`, `429`, `5xx`, and network failures as retryable.
- Avoid re-queuing an identical fix returned twice from `lastKnownLocation` (same timestamp, coordinates, and accuracy).

### 3.7 UI guidance

- Web and Android fence editors explain that indoor fixes wander and recommend a 150–250 m radius for a home.
- The dashboard copy states that edge jitter is debounced and that a first fence reading only establishes a baseline.

---

## 4. Work items

| # | Item | Files | Acceptance |
| --- | --- | --- | --- |
| 1 | Pure geofence state machine + unit tests | `src/lib/geofence-state.ts`, `test/geofence-state.test.ts` | All noise, accuracy, ordering, baseline, and confirmation cases covered |
| 2 | Schema + migration | `src/db/schema.ts`, `drizzle/0005_*.sql`, `drizzle/meta/*` | `npm run db:generate` produces the migration cleanly |
| 3 | Server evaluation rewrite | `src/lib/notifications.ts` | Concurrent/out-of-order evaluation cannot duplicate or reverse a transition |
| 4 | Ingest ordering and duplicate skip | `src/app/api/device/locations/route.ts` | Late batch cannot move device telemetry backwards; all-duplicate batch does no geofence work |
| 5 | Geometry reset | `src/app/api/geofences/[id]/route.ts` | Geometry edit clears pending and watermark |
| 6 | Android evaluator + tests | `core/Geofence.kt`, `test/.../GeofenceMathTest.kt` | Same rules as server, including deadband and confirmation |
| 7 | Android preference state | `core/AppPreferences.kt` | Pending/watermark persisted and reset correctly |
| 8 | Adaptive watcher + cadence ticker | `tracking/TrackingService.kt` | No missed check-in while stationary; GPS only near edges or in lost mode |
| 9 | Staged sampler | `location/LocationSampler.kt` | Low-power check-in avoids GPS when a usable network fix arrives |
| 10 | Control worker profile cadence | `location/TrackingScheduler.kt`, `work/BeaconControlWorker.kt` | `low` polls every 30 min; others 15 min |
| 11 | Queue poison handling + duplicate fix suppression | `sync/SyncEngine.kt`, `data/QueueStore.kt` | One bad batch cannot block newer history |
| 12 | UI copy | `src/components/app/device/geofences-tab.tsx`, `ui/GeofenceEditor.kt` | Guidance visible in both editors |
| 13 | Documentation | `README.md`, `CHANGELOG.md`, `docs/*.md` | Behaviour, battery cost, latency, and migration are accurate |

---

## 5. Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
cd android && ./gradlew :app:testDebugUnitTest :app:assembleDebug :app:assembleRelease :app:lintRelease
```

Plus a manual reasoning pass over these sequences:

1. Inside a 250 m home fence, feed alternating 240 m and 260 m fixes with 40 m accuracy: zero enter/exit events.
2. Outside, feed a single 300 m fix, then a 260 m fix: no event. Feed two consecutive 300 m fixes: one exit event.
3. Feed a 900 m-accuracy fix 4 km away: ignored.
4. Deliver batches with `recordedAt` out of order: state follows the newest timestamp only.
5. Retry the same batch: no duplicate event.
6. Edit the fence geometry: the next fix establishes a baseline without an alert.
7. Stationary phone with the fence watcher active: check-ins still arrive at the configured interval.
8. Server returns `422`: the batch is dropped, newer points continue uploading.

---

## 6. Documentation updates

- `CHANGELOG.md` — new `0.1.9` entry with migration, behaviour, and battery notes.
- `docs/ARCHITECTURE.md` — ingest state machine, new columns, ordering guarantees.
- `docs/ANDROID.md` — adaptive watcher, cadence ticker, staged sampling, control worker profile cadence, fence guidance.
- `docs/LIMITATIONS.md` — hysteresis latency, accuracy gate, small-fence caveat, low-profile command latency.
- `docs/API.md` — ingest ordering/duplicate semantics; no response shape change.
- `docs/DEPLOYMENT.md` — migration `0005` and the Android/client-only split.
- `docs/OPERATIONS.md` — what to check if geofence events stop appearing.
- `docs/ROADMAP.md` / `README.md` — remove this work from the open reliability gaps and link this plan.

---

## 7. Progress

- [x] Read architecture, Android, limitations, roadmap, changelog, and the relevant code.
- [x] Identify the false-alert and battery root causes.
- [x] Implement server state machine and migration.
- [x] Implement Android evaluator, cadence, sampler, and queue fixes.
- [x] Add tests.
- [x] Update documentation.
- [x] Run the full verification suite.

### Verification results

- `npm run typecheck` — pass.
- `npm run lint` — pass.
- `npm test` — 70 tests across 10 files pass, including 13 new state-machine tests.
- `npm run build` — pass.
- `:app:testDebugUnitTest` — 34 tests pass, including 11 new evaluator tests.
- `:app:assembleDebug`, `:app:assembleRelease`, `:app:lintRelease` — pass.
- Release APK: versionCode 10, versionName 0.1.9, 24,959,555 bytes, SHA-256 `2dfe3e68eb55d699f31a14eb73c489ed2280323f2f260b1ddbf806f5d47360fa`.
