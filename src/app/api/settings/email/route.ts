import type { NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { emailLogs, users } from "@/db/schema";
import {
  assertContentType,
  assertMethod,
  errorResponse,
  ok,
  parseJson,
} from "@/lib/api";
import { audit } from "@/lib/audit";
import { requireVerifiedApiUser } from "@/lib/auth/guards";
import { emailProviderSummary } from "@/lib/email/send";
import { assertTrustedOrigin, requestContext } from "@/lib/request";
import { emailSettingsSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    assertMethod(request, ["GET"]);
    const session = await requireVerifiedApiUser();
    const summary = emailProviderSummary();
    const logs = await db()
      .select({
        id: emailLogs.id,
        template: emailLogs.template,
        provider: emailLogs.provider,
        status: emailLogs.status,
        latencyMs: emailLogs.latencyMs,
        createdAt: emailLogs.createdAt,
      })
      .from(emailLogs)
      .where(eq(emailLogs.userId, session.user.id))
      .orderBy(desc(emailLogs.createdAt))
      .limit(8);

    return ok({
      ...summary,
      priority: session.user.emailProviderPriority,
      recent: logs.map((log) => ({
        ...log,
        createdAt: log.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    assertMethod(request, ["PATCH"]);
    assertContentType(request);
    assertTrustedOrigin(request);
    const ctx = requestContext(request);
    const session = await requireVerifiedApiUser();
    const input = await parseJson(request, emailSettingsSchema);

    await db()
      .update(users)
      .set({ emailProviderPriority: input.priority, updatedAt: new Date() })
      .where(eq(users.id, session.user.id));

    await audit({
      userId: session.user.id,
      action: "account.email_provider.updated",
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
      metadata: { priority: input.priority },
    });

    return ok({ priority: input.priority });
  } catch (error) {
    return errorResponse(error);
  }
}
