import type { NextRequest } from "next/server";

import {
  ApiError,
  assertContentType,
  assertMethod,
  errorResponse,
  ok,
  parseJson,
} from "@/lib/api";
import { verifyEmailMfaCode } from "@/lib/auth/mfa";
import { finalizeMfaLogin } from "@/lib/auth/finalize-mfa";
import {
  getPendingMfa,
  recordPendingMfaAttempt,
} from "@/lib/auth/pending-mfa";
import { RATE_LIMITS } from "@/lib/constants";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertTrustedOrigin, requestContext } from "@/lib/request";
import { mfaCodeSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertMethod(request, ["POST"]);
    assertContentType(request);
    assertTrustedOrigin(request);
    const ctx = requestContext(request);
    const input = await parseJson(request, mfaCodeSchema);
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
      bucket: "mfa-email-verify",
      identifier: `${pending.id}:${ctx.ip}`,
      ...RATE_LIMITS.mfaAttempt,
    });

    if (pending.attempts >= 10) {
      throw new ApiError(
        401,
        "mfa_expired",
        "Too many attempts. Start signing in again.",
      );
    }

    const valid = await verifyEmailMfaCode(pending.userId, input.code);
    if (!valid) {
      await recordPendingMfaAttempt(pending.id);
      throw new ApiError(
        401,
        "invalid_code",
        "That code is not valid or has expired.",
      );
    }

    await finalizeMfaLogin(pending.user, ctx);
    return ok({ redirect: "/app" });
  } catch (error) {
    return errorResponse(error);
  }
}
