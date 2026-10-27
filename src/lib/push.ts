import "server-only";

import { createSign } from "node:crypto";

import { decryptSecret } from "@/lib/crypto";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

type CachedToken = { accessToken: string; expiresAt: number };
let cachedToken: CachedToken | null = null;

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function normalizePrivateKey(key: string): string {
  return key.replace(/\\n/g, "\n").trim();
}

async function getAccessToken(): Promise<string | null> {
  const env = getEnv();
  if (!env.FCM_PROJECT_ID || !env.FCM_CLIENT_EMAIL || !env.FCM_PRIVATE_KEY) {
    return null;
  }

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.accessToken;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: env.FCM_CLIENT_EMAIL,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );

  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  signer.end();
  const signature = signer.sign(normalizePrivateKey(env.FCM_PRIVATE_KEY), "base64url");
  const assertion = `${header}.${claims}.${signature}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });

  if (!response.ok) {
    logger.error("push", "FCM OAuth token exchange failed", {
      status: response.status,
    });
    return null;
  }

  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) return null;

  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return cachedToken.accessToken;
}

export async function sendPushToDevice(input: {
  deviceId: string;
  fcmTokenEnc: string | null;
  commandId: string;
  type: string;
}): Promise<boolean> {
  const env = getEnv();
  if (!env.FCM_PROJECT_ID || !input.fcmTokenEnc) return false;

  try {
    const accessToken = await getAccessToken();
    if (!accessToken) return false;
    const token = decryptSecret(input.fcmTokenEnc, `fcm:${input.deviceId}`);

    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${env.FCM_PROJECT_ID}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token,
            data: {
              type: "command",
              commandId: input.commandId,
              commandType: input.type,
            },
            android: {
              priority: "high",
              ttl: "3600s",
            },
          },
        }),
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      // Do not log the response body: FCM error details can echo the
      // registration token, which is a bearer-like credential.
      logger.warn("push", "FCM send failed", {
        status: response.status,
      });
      return false;
    }
    return true;
  } catch (error) {
    logger.error("push", "FCM send threw", error);
    return false;
  }
}
