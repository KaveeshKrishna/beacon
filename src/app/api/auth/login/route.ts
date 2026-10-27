import { after } from "next/server";
import type { NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";

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
import { sendNewLoginEmail } from "@/lib/auth/emails";
import {
  registerLoginFailure,
  registerLoginSuccess,
} from "@/lib/auth/login-state";
import { createSession } from "@/lib/auth/session";
import { createPendingMfa } from "@/lib/auth/pending-mfa";
import { RATE_LIMITS } from "@/lib/constants";
import { hashWithSecret, maskEmail } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { dummyPasswordVerify, verifyPassword } from "@/lib/password";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertTrustedOrigin, requestContext } from "@/lib/request";
import { loginSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertMethod(request, ["POST"]);
    assertContentType(request);
    assertTrustedOrigin(request);
    const ctx = requestContext(request);
    const input = await parseJson(request, loginSchema);

    await enforceRateLimit({
      bucket: "login-ip",
      identifier: ctx.ip,
      ...RATE_LIMITS.loginIp,
    });
    await enforceRateLimit({
      bucket: "login-account",
      identifier: input.email,
      ...RATE_LIMITS.loginAccount,
    });

    const rows = await db()
      .select()
      .from(users)
      .where(and(eq(users.email, input.email), isNull(users.deletedAt)))
      .limit(1);

    const user = rows[0];

    if (!user) {
      await dummyPasswordVerify(input.password);
      await audit({
        action: "auth.login.failed",
        ipHash: ctx.ipHash,
        userAgent: ctx.userAgent,
        metadata: {
          emailHash: hashWithSecret(`email:${input.email}`).slice(0, 16),
        },
      });
      throw new ApiError(
        401,
        "invalid_credentials",
        "Invalid email or password.",
      );
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      await dummyPasswordVerify(input.password);
      await audit({
        userId: user.id,
        action: "auth.login.locked",
        ipHash: ctx.ipHash,
        userAgent: ctx.userAgent,
      });
      throw new ApiError(
        401,
        "invalid_credentials",
        "Invalid email or password.",
      );
    }

    const valid = await verifyPassword(input.password, user.passwordHash);
    if (!valid) {
      await registerLoginFailure(user.id);
      await audit({
        userId: user.id,
        action: "auth.login.failed",
        ipHash: ctx.ipHash,
        userAgent: ctx.userAgent,
      });
      throw new ApiError(
        401,
        "invalid_credentials",
        "Invalid email or password.",
      );
    }

    await registerLoginSuccess(user.id);

    const methods: string[] = [];
    if (user.totpEnabledAt) methods.push("totp");
    if (user.emailMfaEnabled) methods.push("email");
    const recoveryRows = await db()
      .select({ id: recoveryCodes.id })
      .from(recoveryCodes)
      .where(
        and(eq(recoveryCodes.userId, user.id), isNull(recoveryCodes.usedAt)),
      )
      .limit(1);
    if (recoveryRows.length > 0) methods.push("recovery");

    if (user.totpEnabledAt || user.emailMfaEnabled) {
      await createPendingMfa(user.id, ctx);
      await audit({
        userId: user.id,
        action: "auth.login.mfa_required",
        ipHash: ctx.ipHash,
        userAgent: ctx.userAgent,
      });
      return ok({
        mfaRequired: true,
        methods,
        email: maskEmail(user.email),
      });
    }

    await createSession(user.id, ctx, { mfaVerified: false });
    await audit({
      userId: user.id,
      action: "auth.login.success",
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
    });
    after(async () => {
      try {
        await sendNewLoginEmail(user, ctx.userAgent);
      } catch (error) {
        logger.error("auth", "New login email failed", error);
      }
    });

    return ok({ mfaRequired: false, redirect: "/app" });
  } catch (error) {
    return errorResponse(error);
  }
}
