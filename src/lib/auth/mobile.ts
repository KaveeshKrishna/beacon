import "server-only";

import { and, eq, gt, isNull, ne } from "drizzle-orm";

import { db } from "@/db";
import {
  devices,
  mobileLinkCodes,
  mobileSessions,
  users,
  type Device,
  type User,
} from "@/db/schema";
import { ApiError } from "@/lib/api";
import {
  MOBILE_ACCESS_PREFIX,
  MOBILE_ACCESS_TTL_MINUTES,
  MOBILE_LINK_TTL_MINUTES,
  MOBILE_REFRESH_PREFIX,
  MOBILE_REFRESH_TTL_DAYS,
  MOBILE_TOKEN_SCOPE,
} from "@/lib/constants";
import { extractBearerToken } from "@/lib/auth/device";
import { hashWithSecret, randomToken, safeEqual } from "@/lib/crypto";
import { verifyPkceS256 } from "@/lib/pkce";

export type MobileSessionRow = typeof mobileSessions.$inferSelect;

export type AuthenticatedMobile = {
  session: MobileSessionRow;
  user: User;
  device: Device;
};

export type MobileTokens = {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
};

function accessTtlMs(): number {
  return MOBILE_ACCESS_TTL_MINUTES * 60_000;
}

function refreshTtlMs(): number {
  return MOBILE_REFRESH_TTL_DAYS * 86_400_000;
}

export function hashMobileAccessToken(token: string): string {
  return hashWithSecret(`mobile-access:${token}`);
}

export function hashMobileRefreshToken(token: string): string {
  return hashWithSecret(`mobile-refresh:${token}`);
}

export function hashMobileLinkCode(code: string): string {
  return hashWithSecret(`mobile-link:${code}`);
}

function newAccessToken(): { token: string; hash: string } {
  const token = `${MOBILE_ACCESS_PREFIX}${randomToken(32)}`;
  return { token, hash: hashMobileAccessToken(token) };
}

function newRefreshToken(): { token: string; hash: string } {
  const token = `${MOBILE_REFRESH_PREFIX}${randomToken(32)}`;
  return { token, hash: hashMobileRefreshToken(token) };
}

/**
 * Create a narrow mobile session bound to one device. These tokens can read
 * the account's device list and trigger an MFA reset, but they can never act
 * as a browser session or reach account settings.
 */
export async function createMobileSession(input: {
  userId: string;
  deviceId: string;
  ipHash: string;
  userAgent: string;
}): Promise<MobileTokens & { sessionId: string; createdAt: Date }> {
  const access = newAccessToken();
  const refresh = newRefreshToken();
  const now = new Date();
  const accessExpiresAt = new Date(now.getTime() + accessTtlMs());
  const refreshExpiresAt = new Date(now.getTime() + refreshTtlMs());

  // One physical device should have at most one live account link. Re-linking
  // replaces the previous session instead of leaving an orphaned token family
  // that the owner can no longer see or revoke from the phone.
  await db()
    .update(mobileSessions)
    .set({ revokedAt: now })
    .where(
      and(
        eq(mobileSessions.userId, input.userId),
        eq(mobileSessions.deviceId, input.deviceId),
        isNull(mobileSessions.revokedAt),
      ),
    );

  const [row] = await db()
    .insert(mobileSessions)
    .values({
      userId: input.userId,
      deviceId: input.deviceId,
      accessTokenHash: access.hash,
      refreshTokenHash: refresh.hash,
      scope: MOBILE_TOKEN_SCOPE,
      ipHash: input.ipHash,
      userAgent: input.userAgent,
      accessExpiresAt,
      refreshExpiresAt,
    })
    .returning({ id: mobileSessions.id, createdAt: mobileSessions.createdAt });

  if (!row) throw new Error("Mobile session insert returned no row");

  return {
    sessionId: row.id,
    createdAt: row.createdAt,
    accessToken: access.token,
    refreshToken: refresh.token,
    accessExpiresAt,
    refreshExpiresAt,
  };
}

function hasScope(scope: string, required: string): boolean {
  return scope.split(/\s+/).filter(Boolean).includes(required);
}

/**
 * Authenticate a `bc_mob_` bearer token. Access tokens are short-lived and
 * checks are performed on the hashed value, so a leaked database row cannot be
 * replayed as a token.
 */
