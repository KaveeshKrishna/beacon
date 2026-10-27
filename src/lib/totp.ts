import "server-only";

import { createHmac, randomBytes } from "node:crypto";

import { safeEqual } from "@/lib/crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(input: string): Buffer {
  const normalized = input.replace(/=+$/g, "").toUpperCase().replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index === -1) throw new Error("Invalid base32 secret");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function generateTotpCode(secret: string, step: number): string {
  const key = base32Decode(secret);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return (binary % 1_000_000).toString().padStart(6, "0");
}

export function verifyTotp(
  secret: string,
  token: string,
  options: { window?: number; lastUsedStep?: number; now?: number } = {},
): { valid: boolean; step: number } {
  const now = options.now ?? Date.now();
  const window = options.window ?? 1;
  const normalized = token.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return { valid: false, step: 0 };

  const currentStep = Math.floor(now / 1000 / 30);
  for (let offset = -window; offset <= window; offset += 1) {
    const step = currentStep + offset;
    if (options.lastUsedStep && step <= options.lastUsedStep) continue;
    try {
      const expected = generateTotpCode(secret, step);
      if (safeEqual(normalized, expected)) {
        return { valid: true, step };
      }
    } catch {
      // A malformed stored secret must fail closed, not throw through the API.
      return { valid: false, step: 0 };
    }
  }
  return { valid: false, step: 0 };
}

export function totpUri(secret: string, email: string): string {
  const issuer = "Beacon";
  const label = `${issuer}:${email}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

export function currentTotpStep(now = Date.now()): number {
  return Math.floor(now / 1000 / 30);
}
