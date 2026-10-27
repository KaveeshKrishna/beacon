import "server-only";

import { and, eq, gt, isNull } from "drizzle-orm";

import { db } from "@/db";
import { emailTokens, pairingCodes } from "@/db/schema";
import {
  EMAIL_VERIFY_TTL_HOURS,
  PASSWORD_RESET_TTL_MINUTES,
  PAIRING_CODE_TTL_MINUTES,
} from "@/lib/constants";
import {
  generatePairingCode,
  hashWithSecret,
  normalizePairingCode,
  randomToken,
} from "@/lib/crypto";

export async function issueEmailToken(
  userId: string,
  purpose: "verify_email" | "reset_password",
  ttlMinutes?: number,
): Promise<string> {
  const token = randomToken(32);
  const minutes =
    ttlMinutes ??
    (purpose === "verify_email"
      ? EMAIL_VERIFY_TTL_HOURS * 60
      : PASSWORD_RESET_TTL_MINUTES);

  await db()
    .update(emailTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(emailTokens.userId, userId),
        eq(emailTokens.purpose, purpose),
        isNull(emailTokens.usedAt),
      ),
    );

  await db().insert(emailTokens).values({
    userId,
    tokenHash: hashWithSecret(`email-token:${purpose}:${token}`),
    purpose,
    expiresAt: new Date(Date.now() + minutes * 60_000),
  });

  return token;
}

export async function consumeEmailToken(
  token: string,
  purpose: "verify_email" | "reset_password",
): Promise<string | null> {
  const rows = await db()
    .update(emailTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(
          emailTokens.tokenHash,
          hashWithSecret(`email-token:${purpose}:${token}`),
        ),
        eq(emailTokens.purpose, purpose),
        isNull(emailTokens.usedAt),
        gt(emailTokens.expiresAt, new Date()),
      ),
    )
    .returning({ userId: emailTokens.userId });

  return rows[0]?.userId ?? null;
}

export async function createPairingCode(userId: string): Promise<{
  display: string;
  expiresAt: Date;
}> {
  const code = generatePairingCode();
  const expiresAt = new Date(
    Date.now() + PAIRING_CODE_TTL_MINUTES * 60_000,
  );

  await db()
    .update(pairingCodes)
    .set({ usedAt: new Date() })
    .where(and(eq(pairingCodes.userId, userId), isNull(pairingCodes.usedAt)));

  await db().insert(pairingCodes).values({
    userId,
    codeHash: hashWithSecret(`pair:${code.normalized}`),
    expiresAt,
  });

  return { display: code.display, expiresAt };
}

export async function consumePairingCode(
  input: string,
): Promise<string | null> {
  const normalized = normalizePairingCode(input);
  if (normalized.length !== 8) return null;

  const rows = await db()
    .update(pairingCodes)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(pairingCodes.codeHash, hashWithSecret(`pair:${normalized}`)),
        isNull(pairingCodes.usedAt),
        gt(pairingCodes.expiresAt, new Date()),
      ),
    )
    .returning({ userId: pairingCodes.userId });

  return rows[0]?.userId ?? null;
}
