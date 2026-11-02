import type { NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { devices, users } from "@/db/schema";
import {
  ApiError,
  assertContentType,
  assertMethod,
  errorResponse,
  ok,
  parseJson,
} from "@/lib/api";
import { audit } from "@/lib/audit";
import { generateDeviceToken } from "@/lib/auth/device";
import { revokeMobileSessionsForDevice } from "@/lib/auth/mobile";
import {
  findActiveDeviceByInstallHash,
  releaseRevokedInstallHash,
} from "@/lib/auth/reconnect";
import { consumePairingCode } from "@/lib/auth/tokens";
import { RATE_LIMITS } from "@/lib/constants";
import { stripControlCharacters } from "@/lib/crypto";
import { getEnv } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requestContext } from "@/lib/request";
import { pairDeviceSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertMethod(request, ["POST"]);
    assertContentType(request);
    const ctx = requestContext(request);
    const input = await parseJson(request, pairDeviceSchema);

    await enforceRateLimit({
      bucket: "pair-attempt-ip",
      identifier: ctx.ip,
      ...RATE_LIMITS.pairingAttemptIp,
    });

    const userId = await consumePairingCode(input.code);
    if (!userId) {
      throw new ApiError(
        400,
        "invalid_pairing_code",
        "That pairing code is invalid or has expired. Generate a new one.",
      );
    }

    const userRows = await db()
      .select()
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);
    const user = userRows[0];
    if (!user || !user.emailVerifiedAt) {
      throw new ApiError(
        400,
        "invalid_pairing_code",
        "That pairing code is invalid or has expired.",
      );
    }

    const env = getEnv();
    const { token, tokenHash } = generateDeviceToken();
    const hardware = {
      manufacturer: stripControlCharacters(input.manufacturer ?? "", 80),
      model: stripControlCharacters(input.model ?? "", 80),
      androidVersion: stripControlCharacters(input.androidVersion ?? "", 40),
      appVersion: stripControlCharacters(input.appVersion ?? "", 40),
    };

    let device: typeof devices.$inferSelect | undefined;
    let reconnected = false;

    // A reinstall on the same physical phone reports the same fingerprint.
    // Claim the existing row so history, geofences and commands survive instead
    // of creating a duplicate device. The owner still had to issue a fresh
    // pairing code from the signed-in dashboard.
    if (input.installHash) {
      const existing = await findActiveDeviceByInstallHash(
        userId,
        input.installHash,
      );
      if (existing) {
        const rows = await db()
          .update(devices)
          .set({
            ...hardware,
            installHash: input.installHash,
            tokenHash,
            lastSeenAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(devices.id, existing.id),
              eq(devices.userId, userId),
              isNull(devices.revokedAt),
            ),
          )
          .returning();
        device = rows[0];
        reconnected = Boolean(device);
      }
    }

    if (!device) {
      const existingRows = await db()
        .select({ id: devices.id })
        .from(devices)
        .where(and(eq(devices.userId, userId), isNull(devices.revokedAt)));
      if (existingRows.length >= env.MAX_DEVICES_PER_USER) {
        throw new ApiError(
          409,
          "device_limit",
          "This account has reached its device limit.",
        );
      }

      if (input.installHash) {
        await releaseRevokedInstallHash(userId, input.installHash);
      }

      try {
        const insertRows = await db()
          .insert(devices)
          .values({
            userId,
            name: stripControlCharacters(input.name, 80) || "Android device",
            ...hardware,
            installHash: input.installHash ?? null,
            tokenHash,
            lastSeenAt: new Date(),
          })
          .returning();
        device = insertRows[0];
      } catch (error) {
        // Two codes can race. The partial unique index keeps one row per
        // install; if the other request won, adopt that row.
        if (input.installHash) {
          const winner = await findActiveDeviceByInstallHash(
            userId,
            input.installHash,
          );
          if (winner) {
            const rows = await db()
              .update(devices)
              .set({
                ...hardware,
                tokenHash,
                lastSeenAt: new Date(),
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(devices.id, winner.id),
                  eq(devices.userId, userId),
                  isNull(devices.revokedAt),
                ),
              )
              .returning();
            device = rows[0];
            reconnected = Boolean(device);
          }
        }
        if (!device) throw error;
      }
    }

    if (!device) {
      throw new ApiError(500, "pairing_failed", "Could not create the device.");
    }

    // The token for the previous install is now dead. Drop its account link too;
    // reconnect restores Find My, while pairing by code deliberately does not.
    if (reconnected) {
      await revokeMobileSessionsForDevice(userId, device.id);
    }

    await audit({
      userId,
      action: reconnected ? "device.reconnected" : "device.paired",
      targetType: "device",
      targetId: device.id,
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
      metadata: { model: device.model, reconnected },
    });

    return ok({
      deviceId: device.id,
      token,
      serverTime: new Date().toISOString(),
      ownerName: user.name,
      deviceName: device.name,
      reconnected,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
