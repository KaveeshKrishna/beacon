import type { NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { mobileSessions } from "@/db/schema";
import {
  ApiError,
  assertContentType,
  assertMethod,
  errorResponse,
  ok,
} from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireApiUser } from "@/lib/auth/guards";
import { getDeviceForUser } from "@/lib/data/devices";
import { assertTrustedOrigin, requestContext } from "@/lib/request";

export const runtime = "nodejs";

/**
 * Revoke every Find My / recovery session bound to one device. This does not
 * remove the device token or stop tracking; it only signs the narrow mobile
 * session out. The owner can still unpair the device from the same page.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertMethod(request, ["DELETE"]);
    assertContentType(request);
    assertTrustedOrigin(request);
    const ctx = requestContext(request);
    const session = await requireApiUser();
    const { id } = await context.params;

    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      throw new ApiError(404, "not_found", "Device not found.");
    }

    const device = await getDeviceForUser(session.user.id, id);
    if (!device) {
      throw new ApiError(404, "not_found", "Device not found.");
    }

    const revoked = await db()
      .update(mobileSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(mobileSessions.userId, session.user.id),
          eq(mobileSessions.deviceId, device.id),
          isNull(mobileSessions.revokedAt),
        ),
      )
      .returning({ id: mobileSessions.id });

    await audit({
      userId: session.user.id,
      action: "mobile.app_access.revoked",
      targetType: "device",
      targetId: device.id,
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
      metadata: { sessions: revoked.length },
    });

    return ok({ revoked: revoked.length });
  } catch (error) {
    return errorResponse(error);
  }
}
