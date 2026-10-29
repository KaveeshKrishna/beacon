import type { NextRequest } from "next/server";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { commands } from "@/db/schema";
import {
  ApiError,
  assertContentType,
  assertMethod,
  errorResponse,
  ok,
  parseJson,
} from "@/lib/api";
import { authenticateDevice } from "@/lib/auth/device";
import { deviceRuntimeConfig } from "@/lib/device/payload";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requestContext } from "@/lib/request";
import { commandAckSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertMethod(request, ["POST"]);
    assertContentType(request);
    const device = await authenticateDevice(request);
    const ctx = requestContext(request);

    await enforceRateLimit({
      bucket: "device-ack",
      identifier: `${device.id}:${ctx.ip}`,
      limit: 60,
      windowSec: 60,
    });

    const input = await parseJson(request, commandAckSchema);
    const status =
      input.status === "completed"
        ? "completed"
        : input.status === "unsupported"
          ? "unsupported"
          : "failed";
    let result: Record<string, unknown> | null = input.result ?? null;
    if (result && JSON.stringify(result).length > 4000) {
      result = { truncated: true };
    }

    const updated = await db()
      .update(commands)
      .set({
        status,
        result,
        completedAt: new Date(),
      })
      .where(
        and(
          eq(commands.id, input.commandId),
          eq(commands.deviceId, device.id),
          inArray(commands.status, ["pending", "delivered"]),
        ),
      )
      .returning({ id: commands.id });

    if (updated.length === 0) {
      throw new ApiError(404, "not_found", "Command not found or already closed.");
    }

    return ok({
      acknowledged: true,
      config: await deviceRuntimeConfig(device),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
