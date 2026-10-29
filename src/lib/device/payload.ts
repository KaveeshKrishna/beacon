import "server-only";

import { and, asc, eq, gt, inArray } from "drizzle-orm";

import { db } from "@/db";
import { commands, geofences, type Device } from "@/db/schema";

import { decryptSecret } from "@/lib/crypto";

export type DeviceCommandPayload = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
  expiresAt: string;
};

export async function claimPendingCommands(
  deviceId: string,
): Promise<DeviceCommandPayload[]> {
  const now = new Date();
  const rows = await db()
    .select()
    .from(commands)
    .where(
      and(
        eq(commands.deviceId, deviceId),
        eq(commands.status, "pending"),
        gt(commands.expiresAt, now),
      ),
    )
    .orderBy(asc(commands.createdAt))
    .limit(8);

  if (rows.length === 0) return [];

  await db()
    .update(commands)
    .set({ status: "delivered", deliveredAt: now })
    .where(
      and(
        eq(commands.deviceId, deviceId),
        eq(commands.status, "pending"),
        inArray(
          commands.id,
          rows.map((row) => row.id),
        ),
      ),
    );

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    payload: row.payload ?? {},
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  }));
}

export type DeviceGeofenceConfig = {
  id: string;
  name: string;
  centerLat: number;
  centerLon: number;
  radiusM: number;
};

/**
 * Everything the tracking app needs to decide how often to check in. The
 * geofence list is intentionally small (20 per device) and only contains
 * geometry, so one request per sync is cheap.
 */
export async function deviceRuntimeConfig(device: Device) {
  let fallbackSmsNumber: string | null = null;
  if (device.fallbackSmsEnc) {
    try {
      fallbackSmsNumber = decryptSecret(
        device.fallbackSmsEnc,
        `sms:${device.id}`,
      );
    } catch {
      // A key rotation or malformed value must not break command delivery.
      fallbackSmsNumber = null;
    }
  }

  const fenceRows = await db()
    .select({
      id: geofences.id,
      name: geofences.name,
      centerLat: geofences.centerLat,
      centerLon: geofences.centerLon,
      radiusM: geofences.radiusM,
    })
    .from(geofences)
    .where(eq(geofences.deviceId, device.id))
    .orderBy(asc(geofences.createdAt));

  return {
    trackingProfile: device.trackingProfile,
    lostMode: device.status === "lost",
    offlineAlertMinutes: device.config?.offlineAlertMinutes ?? 45,
    fallbackSmsNumber,
    geofences: fenceRows satisfies DeviceGeofenceConfig[],
    serverTime: new Date().toISOString(),
  };
}
