import { describe, expect, it } from "vitest";

import {
  decryptSecret,
  encryptSecret,
  generatePairingCode,
  generateRecoveryCode,
  hashIp,
  hashWithSecret,
  maskEmail,
  normalizePairingCode,
  normalizeRecoveryCode,
  randomCode,
  randomToken,
  safeEqual,
  stripControlCharacters,
  truncateUserAgent,
} from "@/lib/crypto";

describe("field encryption", () => {
  it("round-trips a secret with its context", () => {
    const ciphertext = encryptSecret("JBSWY3DPEHPK3PXP", "totp:user-1");
    expect(ciphertext).not.toContain("JBSWY3DPEHPK3PXP");
    expect(ciphertext.startsWith("v1.")).toBe(true);
    expect(decryptSecret(ciphertext, "totp:user-1")).toBe("JBSWY3DPEHPK3PXP");
  });

  it("does not decrypt with a different context", () => {
    const ciphertext = encryptSecret("sensitive", "totp:user-1");
    expect(() => decryptSecret(ciphertext, "totp:user-2")).toThrow();
  });

  it("detects tampering", () => {
    const ciphertext = encryptSecret("sensitive", "sms:user-1");
    const parts = ciphertext.split(".");
    parts[2] = `${parts[2]?.slice(0, -2)}AA`;
    expect(() => decryptSecret(parts.join("."), "sms:user-1")).toThrow();
  });

  it("rejects malformed payloads", () => {
    expect(() => decryptSecret("not-a-payload", "context")).toThrow(
      "Malformed encrypted value",
    );
  });

  it("uses a fresh nonce each time", () => {
    const first = encryptSecret("same", "context");
    const second = encryptSecret("same", "context");
    expect(first).not.toBe(second);
  });
});

describe("tokens and codes", () => {
  it("creates URL-safe random tokens with the requested entropy", () => {
    const token = randomToken(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken(32)).not.toBe(token);
  });

  it("creates numeric codes with the requested width", () => {
    for (let index = 0; index < 20; index += 1) {
      expect(randomCode(6)).toMatch(/^\d{6}$/);
    }
  });

  it("formats pairing codes without ambiguous characters", () => {
    for (let index = 0; index < 20; index += 1) {
      const code = generatePairingCode();
      expect(code.display).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
      expect(code.normalized).toBe(code.display.replace("-", ""));
      expect(normalizePairingCode(` ${code.display.toLowerCase()} `)).toBe(
        code.normalized,
      );
    }
  });

  it("formats and normalizes recovery codes", () => {
    const code = generateRecoveryCode();
    expect(code.display).toMatch(/^[a-hj-km-np-z2-9]{5}-[a-hj-km-np-z2-9]{5}$/);
    expect(normalizeRecoveryCode(code.display.toUpperCase())).toBe(
      code.normalized,
    );
  });

  it("compares secrets without leaking length errors", () => {
    expect(safeEqual("abcdef", "abcdef")).toBe(true);
    expect(safeEqual("abcdef", "abcdeg")).toBe(false);
    expect(safeEqual("short", "longer")).toBe(false);
  });

  it("hashes IPs deterministically and distinctly", () => {
    expect(hashIp("203.0.113.5")).toBe(hashIp("203.0.113.5"));
    expect(hashIp("203.0.113.5")).not.toBe(hashIp("203.0.113.6"));
    expect(hashWithSecret("session:token")).toHaveLength(64);
  });
});

describe("input helpers", () => {
  it("masks the local part of an email", () => {
    const masked = maskEmail("alex@example.com");
    expect(masked.endsWith("@example.com")).toBe(true);
    expect(masked).not.toContain("alex");
  });

  it("strips control characters and enforces a maximum length", () => {
    expect(stripControlCharacters("  hello\u0000world\u001f  ", 50)).toBe(
      "helloworld",
    );
    expect(stripControlCharacters("abcdefgh", 4)).toBe("abcd");
  });

  it("truncates user agents to the column budget", () => {
    expect(truncateUserAgent("x".repeat(400))).toHaveLength(255);
    expect(truncateUserAgent(null)).toBe("");
  });
});