export async function authenticateMobile(
  request: Request,
  requiredScope: string,
): Promise<AuthenticatedMobile> {
  const token = extractBearerToken(request);
  if (
    !token ||
    !token.startsWith(MOBILE_ACCESS_PREFIX) ||
    token.length > 200
  ) {
    throw new ApiError(401, "unauthorized", "Invalid mobile credentials.");
  }

  const rows = await db()
    .select({ session: mobileSessions, user: users, device: devices })
    .from(mobileSessions)
    .innerJoin(users, eq(users.id, mobileSessions.userId))
    .innerJoin(devices, eq(devices.id, mobileSessions.deviceId))
    .where(
      and(
        eq(mobileSessions.accessTokenHash, hashMobileAccessToken(token)),
        isNull(mobileSessions.revokedAt),
        gt(mobileSessions.accessExpiresAt, new Date()),
        isNull(users.deletedAt),
        isNull(devices.revokedAt),
        eq(devices.userId, mobileSessions.userId),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row || !hasScope(row.session.scope, requiredScope)) {
    throw new ApiError(401, "unauthorized", "Invalid mobile credentials.");
  }

  if (Date.now() - row.session.lastUsedAt.getTime() > 5 * 60_000) {
    await db()
      .update(mobileSessions)
      .set({ lastUsedAt: new Date() })
      .where(eq(mobileSessions.id, row.session.id));
  }

  return row;
}

/**
 * Rotate a refresh token. The old hash is retained so that replaying a token
 * that has already been exchanged revokes the whole mobile session instead of
 * silently minting another pair.
 */
export async function rotateMobileSession(
  refreshToken: string,
): Promise<MobileTokens & { sessionId: string; userId: string; deviceId: string }> {
  if (
    !refreshToken ||
    !refreshToken.startsWith(MOBILE_REFRESH_PREFIX) ||
    refreshToken.length > 200
  ) {
    throw new ApiError(401, "invalid_refresh", "The mobile session has expired.");
  }

  const tokenHash = hashMobileRefreshToken(refreshToken);
  const rows = await db()
    .select({ session: mobileSessions })
    .from(mobileSessions)
    .innerJoin(users, eq(users.id, mobileSessions.userId))
    .innerJoin(devices, eq(devices.id, mobileSessions.deviceId))
    .where(
      and(
        eq(mobileSessions.refreshTokenHash, tokenHash),
        isNull(mobileSessions.revokedAt),
        isNull(users.deletedAt),
        isNull(devices.revokedAt),
        eq(devices.userId, mobileSessions.userId),
      ),
    )
    .limit(1);

  const session = rows[0]?.session;
  if (!session || session.refreshExpiresAt.getTime() <= Date.now()) {
    // Reuse of a token that was already rotated away is a strong signal that
    // the refresh token was copied. Revoke the session family.
    const replay = await db()
      .select({ id: mobileSessions.id })
      .from(mobileSessions)
      .where(
        and(
          eq(mobileSessions.previousRefreshTokenHash, tokenHash),
          isNull(mobileSessions.revokedAt),
        ),
      )
      .limit(1);

    if (replay[0]) {
      await db()
        .update(mobileSessions)
        .set({ revokedAt: new Date() })
        .where(eq(mobileSessions.id, replay[0].id));
    }
    throw new ApiError(
      401,
      "invalid_refresh",
      "The mobile session has expired. Link this phone again.",
    );
  }

  const access = newAccessToken();
  const refresh = newRefreshToken();
  const now = new Date();
  const accessExpiresAt = new Date(now.getTime() + accessTtlMs());
  const refreshExpiresAt = new Date(now.getTime() + refreshTtlMs());

  // Compare-and-swap on the refresh hash. Two concurrent refreshes with the
  // same token cannot both succeed; the loser is treated as a replay.
  const [updated] = await db()
    .update(mobileSessions)
    .set({
      accessTokenHash: access.hash,
      refreshTokenHash: refresh.hash,
      previousRefreshTokenHash: tokenHash,
      accessExpiresAt,
      refreshExpiresAt,
      lastUsedAt: now,
      rotatedAt: now,
    })
    .where(
      and(
        eq(mobileSessions.id, session.id),
        eq(mobileSessions.refreshTokenHash, tokenHash),
        isNull(mobileSessions.revokedAt),
      ),
    )
    .returning({ id: mobileSessions.id });

  if (!updated) {
    await db()
      .update(mobileSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(mobileSessions.id, session.id),
          isNull(mobileSessions.revokedAt),
        ),
      );
    throw new ApiError(
      401,
      "invalid_refresh",
      "The mobile session has expired. Link this phone again.",
    );
  }

  return {
    sessionId: session.id,
    userId: session.userId,
    deviceId: session.deviceId,
    accessToken: access.token,
    refreshToken: refresh.token,
    accessExpiresAt,
    refreshExpiresAt,
  };
}

