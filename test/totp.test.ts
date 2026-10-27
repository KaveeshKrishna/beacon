import { describe, expect, it } from "vitest";

import {
  currentTotpStep,
  generateTotpCode,
  generateTotpSecret,
  totpUri,
  verifyTotp,
} from "@/lib/totp";

const NOW = 1_700_000_000_000;
const STEP_MS = 30_000;

describe("TOTP", () => {
  it("generates a base32 secret of 160 bits", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(generateTotpSecret()).not.toBe(secret);
  });

  it("matches known HOTP vectors for a fixed secret and counter", () => {
    // Base32 of "12345678901234567890" (the RFC 4226 test key).
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    expect(generateTotpCode(secret, 1)).toBe("287082");
    expect(
      verifyTotp(secret, "287082", { now: 59_000, window: 0 }).valid,
    ).toBe(true);
  });

  it("accepts a code in the current step", () => {
    const secret = generateTotpSecret();
    const step = Math.floor(NOW / 1000 / 30);
    const code = generateTotpCode(secret, step);
    expect(verifyTotp(secret, code, { now: NOW })).toEqual({
      valid: true,
      step,
    });
    expect(currentTotpStep(NOW)).toBe(step);
  });

  it("accepts one step of drift and rejects older codes", () => {
    const secret = generateTotpSecret();
    const step = Math.floor(NOW / 1000 / 30);
    const previous = generateTotpCode(secret, step - 1);
    const next = generateTotpCode(secret, step + 1);

    expect(verifyTotp(secret, previous, { now: NOW }).valid).toBe(true);
    expect(verifyTotp(secret, next, { now: NOW, window: 0 }).valid).toBe(false);
    expect(verifyTotp(secret, next, { now: NOW + STEP_MS }).valid).toBe(true);
  });

  it("rejects replayed steps", () => {
    const secret = generateTotpSecret();
    const step = Math.floor(NOW / 1000 / 30);
    const code = generateTotpCode(secret, step);
    expect(
      verifyTotp(secret, code, { now: NOW, lastUsedStep: step }).valid,
    ).toBe(false);
  });

  it("tolerates formatting whitespace but rejects bad input", () => {
    const secret = generateTotpSecret();
    const step = Math.floor(NOW / 1000 / 30);
    const code = generateTotpCode(secret, step);
    expect(verifyTotp(secret, `${code.slice(0, 3)} ${code.slice(3)}`, { now: NOW }).valid).toBe(true);
    expect(verifyTotp(secret, "12345", { now: NOW }).valid).toBe(false);
    expect(verifyTotp(secret, "abcdef", { now: NOW }).valid).toBe(false);
    expect(verifyTotp("not-base32!", "123456", { now: NOW }).valid).toBe(false);
  });

  it("builds an otpauth URI with issuer and algorithm", () => {
    const uri = totpUri("JBSWY3DPEHPK3PXP", "alex+beacon@example.com");
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(uri).toContain("issuer=Beacon");
    expect(uri).toContain("algorithm=SHA1");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });
});
