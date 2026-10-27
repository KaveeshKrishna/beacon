import type { NextRequest } from "next/server";
import QRCode from "qrcode";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { devices } from "@/db/schema";
import {
  ApiError,
  assertContentType,
  assertMethod,
  errorResponse,
  ok,
} from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireVerifiedApiUser } from "@/lib/auth/guards";
import { createPairingCode } from "@/lib/auth/tokens";
import { RATE_LIMITS } from "@/lib/constants";
import { getEnv } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertTrustedOrigin, requestContext } from "@/lib/request";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertMethod(request, ["POST"]);
    assertContentType(request);
    assertTrustedOrigin(request);
    const ctx = requestContext(request);
    const session = await requireVerifiedApiUser();
    const env = getEnv();

    await enforceRateLimit({
      bucket: "pairing-create",
      identifier: session.user.id,
      ...RATE_LIMITS.pairingCreate,
    });

    const countRows = await db()
      .select({ id: devices.id })
      .from(devices)
      .where(
        and(eq(devices.userId, session.user.id), isNull(devices.revokedAt)),
      );
    if (countRows.length >= env.MAX_DEVICES_PER_USER) {
      throw new ApiError(
        409,
        "device_limit",
        `This account can pair up to ${env.MAX_DEVICES_PER_USER} devices.`,
      );
    }

    const code = await createPairingCode(session.user.id);
    const server = env.APP_URL.replace(/\/$/, "");
    const deepLink = `beacon://pair?server=${encodeURIComponent(server)}&code=${encodeURIComponent(code.display)}`;
    const qrDataUrl = await QRCode.toDataURL(deepLink, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 260,
      color: { dark: "#0b0c0e", light: "#ffffff" },
    });

    await audit({
      userId: session.user.id,
      action: "device.pairing_code.created",
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
    });

    return ok({
      code: code.display,
      expiresAt: code.expiresAt.toISOString(),
      serverUrl: server,
      deepLink,
      qrDataUrl,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
