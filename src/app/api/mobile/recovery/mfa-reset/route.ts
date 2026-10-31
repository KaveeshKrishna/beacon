import { after } from "next/server";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import {
  pendingMfa,
  recoveryCodes,
  users,
} from "@/db/schema";
import {
  ApiError,
  assertContentType,
  assertMethod,
  errorResponse,
  ok,
  parseJson,
} from "@/lib/api";
import { audit } from "@/lib/audit";
import { sendMfaResetEmail } from "@/lib/auth/emails";
import {
  authenticateMobile,
  mobileSessionRecoveryEligible,
  revokeOtherMobileSessions,
} from "@/lib/auth/mobile";
import { revokeAllSessions } from "@/lib/auth/session";
import {
  MOBILE_RECOVERY_MIN_SESSION_AGE_DAYS,
  RATE_LIMITS,
} from "@/lib/constants";
import { verifyPassword } from "@/lib/password";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requestContext } from "@/lib/request";
import { mfaResetSchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * Tier 1 recovery: a linked phone that has been trusted for at least seven
 * days may remove a lost authenticator. The account password is still
 * required, so a stolen unlocked phone alone cannot take over the account.
 *
 * The result is deliberately not a password reset. Web sessions are revoked,
 * every other mobile link is revoked, and the account must enroll a fresh
 * factor before the dashboard becomes usable again.
 */
export async function POST(request: NextRequest) {
  try {
    assertMethod(request, ["POST"]);
    assertContentType(request);
    const ctx = requestContext(request);
    const auth = await authenticateMobile(request, "account:recover");
    const input = await parseJson(request, mfaResetSchema);

    await enforceRateLimit({
      bucket: "mobile-mfa-reset-session",
      identifier: auth.session.id,
      ...RATE_LIMITS.mobileRecoverySession,
    });
    await enforceRateLimit({
      bucket: "mobile-mfa-reset-user",
      identifier: auth.user.id,
      ...RATE_LIMITS.mobileRecoveryUser,
    });

    if (
      !mobileSessionRecoveryEligible(
        auth.session,
        MOBILE_RECOVERY_MIN_SESSION_AGE_DAYS,
      )
    ) {
      throw new ApiError(
        403,
        "recovery_not_ready",
        `Recovery becomes available after this phone has been linked for ${MOBILE_RECOVERY_MIN_SESSION_AGE_DAYS} days.`,
      );
    }

    const hasFactor =
      Boolean(auth.user.totpEnabledAt) ||
      auth.user.emailMfaEnabled ||
      auth.user.mfaEnrollmentRequired;
    if (!hasFactor) {
      throw new ApiError(
        409,
        "mfa_not_enabled",
        "Two-factor authentication is not enabled on this account.",
      );
    }

    const passwordValid = await verifyPassword(
      input.password,
      auth.user.passwordHash,
    );
    if (!passwordValid) {
      await audit({
        userId: auth.user.id,
        action: "auth.mfa_reset.failed",
        targetType: "device",
        targetId: auth.device.id,
        ipHash: ctx.ipHash,
        userAgent: ctx.userAgent,
        metadata: { reason: "invalid_password" },
      });
      throw new ApiError(
        401,
        "invalid_password",
        "That password is not correct.",
      );
    }

    const now = new Date();
    await db()
      .update(users)
      .set({
        totpSecretEnc: null,
        totpEnabledAt: null,
        totpLastStep: 0,
        emailMfaEnabled: false,
        recoveryCodesGeneratedAt: null,
        mfaEnrollmentRequired: true,
        mfaResetAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, auth.user.id));

    await db()
      .delete(recoveryCodes)
      .where(eq(recoveryCodes.userId, auth.user.id));
    await db()
      .delete(pendingMfa)
      .where(eq(pendingMfa.userId, auth.user.id));

    // Every browser must sign in again, and every other linked phone loses
    // its recovery capability. The phone that performed the reset stays
    // linked so the owner can still see device locations, and its session age
    // keeps it eligible to perform a future reset.
    await revokeAllSessions(auth.user.id);
    await revokeOtherMobileSessions(auth.user.id, auth.session.id);

    await audit({
      userId: auth.user.id,
      action: "auth.mfa_reset.completed",
      targetType: "device",
      targetId: auth.device.id,
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
      metadata: {
        method: "linked_phone",
        sessionAgeDays: Math.floor(
          (now.getTime() - auth.session.createdAt.getTime()) / 86_400_000,
        ),
      },
    });

    after(async () => {
      await sendMfaResetEmail(auth.user, auth.device.name);
    });

    return ok({
      mfaEnrollmentRequired: true,
      message:
        "Two-factor authentication was reset. Sign in on the web with your password to enroll a new authenticator.",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
