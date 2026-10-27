import { and, eq, isNull } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { db } from "@/db";
import { devices } from "@/db/schema";
import {
  assertContentType,
  assertMethod,
  errorResponse,
  ok,
} from "@/lib/api";
import { audit } from "@/lib/audit";
import { authenticateDevice } from "@/lib/auth/device";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requestContext } from "@/lib/request";

export const runtime = "nodejs";

/**
 * Self-service revocation from the phone. The bearer token is hashed, so the
 * device cannot revoke a different device even if a request is replayed.
 */
export async function POST(request: NextRequest) {
  try {
    assertMethod(request, ["POST"]);
    assertContentType(request);
    const device = await authenticateDevice(request);
    const ctx = requestContext(request);

    await enforceRateLimit({
      bucket: "device-unpair",
      identifier: device.id,
      limit: 5,
      windowSec: 60 * 60,
    });

    await db()
      .update(devices)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(devices.id, device.id), isNull(devices.revokedAt)));

    await audit({
      userId: device.userId,
      action: "device.unpaired",
      targetType: "device",
      targetId: device.id,
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
      metadata: { selfService: true },
    });

    return ok({ revoked: true });
  } catch (error) {
    return errorResponse(error);
  }
}
