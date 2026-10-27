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
import { requireVerifiedApiUser } from "@/lib/auth/guards";
import { regenerateRecoveryCodes } from "@/lib/auth/recovery";
import { verifyPassword } from "@/lib/password";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertTrustedOrigin, requestContext } from "@/lib/request";
import { mfaPasswordSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertMethod(request, ["POST"]);
    assertContentType(request);
    assertTrustedOrigin(request);
    const ctx = requestContext(request);
    const session = await requireVerifiedApiUser();
    const input = await parseJson(request, mfaPasswordSchema);

    await enforceRateLimit({
      bucket: "mfa-recovery-regenerate",
      identifier: session.user.id,
      limit: 5,
      windowSec: 3600,
    });

    if (!session.user.totpEnabledAt) {
      throw new ApiError(
        409,
        "not_enabled",
        "Enable authenticator verification before generating recovery codes.",
      );
    }

    const rows = await db()
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);
    const row = rows[0];
    if (!row || !(await verifyPassword(input.password, row.passwordHash))) {
      throw new ApiError(400, "invalid_password", "Your password is incorrect.");
    }

    const recoveryCodes = await regenerateRecoveryCodes(session.user.id);
    await audit({
      userId: session.user.id,
      action: "auth.mfa.recovery.regenerated",
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
    });

    return ok({
      recoveryCodes,
      message:
        "New recovery codes generated. All previous codes are now invalid.",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
