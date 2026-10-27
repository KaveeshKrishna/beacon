import type { NextRequest } from "next/server";
import { and, eq, lt, or } from "drizzle-orm";

import { db } from "@/db";
import {
  auditLogs,
  commands,
  devicePhotos,
  emailCodes,
  emailLogs,
  emailTokens,
  geofenceEvents,
  locations,
  pairingCodes,
  pendingMfa,
  rateLimits,
  sessions,
} from "@/db/schema";
import {
  ApiError,
  assertMethod,
  errorResponse,
  ok,
} from "@/lib/api";
import { sendOfflineAlerts } from "@/lib/notifications";
import { safeEqual } from "@/lib/crypto";
import { getEnv } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorize(request: NextRequest): void {
  const env = getEnv();
  if (!env.CRON_SECRET) {
    throw new ApiError(503, "cron_disabled", "Cron is not configured.");
  }
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !safeEqual(token, env.CRON_SECRET)) {
    throw new ApiError(401, "unauthorized", "Invalid cron credentials.");
  }
}

async function deleteExpired(): Promise<void> {
  const env = getEnv();
  const now = new Date();
  const locationCutoff = new Date(
    now.getTime() - env.LOCATION_RETENTION_DAYS * 86_400_000,
  );
  const auditCutoff = new Date(
    now.getTime() - env.AUDIT_RETENTION_DAYS * 86_400_000,
  );
  const emailLogCutoff = new Date(now.getTime() - 90 * 86_400_000);
  const eventCutoff = new Date(now.getTime() - 180 * 86_400_000);
  const sessionCutoff = new Date(now.getTime() - 30 * 86_400_000);
  const rateCutoff = new Date(now.getTime() - 2 * 86_400_000);
  const photoCutoff = new Date(now.getTime() - 30 * 86_400_000);

  await Promise.all([
    db()
      .delete(sessions)
      .where(
        or(lt(sessions.expiresAt, now), lt(sessions.revokedAt, sessionCutoff)),
      ),
    db().delete(pendingMfa).where(lt(pendingMfa.expiresAt, now)),
    db()
      .delete(emailTokens)
      .where(
        or(
          lt(emailTokens.expiresAt, now),
          lt(emailTokens.usedAt, sessionCutoff),
        ),
      ),
    db().delete(emailCodes).where(lt(emailCodes.expiresAt, now)),
    db()
      .delete(pairingCodes)
      .where(
        or(lt(pairingCodes.expiresAt, now), lt(pairingCodes.usedAt, sessionCutoff)),
      ),
    db().delete(rateLimits).where(lt(rateLimits.windowStart, rateCutoff)),
    db().delete(emailLogs).where(lt(emailLogs.createdAt, emailLogCutoff)),
    db()
      .delete(geofenceEvents)
      .where(lt(geofenceEvents.occurredAt, eventCutoff)),
    db().delete(auditLogs).where(lt(auditLogs.createdAt, auditCutoff)),
    db().delete(devicePhotos).where(lt(devicePhotos.createdAt, photoCutoff)),
  ]);

  await db()
    .update(commands)
    .set({ status: "expired", completedAt: now })
    .where(
      and(
        lt(commands.expiresAt, now),
        or(
          eq(commands.status, "pending"),
          eq(commands.status, "delivered"),
        ),
      ),
    );

  await db().delete(locations).where(lt(locations.recordedAt, locationCutoff));
}

export async function GET(request: NextRequest) {
  try {
    assertMethod(request, ["GET"]);
    authorize(request);
    await deleteExpired();
    const alertsSent = await sendOfflineAlerts();

    return ok({
      ranAt: new Date().toISOString(),
      alertsSent,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}

export const dynamic = "force-dynamic";
