import type { NextRequest } from "next/server";

import { assertMethod, errorResponse, ok } from "@/lib/api";
import { requireApiUser } from "@/lib/auth/guards";

export const runtime = "nodejs";

/**
 * Cheap liveness check for the dashboard. The client calls it every 30 seconds
 * and when the tab regains focus. A revoked browser session returns 401 on the
 * next request, so the tab can redirect to sign-in instead of looking active.
 */
export async function GET(request: NextRequest) {
  try {
    assertMethod(request, ["GET"]);
    const session = await requireApiUser();
    return ok({
      sessionId: session.id,
      expiresAt: session.expiresAt.toISOString(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
