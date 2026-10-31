import type { NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { mobileSessions } from "@/db/schema";
import {
  assertContentType,
  assertMethod,
  errorResponse,
  ok,
} from "@/lib/api";
import { audit } from "@/lib/audit";
import {
  authenticateMobile,
  hashMobileRefreshToken,
  revokeMobileSession,
} from "@/lib/auth/mobile";
import { extractBearerToken } from "@/lib/auth/device";
import { requestContext } from "@/lib/request";

export const runtime = "nodejs";

/**
 * Best-effort revocation. A phone whose access token has already expired can
 * still present its refresh token, and the response is intentionally uniform
 * so this endpoint cannot be used as a token oracle.
 */
export async function POST(request: NextRequest) {
  try {
    assertMethod(request, ["POST"]);
    assertContentType(request);
    const ctx = requestContext(request);
    const bearer = extractBearerToken(request);
    let revoked = false;
    let userId: string | null = null;

    if (bearer?.startsWith("bc_mob_")) {
      try {
        const auth = await authenticateMobile(request, "devices:read");
        await revokeMobileSession(auth.session.id, auth.user.id);
        userId = auth.user.id;
        revoked = true;
      } catch {
        // Fall through to the refresh token below.
      }
    }

    let refreshToken: string | null = null;
    try {
      const body = await request.json();
      if (body && typeof body.refreshToken === "string") {
        refreshToken = body.refreshToken;
      }
    } catch {
      // An empty body is allowed.
    }

    if (!revoked && refreshToken && refreshToken.length <= 200) {
      const rows = await db()
        .update(mobileSessions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(
              mobileSessions.refreshTokenHash,
              hashMobileRefreshToken(refreshToken),
            ),
            isNull(mobileSessions.revokedAt),
          ),
        )
        .returning({ userId: mobileSessions.userId });
      if (rows[0]) {
        userId = rows[0].userId;
        revoked = true;
      }
    }

    if (revoked && userId) {
      await audit({
        userId,
        action: "mobile.link.revoked",
        targetType: "mobile_session",
        ipHash: ctx.ipHash,
        userAgent: ctx.userAgent,
      });
    }

    return ok({ revoked });
  } catch (error) {
    return errorResponse(error);
  }
}
