import type { NextRequest } from "next/server";
import { and, desc, eq, gt, isNull } from "drizzle-orm";

import { db } from "@/db";
import { sessions } from "@/db/schema";
import { assertMethod, errorResponse, ok } from "@/lib/api";
import { requireApiUser } from "@/lib/auth/guards";
import { describeUserAgent } from "@/lib/user-agent";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    assertMethod(request, ["GET"]);
    const session = await requireApiUser();

    const rows = await db()
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, session.user.id),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(sessions.lastSeenAt));

    return ok({
      sessions: rows.map((row) => ({
        id: row.id,
        current: row.id === session.id,
        device: describeUserAgent(row.userAgent),
        userAgent: row.userAgent,
        createdAt: row.createdAt.toISOString(),
        lastSeenAt: row.lastSeenAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        mfaVerified: row.mfaVerified,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
