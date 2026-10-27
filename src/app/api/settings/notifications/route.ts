import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

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
import { requireApiUser } from "@/lib/auth/guards";
import { assertTrustedOrigin, requestContext } from "@/lib/request";
import { notificationSettingsSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest) {
  try {
    assertMethod(request, ["PATCH"]);
    assertContentType(request);
    assertTrustedOrigin(request);
    const ctx = requestContext(request);
    const session = await requireApiUser();
    const input = await parseJson(request, notificationSettingsSchema);

    await db()
      .update(users)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(users.id, session.user.id));

    await audit({
      userId: session.user.id,
      action: "account.notifications.updated",
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
    });

    return ok({ notifications: input });
  } catch (error) {
    return errorResponse(error);
  }
}
