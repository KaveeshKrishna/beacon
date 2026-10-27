import "server-only";

import { and, eq, isNull, lt, or, sql } from "drizzle-orm";

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
import { googleMapsUrl } from "@/lib/geo";

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
  userId: string;
  latitude: number;
  longitude: number;
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
    const inside = isInside(
      input.latitude,
      input.longitude,
      geofence.centerLat,
      geofence.centerLon,
      geofence.radiusM,
    );

    if (geofence.lastInside === inside) continue;

    await db()
      .update(geofences)
      .set({ lastInside: inside, updatedAt: new Date() })
      .where(eq(geofences.id, geofence.id));

    if (geofence.lastInside === null) {
      // The first observation establishes the baseline; it should not alert.
      continue;
    }

    const type = inside ? "enter" : "exit";
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
      if (event) {
        await db()
          .update(geofenceEvents)
          .set({ notifiedAt: new Date() })
          .where(eq(geofenceEvents.id, event.id));
      }
    } catch {
      // The event remains in the log with notified_at = null for inspection.
    }
  }
}

function isInside(
  latitude: number,
  longitude: number,
  centerLat: number,
  centerLon: number,
  radiusM: number,
): boolean {
  const dLat = ((centerLat - latitude) * Math.PI) / 180;
  const dLon = ((centerLon - longitude) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((latitude * Math.PI) / 180) *
      Math.cos((centerLat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_008.8 * Math.asin(Math.min(1, Math.sqrt(a))) <= radiusM;
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
