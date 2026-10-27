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
import { clearSessionCookie } from "@/lib/auth/session";
import { requireVerifiedApiUser } from "@/lib/auth/guards";
import { sendTransactionalEmail } from "@/lib/email/send";
import { verifyPassword } from "@/lib/password";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertTrustedOrigin, requestContext } from "@/lib/request";
import { deleteAccountSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function DELETE(request: NextRequest) {
  try {
    assertMethod(request, ["DELETE"]);
    assertContentType(request);
    assertTrustedOrigin(request);
    const ctx = requestContext(request);
    const session = await requireVerifiedApiUser();
    const input = await parseJson(request, deleteAccountSchema);

    await enforceRateLimit({
      bucket: "account-delete",
      identifier: session.user.id,
      limit: 5,
      windowSec: 3600,
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

    const snapshot = {
      email: session.user.email,
      name: session.user.name,
      priority: session.user.emailProviderPriority,
    };

    await db().delete(users).where(eq(users.id, session.user.id));
    await clearSessionCookie();
    await audit({
      action: "account.deleted",
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
    });

    after(async () => {
      try {
        await sendTransactionalEmail({
          to: snapshot.email,
          userId: null,
          priority: snapshot.priority,
          payload: {
            template: "account_deleted",
            data: { name: snapshot.name },
          },
        });
      } catch {
        // The account is gone; the notice is best-effort.
      }
    });

    return ok({ deleted: true, redirect: "/" });
  } catch (error) {
    return errorResponse(error);
  }
}
