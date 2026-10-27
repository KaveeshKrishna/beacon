import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { recoveryCodes, users } from "@/db/schema";
import { RECOVERY_CODE_COUNT } from "@/lib/constants";
import { generateRecoveryCode, hashWithSecret } from "@/lib/crypto";

export async function regenerateRecoveryCodes(
  userId: string,
): Promise<string[]> {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () =>
    generateRecoveryCode(),
  );

  await db().delete(recoveryCodes).where(eq(recoveryCodes.userId, userId));
  await db()
    .insert(recoveryCodes)
    .values(
      codes.map((code) => ({
        userId,
        codeHash: hashWithSecret(`recovery:${code.normalized}`),
      })),
    );
  await db()
    .update(users)
    .set({ recoveryCodesGeneratedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, userId));

  return codes.map((code) => code.display);
}
