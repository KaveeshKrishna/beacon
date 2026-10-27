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
import { sendPasswordChangedEmail } from "@/lib/auth/emails";
import { createSession, revokeAllSessions } from "@/lib/auth/session";
import { requireVerifiedApiUser } from "@/lib/auth/guards";
import { RATE_LIMITS } from "@/lib/constants";
import {
  hashPassword,
  isPasswordBreached,
  passwordPolicyIssue,
  verifyPassword,
} from "@/lib/password";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertTrustedOrigin, requestContext } from "@/lib/request";
import { passwordChangeSchema } from "@/lib/validation";
import { getEnv } from "@/lib/env";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertMethod(request, ["POST"]);
    assertContentType(request);
    assertTrustedOrigin(request);
    const ctx = requestContext(request);
    const session = await requireVerifiedApiUser();
    const input = await parseJson(request, passwordChangeSchema);

    await enforceRateLimit({
      bucket: "password-change",
      identifier: session.user.id,
      ...RATE_LIMITS.changePassword,
    });

    const rows = await db()
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);
    const current = rows[0];
    if (!current) throw new ApiError(401, "unauthorized", "Sign in again.");

    const valid = await verifyPassword(input.currentPassword, current.passwordHash);
    if (!valid) {
      throw new ApiError(
        400,
        "invalid_password",
        "Your current password is incorrect.",
      );
    }

    const policyIssue = passwordPolicyIssue(
      input.newPassword,
      session.user.email,
    );
    if (policyIssue) {
      throw new ApiError(422, "weak_password", policyIssue);
    }
    if (getEnv().ENABLE_HIBP && (await isPasswordBreached(input.newPassword))) {
      throw new ApiError(
        422,
        "breached_password",
        "That password appears in a known data breach. Choose a different one.",
      );
    }

    const passwordHash = await hashPassword(input.newPassword);
    await db()
      .update(users)
      .set({
        passwordHash,
        passwordUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, session.user.id));

    await revokeAllSessions(session.user.id);
    await createSession(session.user.id, ctx, {
      // The guard above already established that this session completed every
      // factor required at login. Carrying that result forward is safe; never
      // infer it solely from the account having MFA enrolled.
      mfaVerified: session.mfaVerified,
    });
    await audit({
      userId: session.user.id,
      action: "auth.password.changed",
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
    });

    const userRow = await db()
      .select()
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);
    after(async () => {
      if (userRow[0]) await sendPasswordChangedEmail(userRow[0]);
    });

    return ok({
      message: "Password changed. Other sessions were signed out.",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
