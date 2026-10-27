import { after } from "next/server";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { recoveryCodes, users } from "@/db/schema";
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
import { verifyUserTotp } from "@/lib/auth/mfa";
import {
  markSessionMfaVerified,
  revokeAllSessions,
} from "@/lib/auth/session";
import { verifyPassword } from "@/lib/password";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertTrustedOrigin, requestContext } from "@/lib/request";
import { mfaDisableSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertMethod(request, ["POST"]);
    assertContentType(request);
    assertTrustedOrigin(request);
    const ctx = requestContext(request);
    const session = await requireVerifiedApiUser();
    const input = await parseJson(request, mfaDisableSchema);

    await enforceRateLimit({
      bucket: "mfa-disable",
      identifier: session.user.id,
      limit: 10,
      windowSec: 900,
    });

    if (!session.user.totpEnabledAt) {
      throw new ApiError(
        409,
        "not_enabled",
        "Authenticator app verification is not enabled.",
      );
    }

    const rows = await db()
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);
    const row = rows[0];
    if (!row || !(await verifyPassword(input.password, row.passwordHash))) {
      throw new ApiError(
        400,
        "invalid_password",
        "Your password is incorrect.",
      );
    }

    if (!input.code || !(await verifyUserTotp(session.user.id, input.code))) {
      throw new ApiError(
        401,
        "invalid_code",
        "Enter a current authenticator code to disable this factor.",
      );
    }

    await db()
      .update(users)
      .set({
        totpSecretEnc: null,
        totpEnabledAt: null,
        totpLastStep: 0,
        recoveryCodesGeneratedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, session.user.id));
    await db()
      .delete(recoveryCodes)
      .where(eq(recoveryCodes.userId, session.user.id));

    // Changing an authentication factor invalidates sessions created with the
    // old factor. Keep only the browser that performed the change.
    await markSessionMfaVerified(session.id);
    await revokeAllSessions(session.user.id, session.id);

    await audit({
      userId: session.user.id,
      action: "auth.mfa.disabled",
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
    });
    after(async () => {
      await sendMfaEnabledEmail(session.user, false);
    });

    return ok({ enabled: false });
  } catch (error) {
    return errorResponse(error);
  }
}
