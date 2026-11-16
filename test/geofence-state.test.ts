import { describe, expect, it } from "vitest";

import {
  accuracyLimitM,
  evaluateGeofenceState,
  GEOFENCE_CONFIRM_READINGS,
  hysteresisMarginM,
  type GeofenceObservation,
  type GeofenceStateSnapshot,
} from "@/lib/geofence-state";

const radiusM = 250;
const empty: GeofenceStateSnapshot = {
  inside: null,
  pendingInside: null,
  pendingSince: null,
  lastFixAt: null,
};

function at(minutes: number): Date {
  return new Date(Date.UTC(2026, 0, 1, 12, minutes));
}

function observe(
  state: GeofenceStateSnapshot,
  distanceM: number,
  accuracyM: number,
  minutes: number,
): ReturnType<typeof evaluateGeofenceState> {
  return evaluateGeofenceState(state, {
    distanceM,
    accuracyM,
    recordedAt: at(minutes),
    radiusM,
  } satisfies GeofenceObservation);
}

describe("geofence state machine", () => {
  it("scales the accuracy gate with fence size but never past 500 m", () => {
    expect(accuracyLimitM(50)).toBe(40);
    expect(accuracyLimitM(250)).toBe(125);
    expect(accuracyLimitM(800)).toBe(400);
    expect(accuracyLimitM(5_000)).toBe(500);
  });

  it("caps hysteresis at a third of the radius", () => {
    expect(hysteresisMarginM(250, 40)).toBe(30);
    expect(hysteresisMarginM(250, 8)).toBe(25);
    expect(hysteresisMarginM(50, 40)).toBe(17.5);
    expect(hysteresisMarginM(1_000, 900)).toBe(350);
  });

  it("establishes a baseline without alerting", () => {
    const decision = observe(empty, 10, 20, 0);
    expect(decision.transition).toBeNull();
    expect(decision.reason).toBe("baseline");
    expect(decision.state.inside).toBe(true);
    expect(decision.state.pendingInside).toBeNull();
    expect(decision.state.lastFixAt).toEqual(at(0));
  });

  it("does not fire when a jittering fix crosses the raw radius", () => {
    let state = observe(empty, 100, 40, 0).state;
    for (let i = 1; i <= 8; i += 1) {
      const distance = i % 2 === 0 ? 240 : 260;
      const decision = observe(state, distance, 40, i);
      expect(decision.transition).toBeNull();
      state = decision.state;
    }
    expect(state.inside).toBe(true);
    expect(state.pendingInside).toBeNull();
  });

  it("requires two consecutive shallow readings before confirming a crossing", () => {
    const state = observe(empty, 100, 40, 0).state; // inside baseline
    const first = observe(state, 300, 40, 1);
    expect(first.transition).toBeNull();
    expect(first.reason).toBe("pending");
    expect(first.state.inside).toBe(true);
    expect(first.state.pendingInside).toBe(false);

    const second = observe(first.state, 300, 40, 2);
    expect(second.transition).toBe("exit");
    expect(second.reason).toBe("confirmed");
    expect(second.state.inside).toBe(false);
    expect(second.state.pendingInside).toBeNull();
  });

  it("confirms a deep crossing immediately", () => {
    const state = observe(empty, 100, 40, 0).state;
    const decision = observe(state, 350, 40, 1);
    expect(decision.transition).toBe("exit");
    expect(decision.reason).toBe("deep");
    expect(decision.state.inside).toBe(false);
  });

  it("confirms a shallow entrance after a second reading", () => {
    let state = observe(empty, 500, 40, 0).state; // outside baseline
    expect(state.inside).toBe(false);

    const first = observe(state, 200, 40, 1);
    expect(first.transition).toBeNull();
    expect(first.state.pendingInside).toBe(true);
    state = first.state;

    const second = observe(state, 200, 40, 2);
    expect(second.transition).toBe("enter");
    expect(second.state.inside).toBe(true);
  });

  it("drops a pending crossing when a deadband reading arrives", () => {
    let state = observe(empty, 100, 40, 0).state;
    state = observe(state, 300, 40, 1).state;
    expect(state.pendingInside).toBe(false);

    const deadband = observe(state, 260, 40, 2);
    expect(deadband.transition).toBeNull();
    expect(deadband.reason).toBe("deadband");
    expect(deadband.state.inside).toBe(true);
    expect(deadband.state.pendingInside).toBeNull();
  });

  it("ignores a fix that is too inaccurate to see the fence edge", () => {
    const state = observe(empty, 100, 20, 0).state;
    const decision = observe(state, 4_000, 900, 1);
    expect(decision.transition).toBeNull();
    expect(decision.reason).toBe("inaccurate");
    expect(decision.state.inside).toBe(true);
    // The watermark still advances so an older queued fix cannot be accepted.
    expect(decision.state.lastFixAt).toEqual(at(1));
  });

  it("does not establish a baseline from an unusable first fix", () => {
    const weak = observe(empty, 10, 900, 0);
    expect(weak.reason).toBe("inaccurate");
    expect(weak.state.inside).toBeNull();

    const good = observe(weak.state, 10, 20, 1);
    expect(good.reason).toBe("baseline");
    expect(good.state.inside).toBe(true);
  });

  it("ignores out-of-order fixes", () => {
    const state = observe(empty, 500, 20, 5).state;
    const late = observe(state, 10, 20, 3);
    expect(late.transition).toBeNull();
    expect(late.reason).toBe("stale");
    expect(late.state).toEqual(state);
  });

  it("is idempotent when the same batch is retried", () => {
    let state = observe(empty, 100, 40, 0).state;
    const first = observe(state, 300, 40, 1);
    state = first.state;
    const retry = observe(state, 300, 40, 1);
    expect(retry.transition).toBeNull();
    expect(retry.state).toEqual(state);

    const confirm = observe(state, 300, 40, 2);
    expect(confirm.transition).toBe("exit");
    const replay = observe(confirm.state, 300, 40, 2);
    expect(replay.transition).toBeNull();
    expect(replay.state).toEqual(confirm.state);
  });

  it("needs exactly the documented number of confirmation readings", () => {
    expect(GEOFENCE_CONFIRM_READINGS).toBe(2);
  });
});
