import "server-only";

import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { logger } from "@/lib/logger";

type AuditInput = {
  userId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  ipHash?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Audit entries deliberately store hashed IPs and no request bodies. Logging
 * must never become a secondary place where secrets or location history leak.
 */
export async function audit(input: AuditInput): Promise<void> {
  try {
    await db()
      .insert(auditLogs)
      .values({
        userId: input.userId ?? null,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        ipHash: input.ipHash ?? null,
        userAgent: input.userAgent ?? null,
        metadata: input.metadata ?? null,
      });
  } catch (error) {
    logger.error("audit", "Failed to write audit entry", error, {
      action: input.action,
    });
  }
}
