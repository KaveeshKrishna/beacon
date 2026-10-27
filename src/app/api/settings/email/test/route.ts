import type { NextRequest } from "next/server";

import {
  ApiError,
  assertContentType,
  assertMethod,
  errorResponse,
  ok,
  parseJson,
} from "@/lib/api";
import { requireVerifiedApiUser } from "@/lib/auth/guards";
import { RATE_LIMITS } from "@/lib/constants";
import { getEnv } from "@/lib/env";
import { sendTransactionalEmail } from "@/lib/email/send";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertTrustedOrigin } from "@/lib/request";
import { testEmailSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertMethod(request, ["POST"]);
    assertContentType(request);
    assertTrustedOrigin(request);
    const session = await requireVerifiedApiUser();
    await parseJson(request, testEmailSchema);

    await enforceRateLimit({
      bucket: "email-test",
      identifier: session.user.id,
      ...RATE_LIMITS.testEmail,
    });

    try {
      const result = await sendTransactionalEmail({
        to: session.user.email,
        userId: session.user.id,
        priority: session.user.emailProviderPriority,
        payload: {
          template: "test",
          data: {
            name: session.user.name,
            url: `${getEnv().APP_URL.replace(/\/$/, "")}/app/settings/email`,
          },
        },
      });
      return ok({ sent: true, provider: result.provider });
    } catch {
      throw new ApiError(
        502,
        "email_delivery_failed",
        "No configured provider accepted the message. Check the server logs and provider credentials.",
      );
    }
  } catch (error) {
    return errorResponse(error);
  }
}
