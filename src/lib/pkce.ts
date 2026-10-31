import { createHash, timingSafeEqual } from "node:crypto";

/**
 * PKCE S256 helpers (RFC 7636).
 *
 * The Android app generates a high-entropy verifier, keeps it on the phone and
 * sends only the SHA-256 challenge through the browser. An app that intercepts
 * the custom-scheme callback still cannot exchange the code without the
 * verifier. This module is deliberately free of server-only imports so the
 * exact hashing behaviour can be unit tested.
 */

const VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/;
const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isPkceVerifier(value: string): boolean {
  return VERIFIER_PATTERN.test(value);
}

export function isPkceChallenge(value: string): boolean {
  return CHALLENGE_PATTERN.test(value);
}

export function pkceChallengeS256(verifier: string): string {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

export function verifyPkceS256(verifier: string, challenge: string): boolean {
  if (!isPkceVerifier(verifier) || !isPkceChallenge(challenge)) return false;
  const computed = Buffer.from(pkceChallengeS256(verifier), "ascii");
  const supplied = Buffer.from(challenge, "ascii");
  if (computed.length !== supplied.length) return false;
  return timingSafeEqual(computed, supplied);
}
