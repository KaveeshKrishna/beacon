import { after } from "next/server";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { emailCodes, users } from "@/db/schema";
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
import {
  markSessionMfaVerified,
  revokeAllSessions,
} from "@/lib/auth/session";
import { verifyPassword } from "@/lib/password";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertTrustedOrigin, requestContext } from "@/lib/request";
import { emailMfaToggleSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertMethod(request, ["POST"]);
    assertContentType(request);
    assertTrustedOrigin(request);
    const ctx = requestContext(request);
    const session = await requireVerifiedApiUser();
    const input = await parseJson(request, emailMfaToggleSchema);

    await enforceRateLimit({
      bucket: "mfa-email-toggle",
      identifier: session.user.id,
      limit: 10,
      windowSec: 900,
    });

    const rows = await db()
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);
    const row = rows[0];
    if (!row || !(await verifyPassword(input.password, row.passwordHash))) {
      throw new ApiError(400, "invalid_password", "Your password is incorrect.");
    }

    await db()
      .update(users)
      .set({ emailMfaEnabled: input.enabled, updatedAt: new Date() })
      .where(eq(users.id, session.user.id));
    if (!input.enabled) {
      await db().delete(emailCodes).where(eq(emailCodes.userId, session.user.id));
    }

    // Enabling email MFA must not lock out the session that just proved the
    // password, and changing factors must retire older sessions.
    await markSessionMfaVerified(session.id);
    await revokeAllSessions(session.user.id, session.id);

    await audit({
      userId: session.user.id,
      action: input.enabled
        ? "auth.mfa.email.enabled"
        : "auth.mfa.email.disabled",
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
    });
    after(async () => {
      await sendMfaEnabledEmail(session.user, input.enabled);
    });

    return ok({ emailMfaEnabled: input.enabled });
  } catch (error) {
    return errorResponse(error);
  }
}
