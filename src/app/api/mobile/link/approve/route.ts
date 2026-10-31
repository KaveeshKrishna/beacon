import type { NextRequest } from "next/server";

import {
  ApiError,
  assertContentType,
  assertMethod,
  errorResponse,
  ok,
  parseJson,
} from "@/lib/api";
import { audit } from "@/lib/audit";
import { createMobileLinkCode } from "@/lib/auth/mobile";
import { requireVerifiedApiUser } from "@/lib/auth/guards";
import { RATE_LIMITS } from "@/lib/constants";
import { getDeviceForUser } from "@/lib/data/devices";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertTrustedOrigin, requestContext } from "@/lib/request";
import { mobileLinkApproveSchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * Called from the signed-in browser after the owner taps "Approve" on
 * /app/link-device. The response contains a custom-scheme URL with a
 * short-lived, single-use code. The PKCE verifier never leaves the phone.
 */
export async function POST(request: NextRequest) {
  try {
    assertMethod(request, ["POST"]);
    assertContentType(request);
    assertTrustedOrigin(request);
    const ctx = requestContext(request);
    const session = await requireVerifiedApiUser();
    const input = await parseJson(request, mobileLinkApproveSchema);

    await enforceRateLimit({
      bucket: "mobile-link-approve",
      identifier: session.user.id,
      ...RATE_LIMITS.mobileLinkApprove,
    });

    const device = await getDeviceForUser(session.user.id, input.deviceId);
    if (!device) {
      throw new ApiError(404, "not_found", "Device not found.");
    }

    const { code, expiresAt } = await createMobileLinkCode({
      userId: session.user.id,
      deviceId: device.id,
      challenge: input.challenge,
      state: input.state,
    });

    await audit({
      userId: session.user.id,
      action: "mobile.link.approved",
      targetType: "device",
      targetId: device.id,
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
      metadata: { expiresAt: expiresAt.toISOString() },
    });

    const redirectUrl =
      `beacon://account-linked?code=${encodeURIComponent(code)}` +
      `&state=${encodeURIComponent(input.state)}`;

    return ok({
      redirectUrl,
      expiresAt: expiresAt.toISOString(),
      deviceName: device.name,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
