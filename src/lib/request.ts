import "server-only";

import { isIP } from "node:net";
import type { NextRequest } from "next/server";

import { ApiError } from "@/lib/api";
import { hashIp } from "@/lib/crypto";
import { allowedOrigins, getEnv } from "@/lib/env";

/**
 * Keep only syntactically valid addresses. Forwarded headers are user input
 * until a trusted proxy has rewritten them, so reject ports, zones and garbage
 * instead of hashing an attacker-controlled unbounded string.
 */
function normalizeIp(value: string | null | undefined): string | null {
  if (!value) return null;
  let candidate = value.trim();
  if (candidate.startsWith("[")) {
    const end = candidate.indexOf("]");
    if (end !== -1) candidate = candidate.slice(1, end);
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(candidate)) {
    candidate = candidate.slice(0, candidate.lastIndexOf(":"));
  }
  return isIP(candidate) ? candidate : null;
}

/**
 * Resolve the client address used for rate limiting and audit hashes.
 *
 * A client can send X-Forwarded-For to almost any origin, so it is ignored
 * unless the deployment explicitly says a trusted proxy rewrites it. On Vercel
 * the edge sets the headers and VERCEL=1 is always present.
 */
export function clientIp(request: NextRequest | Request): string {
  const headers = request.headers;

  if (getEnv().TRUSTED_PROXY === "vercel" && process.env.VERCEL === "1") {
    const real = normalizeIp(headers.get("x-real-ip"));
    if (real) return real;

    // Vercel appends the address it observed; the last hop is authoritative
    // even if a client supplied a forged prefix.
    const forwarded = headers.get("x-forwarded-for");
    const last = normalizeIp(forwarded?.split(",").at(-1));
    if (last) return last;
  }

  if (getEnv().TRUSTED_PROXY === "forwarded") {
    const forwarded = headers.get("x-forwarded-for");
    const last = normalizeIp(forwarded?.split(",").at(-1));
    if (last) return last;

    // Some proxies only set X-Real-IP. This mode assumes that proxy overwrites
    // it, which is the documented self-host configuration.
    const real = normalizeIp(headers.get("x-real-ip"));
    if (real) return real;
  }

  // Direct deployments have no trustworthy peer header available in the
  // framework. Sharing one bucket is safer than letting clients mint new keys.
  return "0.0.0.0";
}

export function requestContext(request: NextRequest | Request) {
  const ip = clientIp(request);
  return {
    ip,
    ipHash: hashIp(ip),
    userAgent: (request.headers.get("user-agent") ?? "").slice(0, 255),
  };
}

/**
 * Origin validation is the primary CSRF defence for cookie-authenticated
 * mutations. SameSite=Lax cookies are a second layer. Bearer-authenticated
 * device endpoints do not call this function.
 */
export function assertTrustedOrigin(request: NextRequest | Request): void {
  const origin = request.headers.get("origin");
  if (!origin) {
    throw new ApiError(
      403,
      "origin_required",
      "This request must include an Origin header.",
    );
  }

  let normalized: string;
  try {
    normalized = new URL(origin).origin;
  } catch {
    throw new ApiError(403, "origin_rejected", "Request origin was rejected.");
  }

  if (!allowedOrigins().includes(normalized)) {
    throw new ApiError(403, "origin_rejected", "Request origin was rejected.");
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "none"].includes(fetchSite)) {
    throw new ApiError(403, "origin_rejected", "Cross-site request rejected.");
  }
}

/**
 * For safe GET downloads that are triggered by a top-level navigation and
 * therefore do not carry an Origin header. Cross-site navigations still carry
 * Sec-Fetch-Site, so they can be refused without breaking same-origin links.
 */
export function assertSameSiteNavigation(request: NextRequest | Request): void {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    throw new ApiError(403, "origin_rejected", "Cross-site request rejected.");
  }
}
