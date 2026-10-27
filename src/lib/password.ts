import "server-only";

import { argon2id, argon2Verify } from "hash-wasm";

/**
 * OWASP Password Storage Cheat Sheet (Argon2id):
 * 19 MiB memory, 2 iterations, parallelism 1.
 */
const ARGON2_OPTIONS = {
  memorySize: 19456,
  iterations: 2,
  parallelism: 1,
  hashLength: 32,
  outputType: "encoded" as const,
};

let dummyHashPromise: Promise<string> | null = null;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return argon2id({ password, salt, ...ARGON2_OPTIONS });
}

export async function verifyPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  try {
    return await argon2Verify({ password, hash: encodedHash });
  } catch {
    return false;
  }
}

/**
 * Burn a comparable amount of CPU when the account does not exist, so login
 * response timing does not reveal whether an email is registered.
 */
export async function dummyPasswordVerify(password: string): Promise<void> {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword("beacon-timing-equalizer-not-a-password");
  }
  const hash = await dummyHashPromise;
  await verifyPassword(password, hash);
}

export function passwordPolicyIssue(
  password: string,
  email: string,
): string | null {
  if (password.length < 12) {
    return "Use at least 12 characters.";
  }
  if (password.length > 128) {
    return "Use 128 characters or fewer.";
  }
  const localPart = email.split("@")[0]?.toLowerCase();
  if (localPart && localPart.length >= 4 && password.toLowerCase().includes(localPart)) {
    return "Do not include your email address in the password.";
  }
  if (/^(.)\1+$/.test(password)) {
    return "Choose a less repetitive password.";
  }
  const common = [
    "password",
    "qwerty",
    "letmein",
    "welcome",
    "admin",
    "iloveyou",
    "monkey",
    "dragon",
    "beacon123",
  ];
  const lower = password.toLowerCase();
  if (common.some((entry) => lower.includes(entry))) {
    return "This password appears in common password lists.";
  }
  return null;
}

/**
 * Have I Been Pwned k-anonymity check. Only a five-character SHA-1 prefix
 * leaves the server. Fail-open: a network outage must not block signup.
 */
export async function isPasswordBreached(password: string): Promise<boolean> {
  try {
    const digest = await crypto.subtle.digest(
      "SHA-1",
      new TextEncoder().encode(password),
    );
    const hash = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    const response = await fetch(
      `https://api.pwnedpasswords.com/range/${prefix}`,
      {
        headers: { "Add-Padding": "true", "User-Agent": "Beacon-Password-Check" },
        signal: AbortSignal.timeout(4000),
        cache: "no-store",
      },
    );
    if (!response.ok) return false;
    const body = await response.text();
    return body
      .split("\n")
      .some((line) => line.split(":")[0]?.trim() === suffix);
  } catch {
    return false;
  }
}
