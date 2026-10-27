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
import { requireApiUser } from "@/lib/auth/guards";
import { stripControlCharacters } from "@/lib/crypto";
import { getDeviceForUser, getDeviceGeofences, toGeofenceDto } from "@/lib/data/devices";
import { assertTrustedOrigin, requestContext } from "@/lib/request";
import { geofenceCreateSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertMethod(request, ["GET"]);
    const session = await requireApiUser();
    const { id } = await context.params;
    const device = await getDeviceForUser(session.user.id, id);
    if (!device) throw new ApiError(404, "not_found", "Device not found.");
    return ok({ geofences: await getDeviceGeofences(device.id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertMethod(request, ["POST"]);
    assertContentType(request);
    assertTrustedOrigin(request);
    const ctx = requestContext(request);
    const session = await requireApiUser();
    const { id } = await context.params;
    const device = await getDeviceForUser(session.user.id, id);
    if (!device) throw new ApiError(404, "not_found", "Device not found.");

    const existing = await db()
      .select({ id: geofences.id })
      .from(geofences)
      .where(eq(geofences.deviceId, device.id));
    if (existing.length >= 20) {
      throw new ApiError(
        409,
        "geofence_limit",
        "A device can have at most 20 geofences.",
      );
    }

    const input = await parseJson(request, geofenceCreateSchema);
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
      userId: session.user.id,
      action: "geofence.created",
      targetType: "geofence",
      targetId: row.id,
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
      metadata: { deviceId: device.id },
    });

    return ok({ geofence: toGeofenceDto(row) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertMethod(request, ["DELETE"]);
    assertContentType(request);
    assertTrustedOrigin(request);
    const ctx = requestContext(request);
    const session = await requireApiUser();
    const { id } = await context.params;
    const fenceId = request.nextUrl.searchParams.get("geofenceId");
    if (!fenceId) throw new ApiError(400, "missing_id", "Geofence id required.");

    const device = await getDeviceForUser(session.user.id, id);
    if (!device) throw new ApiError(404, "not_found", "Device not found.");

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
      userId: session.user.id,
      action: "geofence.deleted",
      targetType: "geofence",
      targetId: fenceId,
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
    });

    return ok({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
