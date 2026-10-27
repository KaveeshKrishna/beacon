import { after } from "next/server";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import {
  ApiError,
  assertContentType,
  assertMethod,
  errorResponse,
  ok,
  parseJson,
} from "@/lib/api";
import { audit } from "@/lib/audit";
import { sendMfaEnabledEmail } from "@/lib/auth/emails";
import { requireVerifiedApiUser } from "@/lib/auth/guards";
import { totpSecretContext } from "@/lib/auth/mfa";
import { regenerateRecoveryCodes } from "@/lib/auth/recovery";
import {
  markSessionMfaVerified,
  revokeAllSessions,
} from "@/lib/auth/session";
import { decryptSecret } from "@/lib/crypto";
import { verifyTotp } from "@/lib/totp";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertTrustedOrigin, requestContext } from "@/lib/request";
import { mfaCodeSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertMethod(request, ["POST"]);
    assertContentType(request);
    assertTrustedOrigin(request);
    const ctx = requestContext(request);
    const session = await requireVerifiedApiUser();
    const input = await parseJson(request, mfaCodeSchema);

    await enforceRateLimit({
      bucket: "mfa-enable",
      identifier: session.user.id,
      limit: 10,
      windowSec: 900,
    });

    if (session.user.totpEnabledAt) {
      throw new ApiError(
        409,
        "already_enabled",
        "Authenticator app verification is already enabled.",
      );
    }

    const rows = await db()
      .select({
        secret: users.totpSecretEnc,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);
    const row = rows[0];
    if (!row?.secret) {
      throw new ApiError(
        400,
        "setup_required",
        "Start authenticator setup before entering a code.",
      );
    }

    const secret = decryptSecret(row.secret, totpSecretContext(session.user.id));
    const result = verifyTotp(secret, input.code);
    if (!result.valid) {
      throw new ApiError(
        401,
        "invalid_code",
        "That code is not valid. Check the clock on your authenticator device.",
      );
    }

    await db()
      .update(users)
      .set({
        totpEnabledAt: new Date(),
        totpLastStep: result.step,
        updatedAt: new Date(),
      })
      .where(eq(users.id, session.user.id));

    const recoveryCodes = await regenerateRecoveryCodes(session.user.id);

    // This browser just proved possession of the new factor. Every older
    // session predates the factor and must sign in again.
    await markSessionMfaVerified(session.id);
    await revokeAllSessions(session.user.id, session.id);

    await audit({
      userId: session.user.id,
      action: "auth.mfa.enabled",
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
    });

    after(async () => {
      await sendMfaEnabledEmail(session.user, true);
    });

    return ok({
      enabled: true,
      recoveryCodes,
      message:
        "Authenticator enabled. Store these recovery codes somewhere offline. They will not be shown again.",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
