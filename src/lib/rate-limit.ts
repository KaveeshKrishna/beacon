import "server-only";

import { and, eq, lt, sql } from "drizzle-orm";

import { db } from "@/db";
import { rateLimits } from "@/db/schema";
import { ApiError } from "@/lib/api";
import { hashWithSecret } from "@/lib/crypto";
import { logger } from "@/lib/logger";

type RateLimitOptions = {
  /** Human-readable namespace, e.g. "login". */
  bucket: string;
  /** Stable identifier — hash it before passing if it contains PII. */
  identifier: string;
  limit: number;
  windowSec: number;
};

export type RateLimitResult = {
  remaining: number;
  resetAt: Date;
};

export function rateLimitKey(bucket: string, identifier: string): string {
  return `${bucket}:${hashWithSecret(identifier)}`;
}

/**
 * Fixed-window limiter backed by Postgres. The upsert is atomic, so concurrent
 * serverless invocations cannot race past the limit.
 */
export async function consumeRateLimit(
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  const { bucket, identifier, limit, windowSec } = options;
  const key = rateLimitKey(bucket, identifier);
  const windowMs = windowSec * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);

  try {
    const rows = await db()
      .insert(rateLimits)
      .values({ key, windowStart, count: 1 })
      .onConflictDoUpdate({
        target: [rateLimits.key, rateLimits.windowStart],
        set: { count: sql`${rateLimits.count} + 1` },
      })
      .returning({ count: rateLimits.count });

    const count = rows[0]?.count ?? 1;
    const resetAt = new Date(windowStart.getTime() + windowMs);
    return {
      remaining: Math.max(0, limit - count),
      resetAt,
    };
  } catch (error) {
    // Fail closed. During a database incident every authenticated action would
    // fail anyway, and silently switching the limiter off would turn an outage
    // into an unlimited password-guessing window.
    logger.error("rate-limit", "Limiter write failed", error, { bucket });
    throw new ApiError(
      503,
      "rate_limit_unavailable",
      "The service is temporarily unavailable. Try again shortly.",
    );
  }
}

export async function enforceRateLimit(
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  const result = await consumeRateLimit(options);
  const key = rateLimitKey(options.bucket, options.identifier);
  const windowMs = options.windowSec * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);

  if (result.remaining === 0) {
    // Re-read so a request that legitimately hits the limit gets an accurate
    // retry hint. The count includes this request.
    const rows = await db()
      .select({ count: rateLimits.count })
      .from(rateLimits)
      .where(and(eq(rateLimits.key, key), eq(rateLimits.windowStart, windowStart)))
      .limit(1);
    const count = rows[0]?.count ?? options.limit + 1;
    if (count > options.limit) {
      const retryAfter = Math.max(
        1,
        Math.ceil((windowStart.getTime() + windowMs - Date.now()) / 1000),
      );
      throw new ApiError(
        429,
        "rate_limited",
        "Too many requests. Try again shortly.",
        { headers: { "Retry-After": String(retryAfter) } },
      );
    }
  }

  return result;
}

export async function cleanupRateLimits(olderThanDays = 2): Promise<void> {
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);
  await db().delete(rateLimits).where(lt(rateLimits.windowStart, cutoff));
}
