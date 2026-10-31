import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";

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
import { requireVerifiedApiUser } from "@/lib/auth/guards";
import { assertTrustedOrigin, requestContext } from "@/lib/request";

export const runtime = "nodejs";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertMethod(request, ["DELETE"]);
    assertContentType(request);
    assertTrustedOrigin(request);
    const ctx = requestContext(request);
    const session = await requireVerifiedApiUser();

    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      throw new ApiError(404, "not_found", "Linked phone not found.");
    }

    const revoked = await db()
      .update(mobileSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(mobileSessions.id, id),
          eq(mobileSessions.userId, session.user.id),
        ),
      )
      .returning({ id: mobileSessions.id });

    if (revoked.length === 0) {
      throw new ApiError(404, "not_found", "Linked phone not found.");
    }

    await audit({
      userId: session.user.id,
      action: "mobile.link.revoked_by_web",
      targetType: "mobile_session",
      targetId: id,
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
    });

    return ok({ revoked: true });
  } catch (error) {
    return errorResponse(error);
  }
}
