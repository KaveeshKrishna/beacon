import { after } from "next/server";
import type { NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { pendingMfa, users } from "@/db/schema";
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
import { clearSessionCookie, revokeAllSessions } from "@/lib/auth/session";
import { consumeEmailToken } from "@/lib/auth/tokens";
import { RATE_LIMITS } from "@/lib/constants";
import {
  hashPassword,
  isPasswordBreached,
  passwordPolicyIssue,
} from "@/lib/password";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertTrustedOrigin, requestContext } from "@/lib/request";
import { resetPasswordSchema } from "@/lib/validation";
import { getEnv } from "@/lib/env";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertMethod(request, ["POST"]);
    assertContentType(request);
    assertTrustedOrigin(request);
    const ctx = requestContext(request);
    const input = await parseJson(request, resetPasswordSchema);
    const env = getEnv();

    await enforceRateLimit({
      bucket: "reset-ip",
      identifier: ctx.ip,
      ...RATE_LIMITS.passwordResetIp,
    });

    const userId = await consumeEmailToken(input.token, "reset_password");
    if (!userId) {
      throw new ApiError(
        400,
        "invalid_token",
        "This reset link is invalid or has expired.",
      );
    }

    const rows = await db()
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const user = rows[0];
    if (!user || user.deletedAt) {
      throw new ApiError(400, "invalid_token", "This account no longer exists.");
    }

    const policyIssue = passwordPolicyIssue(input.password, user.email);
    if (policyIssue) {
      throw new ApiError(422, "weak_password", policyIssue);
    }
    if (env.ENABLE_HIBP && (await isPasswordBreached(input.password))) {
      throw new ApiError(
        422,
        "breached_password",
        "That password appears in a known data breach. Choose a different one.",
      );
    }

    const passwordHash = await hashPassword(input.password);
    await db()
      .update(users)
      .set({
        passwordHash,
        passwordUpdatedAt: new Date(),
        emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())`,
        failedLoginCount: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    await db().delete(pendingMfa).where(eq(pendingMfa.userId, user.id));
    await revokeAllSessions(user.id);
    await clearSessionCookie();
    await audit({
      userId: user.id,
      action: "auth.password.reset",
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
    });

    after(async () => {
      await sendPasswordChangedEmail({ ...user, passwordHash });
    });

    return ok({
      message: "Password updated. Sign in with your new password.",
      redirect: "/login",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
