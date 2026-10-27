import { after } from "next/server";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { devices, locations, users } from "@/db/schema";
import {
  assertContentType,
  assertMethod,
  errorResponse,
  ok,
  parseJson,
} from "@/lib/api";
import { authenticateDevice } from "@/lib/auth/device";
import { RATE_LIMITS } from "@/lib/constants";
import {
  claimPendingCommands,
  deviceRuntimeConfig,
} from "@/lib/device/payload";
import {
  evaluateGeofences,
  markDeviceAlertResolved,
  maybeSendLowBatteryAlert,
} from "@/lib/notifications";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requestContext } from "@/lib/request";
import { locationBatchSchema } from "@/lib/validation";

export const runtime = "nodejs";

const MAX_FUTURE_SKEW_MS = 10 * 60_000;
const MAX_AGE_MS = 30 * 86_400_000;

export async function POST(request: NextRequest) {
  try {
    assertMethod(request, ["POST"]);
    assertContentType(request);
    const device = await authenticateDevice(request);
    const ctx = requestContext(request);

    await enforceRateLimit({
      bucket: "device-ingest",
      identifier: `${device.id}:${ctx.ip}`,
      ...RATE_LIMITS.deviceIngest,
    });

    const input = await parseJson(request, locationBatchSchema, {
      maxBytes: 256 * 1024,
    });
    const now = Date.now();

    const valid = input.points.filter((point) => {
      const recorded = new Date(point.recordedAt).getTime();
      if (!Number.isFinite(recorded)) return false;
      if (recorded > now + MAX_FUTURE_SKEW_MS) return false;
      if (recorded < now - MAX_AGE_MS) return false;
      return true;
    });

    if (valid.length === 0) {
      return ok({
        accepted: 0,
        duplicates: 0,
        skipped: input.points.length,
        commands: [],
        config: deviceRuntimeConfig(device),
      });
    }

    const sorted = [...valid].sort(
      (a, b) =>
        new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
    );
    const latest = sorted[sorted.length - 1];

    const inserted = await db()
      .insert(locations)
      .values(
        sorted.map((point) => ({
          deviceId: device.id,
          clientPointId: point.id,
          recordedAt: new Date(point.recordedAt),
          latitude: point.latitude,
          longitude: point.longitude,
          accuracyM: point.accuracyM,
          altitudeM: point.altitudeM ?? null,
          speedMps: point.speedMps ?? null,
          headingDeg: point.headingDeg ?? null,
          batteryLevel: point.batteryLevel ?? null,
          isCharging: point.isCharging ?? null,
          provider: (point.provider ?? "unknown").slice(0, 32),
          networkType: point.networkType?.slice(0, 32) ?? null,
          isMocked: point.isMocked ?? false,
          sequence: point.sequence ?? 0,
        })),
      )
      .onConflictDoNothing({
        target: [locations.deviceId, locations.clientPointId],
      })
      .returning({ id: locations.id, clientPointId: locations.clientPointId });

    const duplicates = sorted.length - inserted.length;
    const latestInserted = inserted.find(
      (row) => row.clientPointId === latest.id,
    );

    await db()
      .update(devices)
      .set({
        lastSeenAt: new Date(),
        lastLocationAt: new Date(latest.recordedAt),
        batteryLevel: latest.batteryLevel ?? device.batteryLevel,
        isCharging: latest.isCharging ?? device.isCharging,
        networkType: latest.networkType ?? device.networkType,
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

    if (user) {
      const payload = {
        deviceId: device.id,
        deviceName: device.name,
        userId: user.id,
        latitude: latest.latitude,
        longitude: latest.longitude,
        recordedAt: new Date(latest.recordedAt),
        locationId: latestInserted?.id ?? null,
      };
      after(async () => {
        try {
          await evaluateGeofences(payload);
          await maybeSendLowBatteryAlert({
            user,
            deviceId: device.id,
            deviceName: device.name,
            batteryLevel: latest.batteryLevel,
            isCharging: latest.isCharging,
            recordedAt: new Date(latest.recordedAt),
          });
          if (latest.isCharging) {
            await db()
              .update(devices)
              .set({ updatedAt: new Date() })
              .where(eq(devices.id, device.id));
          }
        } catch {
          // Notifications are best-effort and must never fail an ingest.
        }
      });
    }

    const pending = await claimPendingCommands(device.id);

    return ok({
      accepted: inserted.length,
      duplicates,
      skipped: input.points.length - valid.length,
      commands: pending,
      config: deviceRuntimeConfig(device),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
