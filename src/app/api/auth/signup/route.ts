import { after } from "next/server";
import type { NextRequest } from "next/server";

import { db } from "@/db";
import { users } from "@/db/schema";
import {
  assertContentType,
  assertMethod,
  errorResponse,
  ok,
  parseJson,
} from "@/lib/api";
import { audit } from "@/lib/audit";
import { sendVerificationEmail } from "@/lib/auth/emails";
import { RATE_LIMITS } from "@/lib/constants";
import { hashPassword, isPasswordBreached, passwordPolicyIssue } from "@/lib/password";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertTrustedOrigin, requestContext } from "@/lib/request";
import { stripControlCharacters } from "@/lib/crypto";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { signupSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertMethod(request, ["POST"]);
    assertContentType(request);
    assertTrustedOrigin(request);
    const ctx = requestContext(request);

    const input = await parseJson(request, signupSchema);
    const env = getEnv();

    if (!env.ALLOW_SIGNUPS) {
      return ok({
        message:
          "Registration is closed on this instance. Ask the operator to create an account for you.",
      });
    }

    await enforceRateLimit({
      bucket: "signup-ip",
      identifier: ctx.ip,
      ...RATE_LIMITS.signupIp,
    });
    await enforceRateLimit({
      bucket: "signup-account",
      identifier: input.email,
      limit: 3,
      windowSec: 3600,
    });

    const policyIssue = passwordPolicyIssue(input.password, input.email);
    if (policyIssue) {
      return ok({ message: policyIssue, field: "password" }, { status: 422 });
    }

    if (env.ENABLE_HIBP) {
      const breached = await isPasswordBreached(input.password);
      if (breached) {
        return ok(
          {
            message:
              "That password appears in a known data breach. Choose a password you have not used elsewhere.",
            field: "password",
          },
          { status: 422 },
        );
      }
    }

    const passwordHash = await hashPassword(input.password);
    const name = stripControlCharacters(input.name, 80);

    const inserted = await db()
      .insert(users)
      .values({
        email: input.email,
        name,
        passwordHash,
      })
      .onConflictDoNothing({ target: users.email })
      .returning();

    const user = inserted[0];

    if (user) {
      await audit({
        userId: user.id,
        action: "auth.signup",
        ipHash: ctx.ipHash,
        userAgent: ctx.userAgent,
      });
      after(async () => {
        try {
          await sendVerificationEmail(user);
        } catch (error) {
          logger.error("auth", "Verification email failed during signup", error);
        }
      });
    }

    // The response is intentionally identical for new and existing addresses.
    return ok({
      message:
        "If this address can be registered, a verification email is on its way. Check your inbox and spam folder.",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
