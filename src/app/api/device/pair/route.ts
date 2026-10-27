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
      .where(
        and(
          eq(users.id, userId),
          isNull(users.deletedAt),
        ),
      )
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
    const existing = await db()
      .select({ id: devices.id })
      .from(devices)
      .where(and(eq(devices.userId, userId), isNull(devices.revokedAt)));
    if (existing.length >= env.MAX_DEVICES_PER_USER) {
      throw new ApiError(
        409,
        "device_limit",
        "This account has reached its device limit.",
      );
    }

    const { token, tokenHash } = generateDeviceToken();
    const insertRows = await db()
      .insert(devices)
      .values({
        userId,
        name: stripControlCharacters(input.name, 80) || "Android device",
        manufacturer: stripControlCharacters(input.manufacturer ?? "", 80),
        model: stripControlCharacters(input.model ?? "", 80),
        androidVersion: stripControlCharacters(input.androidVersion ?? "", 40),
        appVersion: stripControlCharacters(input.appVersion ?? "", 40),
        tokenHash,
        lastSeenAt: new Date(),
      })
      .returning();

    const device = insertRows[0];
    if (!device) {
      throw new ApiError(500, "pairing_failed", "Could not create the device.");
    }

    await audit({
      userId,
      action: "device.paired",
      targetType: "device",
      targetId: device.id,
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
      metadata: { model: device.model },
    });

    return ok({
      deviceId: device.id,
      token,
      serverTime: new Date().toISOString(),
      ownerName: user.name,
      deviceName: device.name,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