export async function revokeMobileSession(
  sessionId: string,
  userId: string,
): Promise<void> {
  await db()
    .update(mobileSessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(mobileSessions.id, sessionId),
        eq(mobileSessions.userId, userId),
        isNull(mobileSessions.revokedAt),
      ),
    );
}

export async function revokeOtherMobileSessions(
  userId: string,
  exceptSessionId: string,
): Promise<void> {
  await db()
    .update(mobileSessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(mobileSessions.userId, userId),
        isNull(mobileSessions.revokedAt),
        ne(mobileSessions.id, exceptSessionId),
      ),
    );
}

/**
 * Create a five-minute, single-use link code. The browser only ever sees this
 * code; the PKCE verifier stays in the Android Keystore.
 */
export async function createMobileLinkCode(input: {
  userId: string;
  deviceId: string;
  challenge: string;
  state: string;
}): Promise<{ code: string; expiresAt: Date }> {
  const code = randomToken(32);
  const expiresAt = new Date(Date.now() + MOBILE_LINK_TTL_MINUTES * 60_000);

  await db()
    .delete(mobileLinkCodes)
    .where(
      and(
        eq(mobileLinkCodes.userId, input.userId),
        eq(mobileLinkCodes.deviceId, input.deviceId),
      ),
    );

  await db().insert(mobileLinkCodes).values({
    userId: input.userId,
    deviceId: input.deviceId,
    codeHash: hashMobileLinkCode(code),
    challenge: input.challenge,
    state: input.state,
    expiresAt,
  });

  return { code, expiresAt };
}

export type ConsumedLinkCode = {
  userId: string;
  deviceId: string;
};

/**
 * Atomically consume a link code. PKCE is verified before the single-use mark
 * so a wrong verifier cannot burn a legitimate code, and the state round-trip
 * lets the app reject a callback it did not start.
 */
export async function consumeMobileLinkCode(input: {
  code: string;
  verifier: string;
  state: string;
}): Promise<ConsumedLinkCode> {
  if (!input.code || input.code.length > 200) {
    throw new ApiError(401, "invalid_link", "This link code is not valid.");
  }

  const rows = await db()
    .select()
    .from(mobileLinkCodes)
    .where(
      and(
        eq(mobileLinkCodes.codeHash, hashMobileLinkCode(input.code)),
        isNull(mobileLinkCodes.usedAt),
        gt(mobileLinkCodes.expiresAt, new Date()),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new ApiError(401, "invalid_link", "This link code is not valid.");
  }

  if (!safeEqual(row.state, input.state)) {
    throw new ApiError(401, "invalid_link", "This link code is not valid.");
  }

  if (!verifyPkceS256(input.verifier, row.challenge)) {
    throw new ApiError(401, "invalid_link", "This link code is not valid.");
  }

  const claimed = await db()
    .update(mobileLinkCodes)
    .set({ usedAt: new Date() })
    .where(
      and(eq(mobileLinkCodes.id, row.id), isNull(mobileLinkCodes.usedAt)),
    )
    .returning({ id: mobileLinkCodes.id });

  if (!claimed[0]) {
    throw new ApiError(401, "invalid_link", "This link code is not valid.");
  }

  return { userId: row.userId, deviceId: row.deviceId };
}

export function mobileSessionRecoveryEligible(
  session: Pick<MobileSessionRow, "createdAt">,
  minimumAgeDays: number,
): boolean {
  return (
    Date.now() - session.createdAt.getTime() >= minimumAgeDays * 86_400_000
  );
}
