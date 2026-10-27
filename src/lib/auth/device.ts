import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { devices, users } from "@/db/schema";
import { ApiError } from "@/lib/api";
import { hashWithSecret, randomToken } from "@/lib/crypto";

const DEVICE_TOKEN_PREFIX = "bc_dev_";

export function hashDeviceToken(token: string): string {
  return hashWithSecret(`device-token:${token}`);
}

export function generateDeviceToken(): { token: string; tokenHash: string } {
  const token = `${DEVICE_TOKEN_PREFIX}${randomToken(32)}`;
  return { token, tokenHash: hashDeviceToken(token) };
}

export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [scheme, value] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !value) return null;
  return value.trim();
}

export type AuthenticatedDevice = typeof devices.$inferSelect;

/**
 * Device credentials are scoped to exactly one device row. There is no user
 * password on the tracking app, so a compromised phone cannot be used to take
 * over the account or enumerate other devices.
 */
export async function authenticateDevice(
  request: Request,
): Promise<AuthenticatedDevice> {
  const token = extractBearerToken(request);
  if (!token || !token.startsWith(DEVICE_TOKEN_PREFIX) || token.length > 128) {
    throw new ApiError(401, "unauthorized", "Invalid device credentials.");
  }

  const rows = await db()
    .select({ device: devices })
    .from(devices)
    .innerJoin(users, eq(users.id, devices.userId))
    .where(
      and(
        eq(devices.tokenHash, hashDeviceToken(token)),
        isNull(devices.revokedAt),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new ApiError(401, "unauthorized", "Invalid device credentials.");
  }
  return row.device;
}
