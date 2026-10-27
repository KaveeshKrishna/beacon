import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import QRCode from "qrcode";

import { db } from "@/db";
import { users } from "@/db/schema";
import {
  ApiError,
  assertContentType,
  assertMethod,
  errorResponse,
  ok,
} from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireVerifiedApiUser } from "@/lib/auth/guards";
import { createTotpSetup, totpSecretContext } from "@/lib/auth/mfa";
import { encryptSecret } from "@/lib/crypto";
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

    await enforceRateLimit({
      bucket: "mfa-setup",
      identifier: session.user.id,
      limit: 10,
      windowSec: 3600,
    });

    if (session.user.totpEnabledAt) {
      throw new ApiError(
        409,
        "already_enabled",
        "Authenticator app verification is already enabled.",
      );
    }

    const setup = createTotpSetup(session.user.id, session.user.email);
    const encrypted = encryptSecret(
      setup.secret,
      totpSecretContext(session.user.id),
    );

    await db()
      .update(users)
      .set({
        totpSecretEnc: encrypted,
        totpEnabledAt: null,
        totpLastStep: 0,
        updatedAt: new Date(),
      })
      .where(eq(users.id, session.user.id));

    const qrDataUrl = await QRCode.toDataURL(setup.uri, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 240,
      color: { dark: "#0b0c0e", light: "#ffffff" },
    });

    await audit({
      userId: session.user.id,
      action: "auth.mfa.setup.started",
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
    });

    return ok({
      secret: setup.secret,
      uri: setup.uri,
      qrDataUrl,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
