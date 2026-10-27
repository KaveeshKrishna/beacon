import { and, eq, isNull } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { db } from "@/db";
import { devicePhotos, devices } from "@/db/schema";
import {
  ApiError,
  assertMethod,
  errorResponse,
  ok,
} from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireApiUser } from "@/lib/auth/guards";
import { decryptBuffer } from "@/lib/crypto";
import { assertTrustedOrigin, requestContext } from "@/lib/request";

export const runtime = "nodejs";

async function getPhotoForUser(
  userId: string,
  deviceId: string,
  photoId: string,
) {
  const rows = await db()
    .select({ photo: devicePhotos })
    .from(devicePhotos)
    .innerJoin(devices, eq(devices.id, devicePhotos.deviceId))
    .where(
      and(
        eq(devicePhotos.id, photoId),
        eq(devicePhotos.deviceId, deviceId),
        eq(devices.userId, userId),
        isNull(devices.revokedAt),
      ),
    )
    .limit(1);
  return rows[0]?.photo ?? null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; photoId: string }> },
) {
  try {
    assertMethod(request, ["GET"]);
    const session = await requireApiUser();
    const { id, photoId } = await context.params;
    if (!isUuid(id) || !isUuid(photoId)) {
      throw new ApiError(404, "not_found", "Photo not found.");
    }
    const photo = await getPhotoForUser(session.user.id, id, photoId);
    if (!photo) throw new ApiError(404, "not_found", "Photo not found.");

    const bytes = decryptBuffer(photo.dataEnc, `photo:${photo.deviceId}`);
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(bytes.length),
        "Content-Disposition": `inline; filename="beacon-${photo.id}.jpg"`,
        "Cache-Control": "private, no-store, max-age=0",
        Pragma: "no-cache",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; photoId: string }> },
) {
  try {
    assertMethod(request, ["DELETE"]);
    assertTrustedOrigin(request);
    const ctx = requestContext(request);
    const session = await requireApiUser();
    const { id, photoId } = await context.params;
    if (!isUuid(id) || !isUuid(photoId)) {
      throw new ApiError(404, "not_found", "Photo not found.");
    }
    const photo = await getPhotoForUser(session.user.id, id, photoId);
    if (!photo) throw new ApiError(404, "not_found", "Photo not found.");

    await db().delete(devicePhotos).where(eq(devicePhotos.id, photo.id));
    await audit({
      userId: session.user.id,
      action: "device.photo.deleted",
      targetType: "device",
      targetId: id,
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
      metadata: { photoId: photo.id },
    });
    return ok({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
