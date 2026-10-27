import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { devices } from "@/db/schema";
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
import {
  getDeviceForUser,
  getDeviceSnapshot,
  getLatestLocation,
  toDeviceSummary,
} from "@/lib/data/devices";
import { encryptSecret, stripControlCharacters } from "@/lib/crypto";
import { assertTrustedOrigin, requestContext } from "@/lib/request";
import { deviceUpdateSchema, locationQuerySchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertMethod(request, ["GET"]);
    const session = await requireApiUser();
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      throw new ApiError(404, "not_found", "Device not found.");
    }

    const parsed = locationQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );
    const range = parsed.success ? parsed.data.range : "24h";

    const snapshot = await getDeviceSnapshot(session.user.id, id, range);
    if (!snapshot) {
      throw new ApiError(404, "not_found", "Device not found.");
    }

    return ok({
      summary: snapshot.summary,
      points: snapshot.points,
      geofences: snapshot.geofences,
      commands: snapshot.commands,
      range,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

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
    const input = await parseJson(request, deviceUpdateSchema);
    const device = await getDeviceForUser(session.user.id, id);
    if (!device) throw new ApiError(404, "not_found", "Device not found.");

    const config = {
      ...device.config,
      ...(input.offlineAlertMinutes !== undefined
        ? { offlineAlertMinutes: input.offlineAlertMinutes }
        : {}),
    };

    const updated = await db()
      .update(devices)
      .set({
        name:
          input.name !== undefined
            ? stripControlCharacters(input.name, 80)
            : device.name,
        trackingProfile: input.trackingProfile ?? device.trackingProfile,
        config,
        ...(input.fallbackSmsNumber !== undefined
          ? {
              fallbackSmsEnc: input.fallbackSmsNumber
                ? encryptSecret(input.fallbackSmsNumber, `sms:${device.id}`)
                : null,
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(devices.id, device.id))
      .returning();

    const next = updated[0];
    if (!next) {
      throw new ApiError(500, "update_failed", "Could not update device.");
    }

    await audit({
      userId: session.user.id,
      action: "device.updated",
      targetType: "device",
      targetId: device.id,
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
      metadata: {
        name: input.name !== undefined,
        trackingProfile: input.trackingProfile,
        offlineAlertMinutes: input.offlineAlertMinutes,
        fallbackSmsChanged: input.fallbackSmsNumber !== undefined,
      },
    });

    const latest = await getLatestLocation(device.id);
    return ok({ summary: toDeviceSummary(next, latest) });
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
    const purge = request.nextUrl.searchParams.get("purge") === "true";
    const device = await getDeviceForUser(session.user.id, id);
    if (!device) throw new ApiError(404, "not_found", "Device not found.");

    if (purge) {
      await db().delete(devices).where(eq(devices.id, device.id));
    } else {
      await db()
        .update(devices)
        .set({
          revokedAt: new Date(),
          status: "revoked",
          lostModeAt: null,
          updatedAt: new Date(),
        })
        .where(eq(devices.id, device.id));
    }

    await audit({
      userId: session.user.id,
      action: purge ? "device.purged" : "device.unpaired",
      targetType: "device",
      targetId: device.id,
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
    });

    return ok({ revoked: true, purged: purge });
  } catch (error) {
    return errorResponse(error);
  }
}
