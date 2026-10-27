import "server-only";

import { and, desc, eq, gt, isNull, lt } from "drizzle-orm";

import { db } from "@/db";
import { emailCodes, recoveryCodes, users } from "@/db/schema";
import {
  decryptSecret,
  hashWithSecret,
  normalizeRecoveryCode,
  randomCode,
  safeEqual,
} from "@/lib/crypto";
import { generateTotpSecret, totpUri, verifyTotp } from "@/lib/totp";

export function totpSecretContext(userId: string): string {
  return `totp:${userId}`;
}

export function createTotpSetup(userId: string, email: string) {
  const secret = generateTotpSecret();
  return {
    secret,
    uri: totpUri(secret, email),
  };
}

export async function verifyUserTotp(
  userId: string,
  code: string,
): Promise<boolean> {
  const rows = await db()
    .select({
      secret: users.totpSecretEnc,
      enabledAt: users.totpEnabledAt,
      lastStep: users.totpLastStep,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const row = rows[0];
  if (!row?.secret || !row.enabledAt) return false;

  const secret = decryptSecret(row.secret, totpSecretContext(userId));
  const result = verifyTotp(secret, code, { lastUsedStep: row.lastStep });
  if (!result.valid) return false;

  const updated = await db()
    .update(users)
    .set({ totpLastStep: result.step, updatedAt: new Date() })
    .where(and(eq(users.id, userId), lt(users.totpLastStep, result.step)))
    .returning({ id: users.id });

  return updated.length > 0;
}

export async function verifyRecoveryCode(
  userId: string,
  input: string,
): Promise<boolean> {
  const normalized = normalizeRecoveryCode(input);
  if (normalized.length < 8) return false;
  const codeHash = hashWithSecret(`recovery:${normalized}`);

  const rows = await db()
    .update(recoveryCodes)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(recoveryCodes.userId, userId),
        eq(recoveryCodes.codeHash, codeHash),
        isNull(recoveryCodes.usedAt),
      ),
    )
    .returning({ id: recoveryCodes.id });

  return rows.length > 0;
}

export async function createEmailMfaCode(userId: string): Promise<string> {
  const code = randomCode(6);
  await db().delete(emailCodes).where(eq(emailCodes.userId, userId));
  await db().insert(emailCodes).values({
    userId,
    codeHash: hashWithSecret(`email-mfa:${userId}:${code}`),
    expiresAt: new Date(Date.now() + 10 * 60_000),
  });
  return code;
}

export async function verifyEmailMfaCode(
  userId: string,
  input: string,
): Promise<boolean> {
  const rows = await db()
    .select()
    .from(emailCodes)
    .where(
      and(
        eq(emailCodes.userId, userId),
        isNull(emailCodes.consumedAt),
        gt(emailCodes.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(emailCodes.createdAt))
    .limit(1);

  const row = rows[0];
  if (!row || row.attempts >= 5) return false;

  await db()
    .update(emailCodes)
    .set({ attempts: row.attempts + 1 })
    .where(eq(emailCodes.id, row.id));

  if (
    !safeEqual(
      row.codeHash,
      hashWithSecret(`email-mfa:${userId}:${input.trim()}`),
    )
  ) {
    return false;
  }

  const consumed = await db()
    .update(emailCodes)
    .set({ consumedAt: new Date() })
    .where(and(eq(emailCodes.id, row.id), isNull(emailCodes.consumedAt)))
    .returning({ id: emailCodes.id });

  return consumed.length > 0;
}
