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
import { sendVerificationEmail } from "@/lib/auth/emails";
import { RATE_LIMITS } from "@/lib/constants";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertTrustedOrigin, requestContext } from "@/lib/request";
import { resendVerificationSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertMethod(request, ["POST"]);
    assertContentType(request);
    assertTrustedOrigin(request);
    const ctx = requestContext(request);
    const input = await parseJson(request, resendVerificationSchema);

    await enforceRateLimit({
      bucket: "resend-verify-ip",
      identifier: ctx.ip,
      ...RATE_LIMITS.resendVerify,
    });
    await enforceRateLimit({
      bucket: "resend-verify-account",
      identifier: input.email,
      ...RATE_LIMITS.resendVerify,
    });

    const rows = await db()
      .select()
      .from(users)
      .where(
        and(
          eq(users.email, input.email),
          isNull(users.emailVerifiedAt),
          isNull(users.deletedAt),
        ),
      )
      .limit(1);

    const user = rows[0];
    if (user) {
      after(async () => {
        try {
          await sendVerificationEmail(user);
        } catch (error) {
          logger.error("auth", "Resend verification failed", error);
        }
      });
    }

    return ok({
      message:
        "If an unverified account exists for that address, a new link is on its way.",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
