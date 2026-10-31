import type { NextRequest } from "next/server";

import {
  assertContentType,
  assertMethod,
  errorResponse,
  ok,
  parseJson,
} from "@/lib/api";
import { rotateMobileSession } from "@/lib/auth/mobile";
import { RATE_LIMITS } from "@/lib/constants";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requestContext } from "@/lib/request";
import { mobileRefreshSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertMethod(request, ["POST"]);
    assertContentType(request);
    const ctx = requestContext(request);
    const input = await parseJson(request, mobileRefreshSchema);

    await enforceRateLimit({
      bucket: "mobile-refresh-ip",
      identifier: ctx.ip,
      ...RATE_LIMITS.mobileRefreshIp,
    });

    const tokens = await rotateMobileSession(input.refreshToken);

    return ok({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessExpiresAt: tokens.accessExpiresAt.toISOString(),
      refreshExpiresAt: tokens.refreshExpiresAt.toISOString(),
      scope: "devices:read account:recover",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
