import type { NextRequest } from "next/server";

import { assertMethod, errorResponse, ok } from "@/lib/api";
import { authenticateMobile } from "@/lib/auth/mobile";
import { RATE_LIMITS } from "@/lib/constants";
import { listDeviceSummaries } from "@/lib/data/devices";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Read-only view of every device on the account. A mobile token is bound to
 * one device but may see siblings so the Find My screen can list them; it
 * still cannot issue commands or change any device setting.
 */
export async function GET(request: NextRequest) {
  try {
    assertMethod(request, ["GET"]);
    const auth = await authenticateMobile(request, "devices:read");

    await enforceRateLimit({
      bucket: "mobile-devices",
      identifier: auth.session.id,
      ...RATE_LIMITS.mobileDeviceRead,
    });

    const summaries = await listDeviceSummaries(auth.user.id);

    return ok({
      currentDeviceId: auth.device.id,
      serverTime: new Date().toISOString(),
      devices: summaries.map((device) => ({
        id: device.id,
        name: device.name,
        model: device.model,
        status: device.status,
        presence: device.presence,
        batteryLevel: device.batteryLevel,
        isCharging: device.isCharging,
        lastSeenAt: device.lastSeenAt,
        lastLocation: device.lastLocation
          ? {
              latitude: device.lastLocation.latitude,
              longitude: device.lastLocation.longitude,
              accuracyM: device.lastLocation.accuracyM,
              recordedAt: device.lastLocation.recordedAt,
              provider: device.lastLocation.provider,
              isMocked: device.lastLocation.isMocked,
            }
          : null,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
