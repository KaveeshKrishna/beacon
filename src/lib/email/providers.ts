import "server-only";

import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

export type EmailProviderName = "relay" | "resend";

export type EmailProvider = {
  name: EmailProviderName;
  configured: boolean;
  from: string;
};

type SendInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

type SendResult = {
  provider: EmailProviderName;
  messageId: string;
};

export class ProviderError extends Error {
  provider: EmailProviderName;
  status: number;
  retryable: boolean;

  constructor(
    provider: EmailProviderName,
    message: string,
    options: { status: number; retryable: boolean },
  ) {
    super(message);
    this.name = "ProviderError";
    this.provider = provider;
    this.status = options.status;
    this.retryable = options.retryable;
  }
}

export function listProviders(): EmailProvider[] {
  const env = getEnv();
  const fallbackFrom = env.EMAIL_FROM;
  return [
    {
      name: "relay",
      configured: Boolean(env.RELAY_API_BASE_URL && env.RELAY_API_KEY),
      from: env.RELAY_FROM || fallbackFrom,
    },
    {
      name: "resend",
      configured: Boolean(env.RESEND_API_KEY),
      from: env.RESEND_FROM || fallbackFrom,
    },
  ];
}

export function providerConfigured(name: EmailProviderName): boolean {
  return listProviders().some(
    (provider) => provider.name === name && provider.configured,
  );
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 400);
  } catch {
    return "";
  }
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function sendViaRelay(
  input: SendInput,
  from: string,
): Promise<SendResult> {
  const env = getEnv();
  const response = await fetch(
    `${env.RELAY_API_BASE_URL!.replace(/\/$/, "")}/api/v1/send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RELAY_API_KEY!}`,
        "Content-Type": "application/json",
        "User-Agent": "Beacon/1.0",
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
        ...(env.EMAIL_REPLY_TO ? { replyTo: env.EMAIL_REPLY_TO } : {}),
      }),
      signal: AbortSignal.timeout(env.EMAIL_TIMEOUT_MS),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new ProviderError("relay", `Relay rejected the message: ${body}`, {
      status: response.status,
      retryable: retryableStatus(response.status),
    });
  }

  const data = (await response.json().catch(() => ({}))) as {
    messageId?: string;
  };
  return { provider: "relay", messageId: data.messageId ?? "accepted" };
}

async function sendViaResend(
  input: SendInput,
  from: string,
): Promise<SendResult> {
  const env = getEnv();
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY!}`,
      "Content-Type": "application/json",
      "User-Agent": "Beacon/1.0",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
      ...(env.EMAIL_REPLY_TO ? { reply_to: env.EMAIL_REPLY_TO } : {}),
    }),
    signal: AbortSignal.timeout(env.EMAIL_TIMEOUT_MS),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new ProviderError("resend", `Resend rejected the message: ${body}`, {
      status: response.status,
      retryable: retryableStatus(response.status),
    });
  }

  const data = (await response.json().catch(() => ({}))) as { id?: string };
  return { provider: "resend", messageId: data.id ?? "accepted" };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function attemptProvider(
  provider: EmailProvider,
  input: SendInput,
): Promise<SendResult> {
  const attempts = 2;
  let lastError: ProviderError | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      if (provider.name === "relay") {
        return await sendViaRelay(input, provider.from);
      }
      return await sendViaResend(input, provider.from);
    } catch (error) {
      const providerError =
        error instanceof ProviderError
          ? error
          : new ProviderError(
              provider.name,
              error instanceof Error ? error.message : "Network failure",
              { status: 0, retryable: true },
            );
      lastError = providerError;
      if (!providerError.retryable || attempt === attempts) break;
      logger.warn("email", "Retrying provider after transient failure", {
        provider: provider.name,
        attempt,
        status: providerError.status,
      });
      await delay(300 * attempt);
    }
  }

  throw lastError ?? new Error("Provider failed without an error");
}
