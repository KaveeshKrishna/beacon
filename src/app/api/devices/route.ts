import type { NextRequest } from "next/server";

import { assertMethod, errorResponse, ok } from "@/lib/api";
import { requireApiUser } from "@/lib/auth/guards";
import { listDeviceSummaries } from "@/lib/data/devices";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    assertMethod(request, ["GET"]);
    const session = await requireApiUser();
    const devices = await listDeviceSummaries(session.user.id);
    return ok({ devices });
  } catch (error) {
    return errorResponse(error);
  }
}
