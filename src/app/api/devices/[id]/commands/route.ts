import { after } from "next/server";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { commands, devices, type CommandPayload } from "@/db/schema";
import {
  ApiError,
  assertContentType,
  assertMethod,
  errorResponse,
  ok,
  parseJson,
} from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireApiUser, requireVerifiedApiUser } from "@/lib/auth/guards";
import {
  COMMAND_LABELS,
  COMMAND_TTL_MINUTES,
  RATE_LIMITS,
  type CommandType,
} from "@/lib/constants";
import {
  getDeviceForUser,
  getRecentCommands,
  toCommandDto,
} from "@/lib/data/devices";
import { sendPushToDevice } from "@/lib/push";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertTrustedOrigin, requestContext } from "@/lib/request";
import { commandSchema } from "@/lib/validation";

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

    return ok({ commands: await getRecentCommands(device.id, 20) });
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
    const session = await requireVerifiedApiUser();
    const { id } = await context.params;
    const input = await parseJson(request, commandSchema);

    await enforceRateLimit({
      bucket: "command-create",
      identifier: session.user.id,
      ...RATE_LIMITS.commandCreate,
    });

    const device = await getDeviceForUser(session.user.id, id);
    if (!device) throw new ApiError(404, "not_found", "Device not found.");

    const payload: CommandPayload =
      input.type === "MESSAGE" ? { message: input.message } : {};

    const expiresAt = new Date(
      Date.now() + COMMAND_TTL_MINUTES * 60_000,
    );

    const inserted = await db()
      .insert(commands)
      .values({
        deviceId: device.id,
        type: input.type,
        payload,
        createdBy: session.user.id,
        expiresAt,
      })
      .returning();

    const command = inserted[0];
    if (!command) {
      throw new ApiError(500, "command_failed", "Could not queue the command.");
    }

    if (input.type === "LOST_MODE_ON") {
      await db()
        .update(devices)
        .set({
          status: "lost",
          lostModeAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(devices.id, device.id));
    } else if (input.type === "LOST_MODE_OFF") {
      await db()
        .update(devices)
        .set({ status: "active", lostModeAt: null, updatedAt: new Date() })
        .where(eq(devices.id, device.id));
    }

    await audit({
      userId: session.user.id,
      action: "device.command.created",
      targetType: "device",
      targetId: device.id,
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
      metadata: { command: input.type },
    });

    after(async () => {
      await sendPushToDevice({
        deviceId: device.id,
        fcmTokenEnc: device.fcmTokenEnc,
        commandId: command.id,
        type: command.type,
      });
    });

    return ok({
      command: toCommandDto(command),
      label: COMMAND_LABELS[input.type as CommandType],
    });
  } catch (error) {
    return errorResponse(error);
  }
}
