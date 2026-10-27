import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

import { getEnv } from "@/lib/env";

const PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function randomHex(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

export function randomCode(digits = 6): string {
  return randomInt(0, 10 ** digits)
    .toString()
    .padStart(digits, "0");
}

export function randomFromAlphabet(length: number, alphabet: string): string {
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += alphabet[randomInt(0, alphabet.length)];
  }
  return result;
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hmacHex(value: string, key?: string): string {
  return createHmac("sha256", key ?? getEnv().AUTH_SECRET)
    .update(value, "utf8")
    .digest("hex");
}

export function hashWithSecret(value: string): string {
  return hmacHex(value);
}

export function hashIp(ip: string): string {
  return hmacHex(`ip:${ip}`, getEnv().AUTH_SECRET);
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function normalizePairingCode(input: string): string {
  return input.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export function generatePairingCode(): { display: string; normalized: string } {
  const raw = randomFromAlphabet(8, PAIRING_ALPHABET);
  return {
    display: `${raw.slice(0, 4)}-${raw.slice(4)}`,
    normalized: raw,
  };
}

export function generateRecoveryCode(): { display: string; normalized: string } {
  const raw = randomFromAlphabet(10, RECOVERY_ALPHABET);
  return {
    display: `${raw.slice(0, 5)}-${raw.slice(5)}`,
    normalized: raw,
  };
}

export function normalizeRecoveryCode(input: string): string {
  return input.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function encryptionKey(): Buffer {
  return Buffer.from(getEnv().ENCRYPTION_KEY, "base64");
}

/**
 * AES-256-GCM with a context-bound AAD. A ciphertext produced for one field
 * cannot be moved to another field without failing authentication.
 */
export function encryptSecret(plaintext: string, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

export function decryptSecret(payload: string, context: string): string {
  return decryptBuffer(payload, context).toString("utf8");
}

/** Binary variant used for encrypted evidence photos. */
export function encryptBuffer(data: Buffer, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

export function decryptBuffer(payload: string, context: string): Buffer {
  const [version, ivPart, ciphertextPart, tagPart] = payload.split(".");
  if (version !== "v1" || !ivPart || !ciphertextPart || !tagPart) {
    throw new Error("Malformed encrypted value");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivPart, "base64url"),
  );
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, "base64url")),
    decipher.final(),
  ]);
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "•••";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"•".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function stripControlCharacters(value: string, maxLength: number): string {
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return cleaned.slice(0, maxLength);
}

export function truncateUserAgent(value: string | null): string {
  return (value ?? "").slice(0, 255);
}
