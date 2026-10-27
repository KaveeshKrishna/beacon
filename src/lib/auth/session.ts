import "server-only";

import { cookies } from "next/headers";
import { and, eq, gt, isNull, ne } from "drizzle-orm";

import { db } from "@/db";
import { sessions, users, type User } from "@/db/schema";
import {
  MFA_COOKIE_DEV,
  MFA_COOKIE_PROD,
  SESSION_COOKIE_DEV,
  SESSION_COOKIE_PROD,
} from "@/lib/constants";
import { hashWithSecret, randomToken } from "@/lib/crypto";
import { getEnv, secureCookies } from "@/lib/env";

export type SessionUser = Omit<User, "passwordHash" | "totpSecretEnc">;

export type AuthSession = {
  id: string;
  token?: string;
  expiresAt: Date;
  /** True once every factor enabled for the account has been completed. */
  mfaVerified: boolean;
  user: SessionUser;
};

/**
 * Whether this account requires a second factor. Sessions for accounts without
 * MFA are fully authenticated even though `mfaVerified` is false.
 */
export function mfaRequiredFor(user: SessionUser): boolean {
  return Boolean(user.totpEnabledAt) || user.emailMfaEnabled;
}

export function isFullyAuthenticated(session: AuthSession): boolean {
  return !mfaRequiredFor(session.user) || session.mfaVerified;
}

export function sessionCookieName(): string {
  return secureCookies() ? SESSION_COOKIE_PROD : SESSION_COOKIE_DEV;
}

export function mfaCookieName(): string {
  return secureCookies() ? MFA_COOKIE_PROD : MFA_COOKIE_DEV;
}

function sessionTtlMs(): number {
  return getEnv().SESSION_TTL_DAYS * 86_400_000;
}

function stripUser(user: User): SessionUser {
  const { passwordHash: _passwordHash, totpSecretEnc: _totpSecret, ...safe } = user;
  return safe;
}

export async function createSession(
  userId: string,
  context: { ipHash: string; userAgent: string },
  options: { mfaVerified: boolean },
): Promise<{ token: string; sessionId: string; expiresAt: Date }> {
  const token = randomToken(32);
  const tokenHash = hashWithSecret(`session:${token}`);
  const expiresAt = new Date(Date.now() + sessionTtlMs());

  const [row] = await db()
    .insert(sessions)
    .values({
      userId,
      tokenHash,
      userAgent: context.userAgent,
      ipHash: context.ipHash,
      mfaVerified: options.mfaVerified,
      expiresAt,
    })
    .returning({ id: sessions.id });

  if (!row) throw new Error("Session insert returned no row");

  const jar = await cookies();
  jar.set({
    name: sessionCookieName(),
    value: token,
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  return { token, sessionId: row.id, expiresAt };
}

export async function getSession(): Promise<AuthSession | null> {
  const jar = await cookies();
  const token = jar.get(sessionCookieName())?.value;
  if (!token) return null;

  const tokenHash = hashWithSecret(`session:${token}`);
  const rows = await db()
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  if (Date.now() - row.session.lastSeenAt.getTime() > 10 * 60_000) {
    await db()
      .update(sessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(sessions.id, row.session.id));
  }

  return {
    id: row.session.id,
    expiresAt: row.session.expiresAt,
    mfaVerified: row.session.mfaVerified,
    user: stripUser(row.user),
  };
}

/**
 * Mark the current browser session as having completed MFA. Used after a
 * factor is enabled so the account is not immediately locked out of the
 * session that just proved possession of the factor.
 */
export async function markSessionMfaVerified(
  sessionId: string,
): Promise<void> {
  await db()
    .update(sessions)
    .set({ mfaVerified: true })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}

export async function revokeSession(
  sessionId: string,
  userId: string,
): Promise<void> {
  await db()
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
}

export async function revokeAllSessions(
  userId: string,
  exceptSessionId?: string,
): Promise<void> {
  const conditions = [eq(sessions.userId, userId), isNull(sessions.revokedAt)];
  if (exceptSessionId) conditions.push(ne(sessions.id, exceptSessionId));
  await db()
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(...conditions));
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set({
    name: sessionCookieName(),
    value: "",
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
}

export function publicUser(user: SessionUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: Boolean(user.emailVerifiedAt),
    timezone: user.timezone,
    totpEnabled: Boolean(user.totpEnabledAt),
    emailMfaEnabled: user.emailMfaEnabled,
    emailProviderPriority: user.emailProviderPriority,
    notifyGeofence: user.notifyGeofence,
    notifyOffline: user.notifyOffline,
    notifyLowBattery: user.notifyLowBattery,
    notifySecurity: user.notifySecurity,
    createdAt: user.createdAt.toISOString(),
  };
}
