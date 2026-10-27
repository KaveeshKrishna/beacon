import { after } from "next/server";

import type { User } from "@/db/schema";
import { audit } from "@/lib/audit";
import { sendNewLoginEmail } from "@/lib/auth/emails";
import { createSession } from "@/lib/auth/session";
import { clearPendingMfa } from "@/lib/auth/pending-mfa";
import { logger } from "@/lib/logger";

export async function finalizeMfaLogin(
  user: User,
  context: { ipHash: string; userAgent: string },
): Promise<void> {
  await createSession(user.id, context, { mfaVerified: true });
  await clearPendingMfa();
  await audit({
    userId: user.id,
    action: "auth.login.success",
    ipHash: context.ipHash,
    userAgent: context.userAgent,
    metadata: { mfa: true },
  });
  after(async () => {
    try {
      await sendNewLoginEmail(user, context.userAgent);
    } catch (error) {
      logger.error("auth", "New login email failed after MFA", error);
    }
  });
}
