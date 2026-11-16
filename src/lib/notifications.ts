import "server-only";

import { and, asc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  deviceAlertState,
  devices,
  geofenceEvents,
  geofences,
  locations,
  users,
  type User,
} from "@/db/schema";
import { getEnv } from "@/lib/env";
import { sendTransactionalEmail } from "@/lib/email/send";
import { formatDateTime } from "@/lib/format";
import { googleMapsUrl, haversineMeters } from "@/lib/geo";
import {
  evaluateGeofenceState,
  type GeofenceDecision,
  type GeofenceStateSnapshot,
} from "@/lib/geofence-state";
import { logger } from "@/lib/logger";

type AlertField = "lowBatteryAt" | "offlineAt" | "simChangeAt";

async function claimAlert(
  deviceId: string,
  field: AlertField,
  cooldownHours: number,
): Promise<boolean> {
  await db()
    .insert(deviceAlertState)
    .values({ deviceId })
    .onConflictDoNothing();

  const cutoff = new Date(Date.now() - cooldownHours * 3_600_000);
  const column = deviceAlertState[field];
  const updated = await db()
    .update(deviceAlertState)
    .set({ [field]: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(deviceAlertState.deviceId, deviceId),
        or(isNull(column), lt(column, cutoff)),
      ),
    )
    .returning({ deviceId: deviceAlertState.deviceId });

  return updated.length > 0;
}

export async function clearOfflineAlert(deviceId: string): Promise<void> {
  await db()
    .update(deviceAlertState)
    .set({ offlineAt: null, updatedAt: new Date() })
    .where(eq(deviceAlertState.deviceId, deviceId));
}

function dashboardUrl(deviceId: string): string {
  return `${getEnv().APP_URL.replace(/\/$/, "")}/app/devices/${deviceId}`;
}

