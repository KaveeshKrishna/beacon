import { after } from "next/server";
import type { NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import {
  assertContentType,
  assertMethod,
  errorResponse,
  ok,
  parseJson,
} from "@/lib/api";
import { sendPasswordResetEmail } from "@/lib/auth/emails";
import { RATE_LIMITS } from "@/lib/constants";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertTrustedOrigin, requestContext } from "@/lib/request";
import { forgotPasswordSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertMethod(request, ["POST"]);
    assertContentType(request);
    assertTrustedOrigin(request);
    const ctx = requestContext(request);
    const input = await parseJson(request, forgotPasswordSchema);

    await enforceRateLimit({
      bucket: "forgot-ip",
      identifier: ctx.ip,
      ...RATE_LIMITS.passwordResetIp,
    });
    await enforceRateLimit({
      bucket: "forgot-account",
      identifier: input.email,
      ...RATE_LIMITS.passwordResetAccount,
    });

    const rows = await db()
      .select()
      .from(users)
      .where(and(eq(users.email, input.email), isNull(users.deletedAt)))
      .limit(1);

    const user = rows[0];
    if (user) {
      after(async () => {
        try {
          await sendPasswordResetEmail(user);
        } catch (error) {
          logger.error("auth", "Password reset email failed", error);
        }
      });
    }

    return ok({
      message:
        "If an account exists for that address, a reset link is on its way. The link expires in 60 minutes.",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
