import { and, desc, eq, inArray } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { db } from "@/db";
import { commands, devicePhotos } from "@/db/schema";
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
import { encryptBuffer } from "@/lib/crypto";
import { sanitizeJpeg } from "@/lib/images";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requestContext } from "@/lib/request";
import { photoUploadSchema } from "@/lib/validation";

export const runtime = "nodejs";

const MAX_PHOTO_BYTES = 1_500_000;
const MAX_PHOTOS_PER_DEVICE = 20;

export async function POST(request: NextRequest) {
  try {
    assertMethod(request, ["POST"]);
    assertContentType(request);
    const device = await authenticateDevice(request);
    const ctx = requestContext(request);

    await enforceRateLimit({
      bucket: "device-photo",
      identifier: device.id,
      limit: 6,
      windowSec: 60 * 60,
    });

    const input = await parseJson(request, photoUploadSchema, {
      maxBytes: 2_100_000,
    });
    const now = Date.now();
    const capturedAt = new Date(input.capturedAt).getTime();
    if (
      !Number.isFinite(capturedAt) ||
      capturedAt > now + 10 * 60_000 ||
      capturedAt < now - 24 * 60 * 60_000
    ) {
      throw new ApiError(
        422,
        "invalid_capture_time",
        "The photo capture time is outside the accepted window.",
      );
    }

    const commandRows = await db()
      .select()
      .from(commands)
      .where(
        and(
          eq(commands.id, input.commandId),
          eq(commands.deviceId, device.id),
          eq(commands.type, "CAPTURE_PHOTO"),
        ),
      )
      .limit(1);
    const command = commandRows[0];
    if (!command) {
      throw new ApiError(404, "not_found", "Photo request not found.");
    }
    if (command.status === "completed") {
      throw new ApiError(409, "already_uploaded", "This photo request was already answered.");
    }
    if (
      command.status !== "pending" &&
      command.status !== "delivered"
    ) {
      throw new ApiError(410, "command_closed", "This photo request is no longer open.");
    }
    if (command.expiresAt.getTime() <= now) {
      throw new ApiError(410, "command_expired", "This photo request has expired.");
    }

    const bytes = Buffer.from(input.dataBase64, "base64");
    if (bytes.length < 200 || bytes.length > MAX_PHOTO_BYTES) {
      throw new ApiError(422, "invalid_photo", "The photo is empty or too large.");
    }
    if (
      bytes[0] !== 0xff ||
      bytes[1] !== 0xd8 ||
      bytes[2] !== 0xff
    ) {
      throw new ApiError(415, "unsupported_photo", "Only JPEG photos are accepted.");
    }

    // Decode, downscale and re-encode before anything is written. Dimensions
    // reported by the client are ignored; EXIF and any appended payloads are
    // gone by the time the image is encrypted at rest.
    const photoData = await sanitizeJpeg(bytes);

    const inserted = await db()
      .insert(devicePhotos)
      .values({
        deviceId: device.id,
        commandId: command.id,
        mimeType: "image/jpeg",
        width: photoData.width,
        height: photoData.height,
        byteSize: photoData.data.length,
        dataEnc: encryptBuffer(photoData.data, `photo:${device.id}`),
        capturedAt: new Date(capturedAt),
      })
      .returning({ id: devicePhotos.id });

    const photo = inserted[0];
    if (!photo) {
      throw new ApiError(500, "photo_failed", "Could not store the photo.");
    }

    await db()
      .update(commands)
      .set({
        status: "completed",
        completedAt: new Date(),
        result: {
          photoId: photo.id,
          message: "Photo uploaded and encrypted.",
        },
      })
      .where(eq(commands.id, command.id));

    const older = await db()
      .select({ id: devicePhotos.id })
      .from(devicePhotos)
      .where(eq(devicePhotos.deviceId, device.id))
      .orderBy(desc(devicePhotos.capturedAt))
      .offset(MAX_PHOTOS_PER_DEVICE);
    if (older.length > 0) {
      await db()
        .delete(devicePhotos)
        .where(
          inArray(
            devicePhotos.id,
            older.map((row) => row.id),
          ),
        );
    }

    await audit({
      userId: device.userId,
      action: "device.photo.uploaded",
      targetType: "device",
      targetId: device.id,
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
      metadata: { photoId: photo.id, byteSize: photoData.data.length },
    });

    return ok({ photoId: photo.id });
  } catch (error) {
    return errorResponse(error);
  }
}

export const maxDuration = 30;