export async function evaluateGeofences(input: {
  deviceId: string;
  deviceName: string;
  latitude: number;
  longitude: number;
  accuracyM: number;
  recordedAt: Date;
  locationId: number | null;
}): Promise<void> {
  const rows = await db()
    .select({ geofence: geofences, user: users })
    .from(geofences)
    .innerJoin(devices, eq(devices.id, geofences.deviceId))
    .innerJoin(users, eq(users.id, devices.userId))
    .where(eq(geofences.deviceId, input.deviceId));

  for (const { geofence, user } of rows) {
    const decision = await claimGeofenceDecision(
      geofence,
      input.latitude,
      input.longitude,
      input.accuracyM,
      input.recordedAt,
    );
    if (!decision || decision.transition === null) continue;

    const inside = decision.transition === "enter";
    const type = decision.transition;

    let eventId: number | null = null;
    try {
      const [event] = await db()
        .insert(geofenceEvents)
        .values({
          geofenceId: geofence.id,
          deviceId: input.deviceId,
          type,
          occurredAt: input.recordedAt,
          locationId: input.locationId,
        })
        .returning({ id: geofenceEvents.id });
      eventId = event?.id ?? null;
    } catch (error) {
      logger.warn("geofence", "Could not record geofence event", {
        geofenceId: geofence.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const notify =
      user.notifyGeofence &&
      (inside ? geofence.notifyOnEnter : geofence.notifyOnExit);
    if (!notify) continue;

    try {
      await sendTransactionalEmail({
        to: user.email,
        userId: user.id,
        priority: user.emailProviderPriority,
        payload: {
          template: "geofence",
          data: {
            name: user.name,
            deviceName: input.deviceName,
            geofenceName: geofence.name,
            event: inside ? "entered" : "left",
            when: formatDateTime(input.recordedAt, user.timezone),
            url: dashboardUrl(input.deviceId),
            mapsUrl: googleMapsUrl(input.latitude, input.longitude),
          },
        },
      });
      if (eventId !== null) {
        await db()
          .update(geofenceEvents)
          .set({ notifiedAt: new Date() })
          .where(eq(geofenceEvents.id, eventId));
      }
    } catch {
      // The event remains in the log with notified_at = null for inspection.
    }
  }
}

const GEOFENCE_CLAIM_ATTEMPTS = 3;

function snapshotOf(geofence: typeof geofences.$inferSelect): GeofenceStateSnapshot {
  return {
    inside: geofence.lastInside,
    pendingInside: geofence.pendingInside,
    pendingSince: geofence.pendingSince,
    lastFixAt: geofence.lastFixAt,
  };
}

function sameState(
  a: GeofenceStateSnapshot,
  b: GeofenceStateSnapshot,
): boolean {
  return (
    a.inside === b.inside &&
    a.pendingInside === b.pendingInside &&
    a.pendingSince?.getTime() === b.pendingSince?.getTime() &&
    a.lastFixAt?.getTime() === b.lastFixAt?.getTime()
  );
}

/**
 * Moves one fence's state with a compare-and-set update. The update only
 * matches when the row still holds the state that was evaluated, so two
 * concurrent `after()` tasks cannot both claim the same transition. A losing
 * writer reloads and re-evaluates; the new state usually makes its fix stale.
 * Only the winning writer returns a transition, and therefore inserts an event.
 */
async function claimGeofenceDecision(
  initial: typeof geofences.$inferSelect,
  latitude: number,
  longitude: number,
  accuracyM: number,
  recordedAt: Date,
): Promise<GeofenceDecision | null> {
  let current = snapshotOf(initial);

  for (let attempt = 0; attempt < GEOFENCE_CLAIM_ATTEMPTS; attempt += 1) {
    const decision = evaluateGeofenceState(current, {
      distanceM: haversineMeters(
        { latitude, longitude },
        { latitude: initial.centerLat, longitude: initial.centerLon },
      ),
      accuracyM,
      recordedAt,
      radiusM: initial.radiusM,
    });

    if (sameState(current, decision.state)) return decision;

    const claimed = await db()
      .update(geofences)
      .set({
        lastInside: decision.state.inside,
        pendingInside: decision.state.pendingInside,
        pendingSince: decision.state.pendingSince,
        lastFixAt: decision.state.lastFixAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(geofences.id, initial.id),
          current.lastFixAt
            ? eq(geofences.lastFixAt, current.lastFixAt)
            : isNull(geofences.lastFixAt),
          current.inside === null
            ? isNull(geofences.lastInside)
            : eq(geofences.lastInside, current.inside),
          current.pendingInside === null
            ? isNull(geofences.pendingInside)
            : eq(geofences.pendingInside, current.pendingInside),
        ),
      )
      .returning({ id: geofences.id });

    if (claimed.length > 0) return decision;

    const rows = await db()
      .select()
      .from(geofences)
      .where(eq(geofences.id, initial.id))
      .limit(1);
    const fresh = rows[0];
    if (!fresh) return null;
    current = snapshotOf(fresh);
  }

  logger.warn("geofence", "Gave up claiming geofence state after conflicts", {
    geofenceId: initial.id,
    deviceId: initial.deviceId,
  });
  return null;
}

/**
 * Retry geofence emails that were never marked notified. The original path is
 * best-effort because it runs after location ingestion; a transient email
 * failure should not lose the alert. The update claims each row first so two
 * overlapping cron runs cannot send the same event twice.
 */
export async function retryGeofenceNotifications(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 3_600_000);
  const rows = await db()
    .select({
      event: geofenceEvents,
      geofence: geofences,
      device: devices,
      user: users,
      location: locations,
    })
    .from(geofenceEvents)
    .innerJoin(geofences, eq(geofences.id, geofenceEvents.geofenceId))
    .innerJoin(devices, eq(devices.id, geofenceEvents.deviceId))
    .innerJoin(users, eq(users.id, devices.userId))
    .leftJoin(locations, eq(locations.id, geofenceEvents.locationId))
    .where(
      and(
        isNull(geofenceEvents.notifiedAt),
        gt(geofenceEvents.occurredAt, cutoff),
        isNull(devices.revokedAt),
        isNull(users.deletedAt),
        eq(users.notifyGeofence, true),
        or(
          and(
            eq(geofenceEvents.type, "enter"),
            eq(geofences.notifyOnEnter, true),
          ),
          and(
            eq(geofenceEvents.type, "exit"),
            eq(geofences.notifyOnExit, true),
          ),
        ),
      ),
    )
    .orderBy(asc(geofenceEvents.occurredAt))
    .limit(50);

  let sent = 0;
  for (const { event, geofence, device, user, location } of rows) {
    const claimed = await db()
      .update(geofenceEvents)
      .set({ notifiedAt: new Date() })
      .where(
        and(
          eq(geofenceEvents.id, event.id),
          isNull(geofenceEvents.notifiedAt),
        ),
      )
      .returning({ id: geofenceEvents.id });
    if (claimed.length === 0) continue;

    try {
      await sendTransactionalEmail({
        to: user.email,
        userId: user.id,
        priority: user.emailProviderPriority,
        payload: {
          template: "geofence",
          data: {
            name: user.name,
            deviceName: device.name,
            geofenceName: geofence.name,
            event: event.type === "enter" ? "entered" : "left",
            when: formatDateTime(event.occurredAt, user.timezone),
            url: dashboardUrl(event.deviceId),
            mapsUrl: googleMapsUrl(
              location?.latitude ?? geofence.centerLat,
              location?.longitude ?? geofence.centerLon,
            ),
          },
        },
      });
      sent += 1;
    } catch {
      // Release the claim so the next maintenance run can try again.
      await db()
        .update(geofenceEvents)
        .set({ notifiedAt: null })
        .where(eq(geofenceEvents.id, event.id));
    }
  }

  return sent;
}

export async function maybeSendLowBatteryAlert(input: {
  user: User;
  deviceId: string;
  deviceName: string;
  batteryLevel: number | null | undefined;
  isCharging: boolean | null | undefined;
  recordedAt: Date;
}): Promise<void> {
  if (!input.user.notifyLowBattery) return;
  if (input.isCharging) return;
  if (input.batteryLevel === null || input.batteryLevel === undefined) return;
  if (input.batteryLevel > 15) return;

  const claimed = await claimAlert(input.deviceId, "lowBatteryAt", 12);
  if (!claimed) return;

  try {
    await sendTransactionalEmail({
      to: input.user.email,
      userId: input.user.id,
      priority: input.user.emailProviderPriority,
      payload: {
        template: "low_battery",
        data: {
          name: input.user.name,
          deviceName: input.deviceName,
          battery: `${input.batteryLevel}%`,
          when: formatDateTime(input.recordedAt, input.user.timezone),
          url: dashboardUrl(input.deviceId),
        },
      },
    });
  } catch {
    // Delivery is best-effort; the alert state prevents a retry storm.
  }
}

export async function maybeSendSimChangeAlert(input: {
  user: User;
  deviceId: string;
  deviceName: string;
  previousSimState: string | null;
  nextSimState: string | null;
}): Promise<void> {
  const previous = (input.previousSimState ?? "").toUpperCase();
  const next = (input.nextSimState ?? "").toUpperCase();
  if (!next || next === previous) return;
  if (previous === "" || previous === "READY") {
    if (next === "READY") return;
  } else {
    return;
  }

  const claimed = await claimAlert(input.deviceId, "simChangeAt", 6);
  if (!claimed) return;

  try {
    await sendTransactionalEmail({
      to: input.user.email,
      userId: input.user.id,
      priority: input.user.emailProviderPriority,
      payload: {
        template: "sim_change",
        data: {
          name: input.user.name,
          deviceName: input.deviceName,
          when: formatDateTime(new Date(), input.user.timezone),
          url: dashboardUrl(input.deviceId),
        },
      },
    });
  } catch {
    // Best-effort.
  }
}

export async function sendOfflineAlerts(): Promise<number> {
  const rows = await db()
    .select({ device: devices, user: users })
    .from(devices)
    .innerJoin(users, eq(users.id, devices.userId))
    .where(and(isNull(devices.revokedAt), isNull(users.deletedAt)));

  let sent = 0;
  const now = Date.now();

  for (const { device, user } of rows) {
    if (!user.notifyOffline) continue;
    if (!device.lastSeenAt) continue;
    const thresholdMinutes = device.config?.offlineAlertMinutes ?? 45;
    if (now - device.lastSeenAt.getTime() < thresholdMinutes * 60_000) {
      continue;
    }
    const claimed = await claimAlert(device.id, "offlineAt", 24);
    if (!claimed) continue;

    try {
      await sendTransactionalEmail({
        to: user.email,
        userId: user.id,
        priority: user.emailProviderPriority,
        payload: {
          template: "offline",
          data: {
            name: user.name,
            deviceName: device.name,
            lastSeen: formatDateTime(device.lastSeenAt, user.timezone),
            url: dashboardUrl(device.id),
          },
        },
      });
      sent += 1;
    } catch {
      // Continue with other devices.
    }
  }

  return sent;
}

export async function markDeviceAlertResolved(deviceId: string): Promise<void> {
  await db()
    .update(deviceAlertState)
    .set({ offlineAt: null, updatedAt: new Date() })
    .where(eq(deviceAlertState.deviceId, deviceId));
}

export async function countLocationsForDevice(deviceId: string): Promise<number> {
  const rows = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(locations)
    .where(eq(locations.deviceId, deviceId));
  return rows[0]?.count ?? 0;
}
