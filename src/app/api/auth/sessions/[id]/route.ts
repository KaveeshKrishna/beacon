import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { sessions } from "@/db/schema";
import {
  ApiError,
  assertContentType,
  assertMethod,
  errorResponse,
  ok,
} from "@/lib/api";
import { audit } from "@/lib/audit";
import { getSession, clearSessionCookie } from "@/lib/auth/session";
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
    const session = await getSession();
    if (!session) {
      throw new ApiError(401, "unauthorized", "Sign in to continue.");
    }

    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      throw new ApiError(404, "not_found", "Session not found.");
    }

    const revoked = await db()
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.id, id), eq(sessions.userId, session.user.id)))
      .returning({ id: sessions.id });

    if (revoked.length === 0) {
      throw new ApiError(404, "not_found", "Session not found.");
    }

    if (id === session.id) await clearSessionCookie();
    await audit({
      userId: session.user.id,
      action: "auth.session.revoked",
      targetType: "session",
      targetId: id,
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
    });

    return ok({ revoked: true, current: id === session.id });
  } catch (error) {
    return errorResponse(error);
  }
}
