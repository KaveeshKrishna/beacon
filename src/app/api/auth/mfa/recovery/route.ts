import type { NextRequest } from "next/server";

import {
  ApiError,
  assertContentType,
  assertMethod,
  errorResponse,
  ok,
  parseJson,
} from "@/lib/api";
import { verifyRecoveryCode } from "@/lib/auth/mfa";
import { finalizeMfaLogin } from "@/lib/auth/finalize-mfa";
import {
  getPendingMfa,
  recordPendingMfaAttempt,
} from "@/lib/auth/pending-mfa";
import { RATE_LIMITS } from "@/lib/constants";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertTrustedOrigin, requestContext } from "@/lib/request";
import { mfaRecoverySchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertMethod(request, ["POST"]);
    assertContentType(request);
    assertTrustedOrigin(request);
    const ctx = requestContext(request);
    const input = await parseJson(request, mfaRecoverySchema);
    const pending = await getPendingMfa();

    if (!pending) {
      throw new ApiError(
        401,
        "mfa_expired",
        "Your sign-in attempt expired. Start again.",
      );
    }

    await enforceRateLimit({
      bucket: "mfa-recovery",
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

    const valid = await verifyRecoveryCode(pending.userId, input.code);
    if (!valid) {
      await recordPendingMfaAttempt(pending.id);
      throw new ApiError(
        401,
        "invalid_code",
        "That recovery code is not valid or has already been used.",
      );
    }

    await finalizeMfaLogin(pending.user, ctx);
    return ok({ redirect: "/app", recoveryCodeUsed: true });
  } catch (error) {
    return errorResponse(error);
  }
}
