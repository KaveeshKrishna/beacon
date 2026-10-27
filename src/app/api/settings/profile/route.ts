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
import { requireApiUser } from "@/lib/auth/guards";
import { publicUser } from "@/lib/auth/session";
import { stripControlCharacters } from "@/lib/crypto";
import { assertTrustedOrigin, requestContext } from "@/lib/request";
import { profileSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest) {
  try {
    assertMethod(request, ["PATCH"]);
    assertContentType(request);
    assertTrustedOrigin(request);
    const ctx = requestContext(request);
    const session = await requireApiUser();
    const input = await parseJson(request, profileSchema);

    if (input.timezone) {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: input.timezone }).format();
      } catch {
        throw new ApiError(422, "invalid_timezone", "Invalid timezone.");
      }
    }

    const updated = await db()
      .update(users)
      .set({
        name: stripControlCharacters(input.name, 80),
        ...(input.timezone ? { timezone: input.timezone } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, session.user.id))
      .returning();

    const user = updated[0];
    if (!user) throw new ApiError(500, "update_failed", "Could not update profile.");

    await audit({
      userId: session.user.id,
      action: "account.profile.updated",
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
    });

    return ok({ user: publicUser({ ...session.user, ...user }) });
  } catch (error) {
    return errorResponse(error);
  }
}
