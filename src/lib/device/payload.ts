import "server-only";

import { and, asc, eq, gt, inArray } from "drizzle-orm";

import { db } from "@/db";
import { commands, type Device } from "@/db/schema";

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

export function deviceRuntimeConfig(device: Device) {
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

  return {
    trackingProfile: device.trackingProfile,
    lostMode: device.status === "lost",
    offlineAlertMinutes: device.config?.offlineAlertMinutes ?? 45,
    fallbackSmsNumber,
    serverTime: new Date().toISOString(),
  };
}
