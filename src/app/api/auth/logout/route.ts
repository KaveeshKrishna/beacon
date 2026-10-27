import type { NextRequest } from "next/server";

import {
  assertContentType,
  assertMethod,
  errorResponse,
  ok,
} from "@/lib/api";
import { audit } from "@/lib/audit";
import { getSession, clearSessionCookie, revokeSession } from "@/lib/auth/session";
import { assertTrustedOrigin, requestContext } from "@/lib/request";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertMethod(request, ["POST"]);
    assertContentType(request);
    assertTrustedOrigin(request);
    const ctx = requestContext(request);
    const session = await getSession();

    if (session) {
      await revokeSession(session.id, session.user.id);
      await audit({
        userId: session.user.id,
        action: "auth.logout",
        ipHash: ctx.ipHash,
        userAgent: ctx.userAgent,
      });
    }

    await clearSessionCookie();
    return ok({ redirect: "/" });
  } catch (error) {
    return errorResponse(error);
  }
}
