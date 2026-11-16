/**
 * Pure geofence state evaluation.
 *
 * The phone and the server use the same rules so the cached fence state on the
 * device cannot disagree with the state that produces alerts. Keeping this
 * module free of database and framework imports makes every rule unit-testable.
 *
 * The problem this solves: a fix is not a precise point. A phone sitting in a
 * house with a 250 m fence can report positions tens of metres either side of
 * the edge all day. Treating each fix as truth produces enter/exit spam. A
 * state change therefore needs:
 *
 * 1. enough accuracy for the fence size,
 * 2. a position beyond a noise margin, and
 * 3. a second consistent reading for shallow (edge-adjacent) transitions.
 */

export const GEOFENCE_CONFIRM_READINGS = 2;

/** Accuracy worse than this cannot move a fence of the given radius. */
export function accuracyLimitM(radiusM: number): number {
  return Math.max(40, Math.min(500, Math.max(1, radiusM) * 0.5));
}

/**
 * The deadband around the radius. It scales with reported accuracy so a noisy
 * fix needs a larger move before it can change state, but never exceeds a
 * third of the radius, which would make small fences unusable.
 */
export function hysteresisMarginM(radiusM: number, accuracyM: number): number {
  const radius = Math.max(1, radiusM);
  const accuracy = Number.isFinite(accuracyM) && accuracyM > 0 ? accuracyM : 2_000;
  return Math.min(Math.max(accuracy * 0.75, 25), radius * 0.35);
}

export type GeofenceStateSnapshot = {
  inside: boolean | null;
  pendingInside: boolean | null;
  pendingSince: Date | null;
  lastFixAt: Date | null;
};

export type GeofenceObservation = {
  distanceM: number;
  accuracyM: number;
  recordedAt: Date;
  radiusM: number;
};

export type GeofenceTransition = "enter" | "exit" | null;

export type GeofenceDecisionReason =
  | "stale"
  | "inaccurate"
  | "deadband"
  | "baseline"
  | "stable"
  | "pending"
  | "confirmed"
  | "deep";

export type GeofenceDecision = {
  state: GeofenceStateSnapshot;
  transition: GeofenceTransition;
  reason: GeofenceDecisionReason;
};

function unchanged(
  state: GeofenceStateSnapshot,
  reason: GeofenceDecisionReason,
): GeofenceDecision {
  return { state, transition: null, reason };
}

/**
 * Evaluates one fix against one fence.
 *
 * `lastFixAt` is a monotonic watermark. A point that is not newer than the
 * watermark is ignored, which makes retried batches idempotent and stops a
 * late-arriving offline point from reversing newer state. The watermark still
 * advances for inaccurate fixes so an older queued point cannot be accepted
 * afterwards.
 */
export function evaluateGeofenceState(
  current: GeofenceStateSnapshot,
  observation: GeofenceObservation,
): GeofenceDecision {
  const recordedAt = observation.recordedAt;
  if (!(recordedAt instanceof Date) || !Number.isFinite(recordedAt.getTime())) {
    return unchanged(current, "stale");
  }

  if (current.lastFixAt && recordedAt.getTime() <= current.lastFixAt.getTime()) {
    return unchanged(current, "stale");
  }

  const withWatermark: GeofenceStateSnapshot = {
    ...current,
    lastFixAt: recordedAt,
  };

  const radiusM = Math.max(1, observation.radiusM);
  const accuracyM =
    Number.isFinite(observation.accuracyM) && observation.accuracyM > 0
      ? observation.accuracyM
      : 2_000;

  if (accuracyM > accuracyLimitM(radiusM)) {
    // The fix cannot be trusted to identify the side of this fence. Keep the
    // confirmed and pending state, but remember the watermark.
    return unchanged(withWatermark, "inaccurate");
  }

  const distanceM = Number.isFinite(observation.distanceM)
    ? Math.max(0, observation.distanceM)
    : Number.POSITIVE_INFINITY;
  const marginM = hysteresisMarginM(radiusM, accuracyM);

  const candidate: boolean | null =
    distanceM <= radiusM - marginM
      ? true
      : distanceM >= radiusM + marginM
        ? false
        : null;

  if (candidate === null) {
    // Ambiguous edge reading. Keep the confirmed state and drop a half-
    // confirmed candidate rather than letting it age into an alert.
    return {
      state: { ...withWatermark, pendingInside: null, pendingSince: null },
      transition: null,
      reason: "deadband",
    };
  }

  if (current.inside === null || current.lastFixAt === null) {
    // First observation for a new fence, or the first observation after this
    // rule set was deployed. Establish the baseline without an alert so an
    // upgrade cannot itself look like a crossing.
    return {
      state: {
        inside: candidate,
        pendingInside: null,
        pendingSince: null,
        lastFixAt: recordedAt,
      },
      transition: null,
      reason: "baseline",
    };
  }

  if (candidate === current.inside) {
    return {
      state: { ...withWatermark, pendingInside: null, pendingSince: null },
      transition: null,
      reason: "stable",
    };
  }

  const deep =
    (candidate && distanceM <= radiusM - 2 * marginM) ||
    (!candidate && distanceM >= radiusM + 2 * marginM);

  if (deep) {
    return {
      state: {
        inside: candidate,
        pendingInside: null,
        pendingSince: null,
        lastFixAt: recordedAt,
      },
      transition: candidate ? "enter" : "exit",
      reason: "deep",
    };
  }

  if (current.pendingInside === candidate) {
    // A second consecutive reading in the same direction confirms the
    // crossing. This is what rejects a single jittery or spoofed fix.
    return {
      state: {
        inside: candidate,
        pendingInside: null,
        pendingSince: null,
        lastFixAt: recordedAt,
      },
      transition: candidate ? "enter" : "exit",
      reason: "confirmed",
    };
  }

  return {
    state: {
      ...withWatermark,
      pendingInside: candidate,
      pendingSince: recordedAt,
    },
    transition: null,
    reason: "pending",
  };
}
