import type { NextRequest } from "next/server";
import { and, desc, eq, gt, isNull } from "drizzle-orm";

import { db } from "@/db";
import { devices, mobileSessions } from "@/db/schema";
import { assertMethod, errorResponse, ok } from "@/lib/api";
import { requireVerifiedApiUser } from "@/lib/auth/guards";
import { MOBILE_RECOVERY_MIN_SESSION_AGE_DAYS } from "@/lib/constants";
import { describeUserAgent } from "@/lib/user-agent";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    assertMethod(request, ["GET"]);
    const session = await requireVerifiedApiUser();

    const rows = await db()
      .select({ mobile: mobileSessions, device: devices })
      .from(mobileSessions)
      .innerJoin(devices, eq(devices.id, mobileSessions.deviceId))
      .where(
        and(
          eq(mobileSessions.userId, session.user.id),
          isNull(mobileSessions.revokedAt),
          gt(mobileSessions.refreshExpiresAt, new Date()),
        ),
      )
      .orderBy(desc(mobileSessions.lastUsedAt));

    const now = Date.now();
    return ok({
      sessions: rows.map(({ mobile, device }) => ({
        id: mobile.id,
        deviceId: device.id,
        deviceName: device.name,
        device: describeUserAgent(mobile.userAgent),
        userAgent: mobile.userAgent,
        createdAt: mobile.createdAt.toISOString(),
        lastUsedAt: mobile.lastUsedAt.toISOString(),
        accessExpiresAt: mobile.accessExpiresAt.toISOString(),
        refreshExpiresAt: mobile.refreshExpiresAt.toISOString(),
        recoveryEligible:
          now - mobile.createdAt.getTime() >=
          MOBILE_RECOVERY_MIN_SESSION_AGE_DAYS * 86_400_000,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
