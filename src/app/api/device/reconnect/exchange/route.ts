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
import { createMobileSession } from "@/lib/auth/mobile";
import {
  bindInstallHash,
  consumeDeviceReconnectCode,
} from "@/lib/auth/reconnect";
import { RATE_LIMITS } from "@/lib/constants";
import { maskEmail, stripControlCharacters } from "@/lib/crypto";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requestContext } from "@/lib/request";
import { deviceReconnectExchangeSchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * Redeem the code the browser approved. The exchange verifies the PKCE
 * verifier, the state round-trip and the install fingerprint before issuing a
 * fresh device token. The browser session is never placed on the phone.
 */
export async function POST(request: NextRequest) {
  try {
    assertMethod(request, ["POST"]);
    assertContentType(request);
    const ctx = requestContext(request);
    const input = await parseJson(request, deviceReconnectExchangeSchema);

    await enforceRateLimit({
      bucket: "device-reconnect-exchange-ip",
      identifier: ctx.ip,
      ...RATE_LIMITS.deviceReconnectExchangeIp,
    });

    const reconnect = await consumeDeviceReconnectCode({
      code: input.code,
      verifier: input.verifier,
      state: input.state,
      installHash: input.installHash,
    });

    const rows = await db()
      .select({ user: users, device: devices })
      .from(users)
      .innerJoin(devices, eq(devices.userId, users.id))
      .where(
        and(
          eq(users.id, reconnect.userId),
          isNull(users.deletedAt),
          eq(devices.id, reconnect.deviceId),
          eq(devices.userId, reconnect.userId),
          isNull(devices.revokedAt),
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row) {
      throw new ApiError(401, "invalid_reconnect", "This reconnect code is not valid.");
    }

    if (row.device.installHash && row.device.installHash !== input.installHash) {
      throw new ApiError(
        401,
        "invalid_reconnect",
        "This reconnect code was issued for a different phone.",
      );
    }

    if (!row.device.installHash) {
      await bindInstallHash({
        userId: row.user.id,
        deviceId: row.device.id,
        installHash: input.installHash,
      });
    }

    const { token, tokenHash } = generateDeviceToken();
    const updatedRows = await db()
      .update(devices)
      .set({
        tokenHash,
        installHash: input.installHash,
        appVersion:
          stripControlCharacters(input.appVersion, 40) || row.device.appVersion,
        androidVersion:
          stripControlCharacters(input.androidVersion, 40) ||
          row.device.androidVersion,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(devices.id, row.device.id),
          eq(devices.userId, row.user.id),
          isNull(devices.revokedAt),
        ),
      )
      .returning();

    const device = updatedRows[0];
    if (!device) {
      throw new ApiError(401, "invalid_reconnect", "This reconnect code is not valid.");
    }

    // Reconnecting restores the narrow account link as well, so Find My and
    // the recovery eligibility timer are usable again without a second browser
    // round trip. The session is still bound to this one device and cannot act
    // as a browser session.
    const mobile = await createMobileSession({
      userId: row.user.id,
      deviceId: device.id,
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
    });

    await audit({
      userId: row.user.id,
      action: "device.reconnected",
      targetType: "device",
      targetId: device.id,
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
      metadata: { mobileSessionRestored: true },
    });

    return ok({
      deviceId: device.id,
      token,
      serverTime: new Date().toISOString(),
      ownerName: row.user.name,
      deviceName: device.name,
      reconnected: true,
      accessToken: mobile.accessToken,
      refreshToken: mobile.refreshToken,
      accessExpiresAt: mobile.accessExpiresAt.toISOString(),
      refreshExpiresAt: mobile.refreshExpiresAt.toISOString(),
      sessionCreatedAt: mobile.createdAt.toISOString(),
      scope: "devices:read account:recover",
      device: { id: device.id, name: device.name },
      account: {
        name: row.user.name,
        emailMasked: maskEmail(row.user.email),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
