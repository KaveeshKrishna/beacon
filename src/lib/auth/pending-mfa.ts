import "server-only";

import { cookies } from "next/headers";
import { and, eq, gt, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { pendingMfa, users } from "@/db/schema";
import { MFA_PENDING_TTL_MINUTES } from "@/lib/constants";
import { hashWithSecret, randomToken } from "@/lib/crypto";
import { secureCookies } from "@/lib/env";
import { mfaCookieName } from "@/lib/auth/session";

export async function createPendingMfa(
  userId: string,
  context: { ipHash: string; userAgent: string },
): Promise<string> {
  const token = randomToken(32);
  const expiresAt = new Date(
    Date.now() + MFA_PENDING_TTL_MINUTES * 60_000,
  );

  await db()
    .delete(pendingMfa)
    .where(
      and(eq(pendingMfa.userId, userId), gt(pendingMfa.expiresAt, new Date())),
    );

  await db().insert(pendingMfa).values({
    userId,
    tokenHash: hashWithSecret(`mfa:${token}`),
    ipHash: context.ipHash,
    userAgent: context.userAgent,
    expiresAt,
  });

  const jar = await cookies();
  jar.set({
    name: mfaCookieName(),
    value: token,
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  return token;
}

export type PendingMfaRecord = {
  id: string;
  userId: string;
  attempts: number;
  user: typeof users.$inferSelect;
};

export async function getPendingMfa(): Promise<PendingMfaRecord | null> {
  const jar = await cookies();
  const token = jar.get(mfaCookieName())?.value;
  if (!token) return null;

  const rows = await db()
    .select({ pending: pendingMfa, user: users })
    .from(pendingMfa)
    .innerJoin(users, eq(users.id, pendingMfa.userId))
    .where(
      and(
        eq(pendingMfa.tokenHash, hashWithSecret(`mfa:${token}`)),
        gt(pendingMfa.expiresAt, new Date()),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    id: row.pending.id,
    userId: row.pending.userId,
    attempts: row.pending.attempts,
    user: row.user,
  };
}

export async function recordPendingMfaAttempt(id: string): Promise<number> {
  const rows = await db()
    .update(pendingMfa)
    .set({ attempts: sql`${pendingMfa.attempts} + 1` })
    .where(eq(pendingMfa.id, id))
    .returning({ attempts: pendingMfa.attempts });
  return rows[0]?.attempts ?? 0;
}

export async function clearPendingMfa(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(mfaCookieName())?.value;
  if (token) {
    await db()
      .delete(pendingMfa)
      .where(eq(pendingMfa.tokenHash, hashWithSecret(`mfa:${token}`)));
  }
  jar.set({
    name: mfaCookieName(),
    value: "",
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
}
