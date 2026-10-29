import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { geofences } from "@/db/schema";
import {
  ApiError,
  assertContentType,
  assertMethod,
  errorResponse,
  ok,
  parseJson,
} from "@/lib/api";
import { audit } from "@/lib/audit";
import { authenticateDevice } from "@/lib/auth/device";
import { RATE_LIMITS } from "@/lib/constants";
import { getDeviceGeofences, toGeofenceDto } from "@/lib/data/devices";
import { stripControlCharacters } from "@/lib/crypto";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requestContext } from "@/lib/request";
import { geofenceCreateSchema } from "@/lib/validation";

export const runtime = "nodejs";

const MAX_GEOFENCES = 20;

/**
 * Geofence management for the paired app.
 *
 * A device token is scoped to exactly one device row, so this endpoint can
 * only ever read or change fences that belong to the phone presenting the
 * token. It deliberately does not accept a device id from the caller.
 */
export async function GET(request: NextRequest) {
  try {
    assertMethod(request, ["GET"]);
    const device = await authenticateDevice(request);
    return ok({ geofences: await getDeviceGeofences(device.id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertMethod(request, ["POST"]);
    assertContentType(request);
    const device = await authenticateDevice(request);
    const ctx = requestContext(request);

    await enforceRateLimit({
      bucket: "device-geofence",
      identifier: `${device.id}:${ctx.ip}`,
      ...RATE_LIMITS.deviceGeofence,
    });

    const existing = await db()
      .select({ id: geofences.id })
      .from(geofences)
      .where(eq(geofences.deviceId, device.id));
    if (existing.length >= MAX_GEOFENCES) {
      throw new ApiError(
        409,
        "geofence_limit",
        `A device can have at most ${MAX_GEOFENCES} geofences.`,
      );
    }

    const input = await parseJson(request, geofenceCreateSchema, {
      maxBytes: 8 * 1024,
    });
    const inserted = await db()
      .insert(geofences)
      .values({
        deviceId: device.id,
        name: stripControlCharacters(input.name, 60),
        centerLat: input.centerLat,
        centerLon: input.centerLon,
        radiusM: input.radiusM,
        notifyOnEnter: input.notifyOnEnter,
        notifyOnExit: input.notifyOnExit,
      })
      .returning();

    const row = inserted[0];
    if (!row) {
      throw new ApiError(500, "geofence_failed", "Could not create geofence.");
    }

    await audit({
      userId: device.userId,
      action: "geofence.created",
      targetType: "geofence",
      targetId: row.id,
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
      metadata: { deviceId: device.id, via: "android" },
    });

    return ok({ geofence: toGeofenceDto(row) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    assertMethod(request, ["DELETE"]);
    const device = await authenticateDevice(request);
    const ctx = requestContext(request);

    await enforceRateLimit({
      bucket: "device-geofence",
      identifier: `${device.id}:${ctx.ip}`,
      ...RATE_LIMITS.deviceGeofence,
    });

    const fenceId = request.nextUrl.searchParams.get("id");
    if (!fenceId || !/^[0-9a-f-]{36}$/i.test(fenceId)) {
      throw new ApiError(400, "missing_id", "A valid geofence id is required.");
    }

    const deleted = await db()
      .delete(geofences)
      .where(
        and(eq(geofences.id, fenceId), eq(geofences.deviceId, device.id)),
      )
      .returning({ id: geofences.id });

    if (deleted.length === 0) {
      throw new ApiError(404, "not_found", "Geofence not found.");
    }

    await audit({
      userId: device.userId,
      action: "geofence.deleted",
      targetType: "geofence",
      targetId: fenceId,
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
      metadata: { deviceId: device.id, via: "android" },
    });

    return ok({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
