import "server-only";

import type { User } from "@/db/schema";
import { issueEmailToken } from "@/lib/auth/tokens";
import { getEnv } from "@/lib/env";
import { sendTransactionalEmail } from "@/lib/email/send";
import { formatDateTime } from "@/lib/format";
import { logger } from "@/lib/logger";

function baseUrl(): string {
  return getEnv().APP_URL.replace(/\/$/, "");
}

export async function sendVerificationEmail(user: User): Promise<void> {
  const token = await issueEmailToken(user.id, "verify_email");
  const url = `${baseUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  await sendTransactionalEmail({
    to: user.email,
    userId: user.id,
    priority: user.emailProviderPriority,
    payload: {
      template: "verify_email",
      data: { name: user.name, url },
    },
  });
}

export async function sendPasswordResetEmail(user: User): Promise<void> {
  const token = await issueEmailToken(user.id, "reset_password");
  const url = `${baseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  await sendTransactionalEmail({
    to: user.email,
    userId: user.id,
    priority: user.emailProviderPriority,
    payload: {
      template: "reset_password",
      data: { name: user.name, url },
    },
  });
}

export async function sendPasswordChangedEmail(user: User): Promise<void> {
  try {
    await sendTransactionalEmail({
      to: user.email,
      userId: user.id,
      priority: user.emailProviderPriority,
      payload: {
        template: "password_changed",
        data: {
          name: user.name,
          when: formatDateTime(new Date(), user.timezone),
        },
      },
    });
  } catch (error) {
    logger.error("auth-email", "Password changed notice failed", error);
  }
}

export async function sendNewLoginEmail(
  user: User,
  userAgent: string,
): Promise<void> {
  if (!user.notifySecurity) return;
  try {
    await sendTransactionalEmail({
      to: user.email,
      userId: user.id,
      priority: user.emailProviderPriority,
      payload: {
        template: "new_login",
        data: {
          name: user.name,
          when: formatDateTime(new Date(), user.timezone),
          device: userAgent.slice(0, 140) || "Unknown device",
        },
      },
    });
  } catch (error) {
    logger.error("auth-email", "New login notice failed", error);
  }
}

export async function sendMfaEnabledEmail(
  user: Pick<User, "id" | "email" | "name" | "timezone" | "emailProviderPriority">,
  enabled: boolean,
): Promise<void> {
  try {
    await sendTransactionalEmail({
      to: user.email,
      userId: user.id,
      priority: user.emailProviderPriority,
      payload: {
        template: enabled ? "mfa_enabled" : "mfa_disabled",
        data: {
          name: user.name,
          when: formatDateTime(new Date(), user.timezone),
        },
      },
    });
  } catch (error) {
    logger.error("auth-email", "MFA state notice failed", error);
  }
}

export async function sendMfaResetEmail(
  user: Pick<User, "id" | "email" | "name" | "timezone" | "emailProviderPriority">,
  deviceName: string,
): Promise<void> {
  try {
    await sendTransactionalEmail({
      to: user.email,
      userId: user.id,
      priority: user.emailProviderPriority,
      payload: {
        template: "mfa_reset",
        data: {
          name: user.name,
          when: formatDateTime(new Date(), user.timezone),
          device: deviceName.slice(0, 80) || "A linked phone",
        },
      },
    });
  } catch (error) {
    logger.error("auth-email", "MFA reset notice failed", error);
  }
}
