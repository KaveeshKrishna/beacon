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
import {
  bindInstallHash,
  createDeviceReconnectCode,
} from "@/lib/auth/reconnect";
import { requireVerifiedApiUser } from "@/lib/auth/guards";
import { RATE_LIMITS } from "@/lib/constants";
import { getDeviceForUser } from "@/lib/data/devices";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertTrustedOrigin, requestContext } from "@/lib/request";
import { deviceReconnectApproveSchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * Called from the signed-in browser after the owner confirms which linked
 * device the reinstalled phone is. The response contains a custom-scheme URL
 * with a short-lived, single-use code. The PKCE verifier and the phone's
 * install fingerprint never leave the device.
 */
export async function POST(request: NextRequest) {
  try {
    assertMethod(request, ["POST"]);
    assertContentType(request);
    assertTrustedOrigin(request);
    const ctx = requestContext(request);
    const session = await requireVerifiedApiUser();
    const input = await parseJson(request, deviceReconnectApproveSchema);

    await enforceRateLimit({
      bucket: "device-reconnect-approve",
      identifier: session.user.id,
      ...RATE_LIMITS.deviceReconnectApprove,
    });

    const device = await getDeviceForUser(session.user.id, input.deviceId);
    if (!device) {
      throw new ApiError(404, "not_found", "Device not found.");
    }

    if (device.installHash && device.installHash !== input.installHash) {
      throw new ApiError(
        409,
        "install_mismatch",
        "That device is already linked to a different phone. Pair this phone as a new device instead.",
      );
    }

    // Legacy rows were paired before fingerprints existed. The owner's explicit
    // confirmation is what binds the fingerprint to the row.
    if (!device.installHash) {
      await bindInstallHash({
        userId: session.user.id,
        deviceId: device.id,
        installHash: input.installHash,
      });
    }

    const { code, expiresAt } = await createDeviceReconnectCode({
      userId: session.user.id,
      deviceId: device.id,
      challenge: input.challenge,
      state: input.state,
      installHash: input.installHash,
    });

    await audit({
      userId: session.user.id,
      action: "device.reconnect.approved",
      targetType: "device",
      targetId: device.id,
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
      metadata: { expiresAt: expiresAt.toISOString() },
    });

    const redirectUrl =
      `beacon://reconnected?code=${encodeURIComponent(code)}` +
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
