import { after } from "next/server";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { devices, users } from "@/db/schema";
import {
  assertContentType,
  assertMethod,
  errorResponse,
  ok,
  parseJson,
} from "@/lib/api";
import { authenticateDevice } from "@/lib/auth/device";
import { RATE_LIMITS } from "@/lib/constants";
import { encryptSecret, stripControlCharacters } from "@/lib/crypto";
import {
  claimPendingCommands,
  deviceRuntimeConfig,
} from "@/lib/device/payload";
import {
  markDeviceAlertResolved,
  maybeSendSimChangeAlert,
} from "@/lib/notifications";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requestContext } from "@/lib/request";
import { heartbeatSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertMethod(request, ["POST"]);
    assertContentType(request);
    const device = await authenticateDevice(request);
    const ctx = requestContext(request);

    await enforceRateLimit({
      bucket: "device-heartbeat",
      identifier: `${device.id}:${ctx.ip}`,
      ...RATE_LIMITS.deviceHeartbeat,
    });

    const input = await parseJson(request, heartbeatSchema);
    const previousSimState = device.simState;
    const nextSimState = input.simState
      ? stripControlCharacters(input.simState, 32).toUpperCase()
      : null;

    await db()
      .update(devices)
      .set({
        lastSeenAt: new Date(),
        batteryLevel: input.batteryLevel ?? device.batteryLevel,
        isCharging: input.isCharging ?? device.isCharging,
        networkType: input.networkType
          ? stripControlCharacters(input.networkType, 32)
          : device.networkType,
        simState: nextSimState ?? device.simState,
        appVersion: input.appVersion
          ? stripControlCharacters(input.appVersion, 40)
          : device.appVersion,
        androidVersion: input.androidVersion
          ? stripControlCharacters(input.androidVersion, 40)
          : device.androidVersion,
        ...(input.fcmToken
          ? {
              fcmTokenEnc: encryptSecret(
                input.fcmToken,
                `fcm:${device.id}`,
              ),
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(devices.id, device.id));

    await markDeviceAlertResolved(device.id);

    const userRows = await db()
      .select()
      .from(users)
      .where(eq(users.id, device.userId))
      .limit(1);
    const user = userRows[0];

    if (user && nextSimState) {
      after(async () => {
        try {
          await maybeSendSimChangeAlert({
            user,
            deviceId: device.id,
            deviceName: device.name,
            previousSimState,
            nextSimState,
          });
        } catch {
          // Best-effort.
        }
      });
    }

    const pending = await claimPendingCommands(device.id);

    return ok({
      commands: pending,
      config: deviceRuntimeConfig({
        ...device,
        simState: nextSimState ?? device.simState,
        batteryLevel: input.batteryLevel ?? device.batteryLevel,
        isCharging: input.isCharging ?? device.isCharging,
      }),
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
