import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { sessions, users } from "@/db/schema";

export async function registerLoginSuccess(userId: string): Promise<void> {
  await db()
    .update(users)
    .set({
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

export async function registerLoginFailure(userId: string): Promise<void> {
  await db()
    .update(users)
    .set({
      failedLoginCount: sql`${users.failedLoginCount} + 1`,
      lockedUntil: sql`case when ${users.failedLoginCount} + 1 >= 10 then now() + interval '15 minutes' else ${users.lockedUntil} end`,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

export async function findActiveUserByEmail(email: string) {
  const rows = await db()
    .select()
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function revokeOtherSessionsForBrowser(
  userId: string,
  sessionId: string,
): Promise<void> {
  await db()
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  // The current session is re-created by the caller; this is used only when
  // sensitive credentials change.
  void sessionId;
}
