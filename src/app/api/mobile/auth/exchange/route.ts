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
import {
  consumeMobileLinkCode,
  createMobileSession,
} from "@/lib/auth/mobile";
import { RATE_LIMITS } from "@/lib/constants";
import { maskEmail } from "@/lib/crypto";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requestContext } from "@/lib/request";
import { mobileExchangeSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertMethod(request, ["POST"]);
    assertContentType(request);
    const ctx = requestContext(request);
    const input = await parseJson(request, mobileExchangeSchema);

    await enforceRateLimit({
      bucket: "mobile-exchange-ip",
      identifier: ctx.ip,
      ...RATE_LIMITS.mobileExchangeIp,
    });

    const link = await consumeMobileLinkCode({
      code: input.code,
      verifier: input.verifier,
      state: input.state,
    });

    const rows = await db()
      .select({ user: users, device: devices })
      .from(users)
      .innerJoin(devices, eq(devices.userId, users.id))
      .where(
        and(
          eq(users.id, link.userId),
          isNull(users.deletedAt),
          eq(devices.id, link.deviceId),
          isNull(devices.revokedAt),
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row) {
      throw new ApiError(401, "invalid_link", "This link code is not valid.");
    }

    const tokens = await createMobileSession({
      userId: row.user.id,
      deviceId: row.device.id,
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
    });

    await audit({
      userId: row.user.id,
      action: "mobile.link.exchanged",
      targetType: "device",
      targetId: row.device.id,
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
    });

    return ok({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessExpiresAt: tokens.accessExpiresAt.toISOString(),
      refreshExpiresAt: tokens.refreshExpiresAt.toISOString(),
      sessionCreatedAt: tokens.createdAt.toISOString(),
      scope: "devices:read account:recover",
      device: { id: row.device.id, name: row.device.name },
      account: {
        name: row.user.name,
        emailMasked: maskEmail(row.user.email),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
