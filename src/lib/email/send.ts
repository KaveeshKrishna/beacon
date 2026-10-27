import "server-only";

import { db } from "@/db";
import { emailLogs } from "@/db/schema";
import { getEnv, isProduction } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { EmailProviderPriority } from "@/lib/constants";
import {
  attemptProvider,
  listProviders,
  type EmailProvider,
  type EmailProviderName,
} from "@/lib/email/providers";
import { renderEmail, type EmailPayload } from "@/lib/email/templates";

export function resolveProviderOrder(
  priority: EmailProviderPriority,
  providers: EmailProvider[],
  defaultPriority: EmailProviderPriority,
): EmailProvider[] {
  const configured = providers.filter((provider) => provider.configured);
  const effective = priority === "default" ? defaultPriority : priority;

  const relay = configured.find((provider) => provider.name === "relay");
  const resend = configured.find((provider) => provider.name === "resend");

  switch (effective) {
    case "relay_only":
      return relay ? [relay] : [];
    case "resend_only":
      return resend ? [resend] : [];
    case "resend_first":
      return [resend, relay].filter(Boolean) as EmailProvider[];
    case "relay_first":
    case "default":
    default:
      return [relay, resend].filter(Boolean) as EmailProvider[];
  }
}

async function logAttempt(input: {
  userId?: string | null;
  to: string;
  template: EmailPayload["template"];
  provider: string;
  status: "sent" | "failed";
  messageId?: string;
  errorCode?: string;
  errorMessage?: string;
  latencyMs?: number;
}): Promise<void> {
  try {
    await db()
      .insert(emailLogs)
      .values({
        userId: input.userId ?? null,
        toEmail: input.to,
        template: input.template,
        provider: input.provider,
        status: input.status,
        providerMessageId: input.messageId ?? null,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage?.slice(0, 500) ?? null,
        latencyMs: input.latencyMs ?? null,
      });
  } catch (error) {
    logger.warn("email", "Could not write email delivery log", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export type SendEmailOptions = {
  to: string;
  userId?: string | null;
  payload: EmailPayload;
  priority?: string;
  /** Skip provider fallback to test one specific provider. */
  forceProvider?: EmailProviderName;
};

export type SendEmailResult = {
  provider: EmailProviderName;
  messageId: string;
  subject: string;
};

export async function sendTransactionalEmail(
  options: SendEmailOptions,
): Promise<SendEmailResult> {
  const env = getEnv();
  const rendered = renderEmail(options.payload);
  // Email APIs take structured JSON, but providers still assemble RFC 5322
  // headers from `subject`. User-controlled device and geofence names must not
  // be able to inject a newline and a second header.
  const subject = rendered.subject
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .trim()
    .slice(0, 200);
  const priority = (
    options.priority ?? "default"
  ) as EmailProviderPriority;
  const providers = listProviders();
  let order = resolveProviderOrder(
    priority,
    providers,
    env.EMAIL_PROVIDER_PRIORITY,
  );
  if (options.forceProvider) {
    order = order.filter((provider) => provider.name === options.forceProvider);
  }

  if (order.length === 0) {
    if (!isProduction() && env.EMAIL_DEV_LOG) {
      logger.info("email", "Development email (no provider configured)", {
        to: options.to,
        subject,
        template: options.payload.template,
      });
      return {
        provider: "relay",
        messageId: "dev-log",
        subject,
      };
    }
    throw new Error(
      "No email provider is configured. Set Relay or Resend credentials.",
    );
  }

  let lastError: unknown = null;

  for (const provider of order) {
    const startedAt = Date.now();
    try {
      const result = await attemptProvider(provider, {
        to: options.to,
        subject,
        text: rendered.text,
        html: rendered.html,
      });
      await logAttempt({
        userId: options.userId,
        to: options.to,
        template: options.payload.template,
        provider: result.provider,
        status: "sent",
        messageId: result.messageId,
        latencyMs: Date.now() - startedAt,
      });
      return {
        provider: result.provider,
        messageId: result.messageId,
        subject,
      };
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      logger.error("email", "Provider delivery failed", error, {
        provider: provider.name,
        template: options.payload.template,
      });
      await logAttempt({
        userId: options.userId,
        to: options.to,
        template: options.payload.template,
        provider: provider.name,
        status: "failed",
        errorCode:
          error instanceof Error && "status" in error
            ? String((error as { status?: number }).status ?? "")
            : "network",
        errorMessage: message,
        latencyMs: Date.now() - startedAt,
      });
      if (order.length > 1) {
        logger.warn("email", "Falling back to the next email provider", {
          failed: provider.name,
          next: order.find((item) => item.name !== provider.name)?.name,
        });
      }
    }
  }

  throw lastError ?? new Error("All configured email providers failed");
}

export function emailProviderSummary() {
  const env = getEnv();
  const providers = listProviders();
  return {
    providers: providers.map((provider) => ({
      name: provider.name,
      configured: provider.configured,
      from: provider.from,
    })),
    defaultPriority: env.EMAIL_PROVIDER_PRIORITY,
  };
}
