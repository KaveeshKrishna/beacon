import type { NextRequest } from "next/server";

import {
  ApiError,
  assertContentType,
  assertMethod,
  errorResponse,
  ok,
} from "@/lib/api";
import { createEmailMfaCode } from "@/lib/auth/mfa";
import { getPendingMfa } from "@/lib/auth/pending-mfa";
import { RATE_LIMITS } from "@/lib/constants";
import { maskEmail } from "@/lib/crypto";
import { sendTransactionalEmail } from "@/lib/email/send";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertTrustedOrigin, requestContext } from "@/lib/request";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertMethod(request, ["POST"]);
    assertContentType(request);
    assertTrustedOrigin(request);
    const ctx = requestContext(request);
    const pending = await getPendingMfa();

    if (!pending) {
      throw new ApiError(
        401,
        "mfa_expired",
        "Your sign-in attempt expired. Start again.",
      );
    }
    if (!pending.user.emailMfaEnabled) {
      throw new ApiError(
        403,
        "method_unavailable",
        "Email verification is not enabled for this account.",
      );
    }

    await enforceRateLimit({
      bucket: "mfa-email-send",
      identifier: `${pending.userId}:${ctx.ip}`,
      ...RATE_LIMITS.emailCode,
    });

    const code = await createEmailMfaCode(pending.userId);
    try {
      await sendTransactionalEmail({
        to: pending.user.email,
        userId: pending.userId,
        priority: pending.user.emailProviderPriority,
        payload: {
          template: "mfa_code",
          data: {
            name: pending.user.name,
            code,
            minutes: 10,
          },
        },
      });
    } catch {
      throw new ApiError(
        502,
        "email_delivery_failed",
        "The code could not be delivered. Try another method.",
      );
    }

    return ok({
      sent: true,
      email: maskEmail(pending.user.email),
      expiresInMinutes: 10,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
