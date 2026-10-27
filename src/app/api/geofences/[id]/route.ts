import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { devices, geofences } from "@/db/schema";
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
import { toGeofenceDto } from "@/lib/data/devices";
import { isUuid } from "@/lib/ids";
import { assertTrustedOrigin, requestContext } from "@/lib/request";
import { geofenceUpdateSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertMethod(request, ["PATCH"]);
    assertContentType(request);
    assertTrustedOrigin(request);
    const ctx = requestContext(request);
    const session = await requireApiUser();
    const { id } = await context.params;
    if (!isUuid(id)) throw new ApiError(404, "not_found", "Geofence not found.");
    const input = await parseJson(request, geofenceUpdateSchema);

    const rows = await db()
      .select({ geofence: geofences })
      .from(geofences)
      .innerJoin(devices, eq(devices.id, geofences.deviceId))
      .where(
        and(eq(geofences.id, id), eq(devices.userId, session.user.id)),
      )
      .limit(1);
    const existing = rows[0]?.geofence;
    if (!existing) throw new ApiError(404, "not_found", "Geofence not found.");

    const geometryChanged =
      input.centerLat !== undefined ||
      input.centerLon !== undefined ||
      input.radiusM !== undefined;

    const updated = await db()
      .update(geofences)
      .set({
        name:
          input.name !== undefined
            ? stripControlCharacters(input.name, 60)
            : existing.name,
        centerLat: input.centerLat ?? existing.centerLat,
        centerLon: input.centerLon ?? existing.centerLon,
        radiusM: input.radiusM ?? existing.radiusM,
        notifyOnEnter: input.notifyOnEnter ?? existing.notifyOnEnter,
        notifyOnExit: input.notifyOnExit ?? existing.notifyOnExit,
        lastInside: geometryChanged ? null : existing.lastInside,
        updatedAt: new Date(),
      })
      .where(eq(geofences.id, existing.id))
      .returning();

    const next = updated[0];
    if (!next) {
      throw new ApiError(500, "geofence_failed", "Could not update geofence.");
    }

    await audit({
      userId: session.user.id,
      action: "geofence.updated",
      targetType: "geofence",
      targetId: existing.id,
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
    });

    return ok({ geofence: toGeofenceDto(next) });
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
    if (!isUuid(id)) throw new ApiError(404, "not_found", "Geofence not found.");

    const rows = await db()
      .select({ geofence: geofences })
      .from(geofences)
      .innerJoin(devices, eq(devices.id, geofences.deviceId))
      .where(
        and(eq(geofences.id, id), eq(devices.userId, session.user.id)),
      )
      .limit(1);
    const existing = rows[0]?.geofence;
    if (!existing) throw new ApiError(404, "not_found", "Geofence not found.");

    await db().delete(geofences).where(eq(geofences.id, existing.id));
    await audit({
      userId: session.user.id,
      action: "geofence.deleted",
      targetType: "geofence",
      targetId: existing.id,
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
    });

    return ok({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
