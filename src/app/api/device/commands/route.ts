import type { NextRequest } from "next/server";

import { assertMethod, errorResponse, ok } from "@/lib/api";
import { authenticateDevice } from "@/lib/auth/device";
import { RATE_LIMITS } from "@/lib/constants";
import {
  claimPendingCommands,
  deviceRuntimeConfig,
} from "@/lib/device/payload";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requestContext } from "@/lib/request";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    assertMethod(request, ["GET"]);
    const device = await authenticateDevice(request);
    const ctx = requestContext(request);

    await enforceRateLimit({
      bucket: "device-commands",
      identifier: `${device.id}:${ctx.ip}`,
      ...RATE_LIMITS.deviceHeartbeat,
    });

    const pending = await claimPendingCommands(device.id);

    return ok({
      commands: pending,
      config: await deviceRuntimeConfig(device),
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
