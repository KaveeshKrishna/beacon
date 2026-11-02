import "server-only";

import { and, eq, gt, isNotNull, isNull, ne, or } from "drizzle-orm";

import { db } from "@/db";
import {
  deviceReconnectCodes,
  devices,
  type Device,
} from "@/db/schema";
import { ApiError } from "@/lib/api";
import { DEVICE_RECONNECT_TTL_MINUTES } from "@/lib/constants";
import { hashWithSecret, randomToken, safeEqual } from "@/lib/crypto";
import { verifyPkceS256 } from "@/lib/pkce";

export function hashDeviceReconnectCode(code: string): string {
  return hashWithSecret(`device-reconnect:${code}`);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

/**
 * A revoked row can keep its fingerprint for audit purposes, but it must not
 * block the same physical phone from pairing again. Release the value before a
 * new row claims it.
 */
export async function releaseRevokedInstallHash(
  userId: string,
  installHash: string,
): Promise<void> {
  await db()
    .update(devices)
    .set({ installHash: null, updatedAt: new Date() })
    .where(
      and(
        eq(devices.userId, userId),
        eq(devices.installHash, installHash),
        isNotNull(devices.revokedAt),
      ),
    );
}

export async function findActiveDeviceByInstallHash(
  userId: string,
  installHash: string,
): Promise<Device | null> {
  const rows = await db()
    .select()
    .from(devices)
    .where(
      and(
        eq(devices.userId, userId),
        eq(devices.installHash, installHash),
        isNull(devices.revokedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Bind the phone's fingerprint to an existing device row. A row that already
 * carries a different fingerprint is never overwritten: that would let one
 * physical phone silently claim another phone's history.
 */
export async function bindInstallHash(input: {
  userId: string;
  deviceId: string;
  installHash: string;
}): Promise<Device> {
  const conflict = await db()
    .select({ id: devices.id })
    .from(devices)
    .where(
      and(
        eq(devices.userId, input.userId),
        eq(devices.installHash, input.installHash),
        isNull(devices.revokedAt),
        ne(devices.id, input.deviceId),
      ),
    )
    .limit(1);

  if (conflict[0]) {
    throw new ApiError(
      409,
      "install_in_use",
      "That install is already linked to another device. Pair it as a new device instead.",
    );
  }

  await releaseRevokedInstallHash(input.userId, input.installHash);

  try {
    const rows = await db()
      .update(devices)
      .set({ installHash: input.installHash, updatedAt: new Date() })
      .where(
        and(
          eq(devices.id, input.deviceId),
          eq(devices.userId, input.userId),
          isNull(devices.revokedAt),
          or(
            isNull(devices.installHash),
            eq(devices.installHash, input.installHash),
          ),
        ),
      )
      .returning();

    const device = rows[0];
    if (!device) {
      throw new ApiError(
        409,
        "install_mismatch",
        "This phone does not match the selected device. Choose the correct device or pair it as new.",
      );
    }
    return device;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError(
        409,
        "install_in_use",
        "That install is already linked to another device. Pair it as a new device instead.",
      );
    }
    throw error;
  }
}

/**
 * Create a short-lived, single-use code after the signed-in browser confirms
 * which linked device the reinstalled phone is. The PKCE verifier and the
 * install fingerprint stay on the phone.
 */
export async function createDeviceReconnectCode(input: {
  userId: string;
  deviceId: string;
  challenge: string;
  state: string;
  installHash: string;
}): Promise<{ code: string; expiresAt: Date }> {
  const code = randomToken(32);
  const expiresAt = new Date(
    Date.now() + DEVICE_RECONNECT_TTL_MINUTES * 60_000,
  );

  await db()
    .delete(deviceReconnectCodes)
    .where(
      and(
        eq(deviceReconnectCodes.userId, input.userId),
        eq(deviceReconnectCodes.deviceId, input.deviceId),
      ),
    );

  await db().insert(deviceReconnectCodes).values({
    userId: input.userId,
    deviceId: input.deviceId,
    codeHash: hashDeviceReconnectCode(code),
    challenge: input.challenge,
    state: input.state,
    installHash: input.installHash,
    expiresAt,
  });

  return { code, expiresAt };
}

export type ConsumedReconnectCode = {
  userId: string;
  deviceId: string;
  installHash: string;
};

export async function consumeDeviceReconnectCode(input: {
  code: string;
  verifier: string;
  state: string;
  installHash: string;
}): Promise<ConsumedReconnectCode> {
  if (!input.code || input.code.length > 200) {
    throw new ApiError(401, "invalid_reconnect", "This reconnect code is not valid.");
  }

  const rows = await db()
    .select()
    .from(deviceReconnectCodes)
    .where(
      and(
        eq(
          deviceReconnectCodes.codeHash,
          hashDeviceReconnectCode(input.code),
        ),
        isNull(deviceReconnectCodes.usedAt),
        gt(deviceReconnectCodes.expiresAt, new Date()),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new ApiError(401, "invalid_reconnect", "This reconnect code is not valid.");
  }

  if (!safeEqual(row.state, input.state)) {
    throw new ApiError(401, "invalid_reconnect", "This reconnect code is not valid.");
  }

  if (!safeEqual(row.installHash, input.installHash)) {
    throw new ApiError(
      401,
      "invalid_reconnect",
      "This reconnect code was issued for a different phone.",
    );
  }

  if (!verifyPkceS256(input.verifier, row.challenge)) {
    throw new ApiError(401, "invalid_reconnect", "This reconnect code is not valid.");
  }

  const claimed = await db()
    .update(deviceReconnectCodes)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(deviceReconnectCodes.id, row.id),
        isNull(deviceReconnectCodes.usedAt),
      ),
    )
    .returning({ id: deviceReconnectCodes.id });

  if (!claimed[0]) {
    throw new ApiError(401, "invalid_reconnect", "This reconnect code is not valid.");
  }

  return {
    userId: row.userId,
    deviceId: row.deviceId,
    installHash: row.installHash,
  };
}
