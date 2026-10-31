import type { NextRequest } from "next/server";

import { ApiError, assertMethod, errorResponse, ok } from "@/lib/api";
import { authenticateMobile } from "@/lib/auth/mobile";
import { RATE_LIMITS } from "@/lib/constants";
import {
  getDeviceForUser,
  getLatestLocation,
  toLocationDto,
} from "@/lib/data/devices";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertMethod(request, ["GET"]);
    const auth = await authenticateMobile(request, "devices:read");

    await enforceRateLimit({
      bucket: "mobile-location",
      identifier: auth.session.id,
      ...RATE_LIMITS.mobileDeviceRead,
    });

    const { id } = await context.params;
    const device = await getDeviceForUser(auth.user.id, id);
    if (!device) {
      throw new ApiError(404, "not_found", "Device not found.");
    }

    const latest = await getLatestLocation(device.id);

    return ok({
      device: { id: device.id, name: device.name },
      serverTime: new Date().toISOString(),
      location: latest ? toLocationDto(latest) : null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
