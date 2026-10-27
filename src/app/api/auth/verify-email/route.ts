import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import {
  ApiError,
  assertContentType,
  assertMethod,
  errorResponse,
  ok,
  parseJson,
} from "@/lib/api";
import { audit } from "@/lib/audit";
import { RATE_LIMITS } from "@/lib/constants";
import { consumeEmailToken } from "@/lib/auth/tokens";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertTrustedOrigin, requestContext } from "@/lib/request";
import { verifyEmailSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertMethod(request, ["POST"]);
    assertContentType(request);
    assertTrustedOrigin(request);
    const ctx = requestContext(request);
    const input = await parseJson(request, verifyEmailSchema);

    await enforceRateLimit({
      bucket: "verify-email-ip",
      identifier: ctx.ip,
      ...RATE_LIMITS.resendVerify,
    });

    const userId = await consumeEmailToken(input.token, "verify_email");
    if (!userId) {
      throw new ApiError(
        400,
        "invalid_token",
        "This verification link is invalid or has expired.",
      );
    }

    const rows = await db()
      .update(users)
      .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ id: users.id });

    if (rows.length === 0) {
      throw new ApiError(400, "invalid_token", "This account no longer exists.");
    }

    await audit({
      userId,
      action: "auth.email.verified",
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
    });

    return ok({ message: "Email verified. You can now pair a device." });
  } catch (error) {
    return errorResponse(error);
  }
}
