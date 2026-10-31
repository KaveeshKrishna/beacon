import { describe, expect, it } from "vitest";

import {
  isPkceChallenge,
  isPkceVerifier,
  pkceChallengeS256,
  verifyPkceS256,
} from "@/lib/pkce";

// RFC 7636 appendix B.
const RFC_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const RFC_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

describe("PKCE S256", () => {
  it("derives the RFC 7636 challenge", () => {
    expect(pkceChallengeS256(RFC_VERIFIER)).toBe(RFC_CHALLENGE);
  });

  it("accepts a matching verifier and challenge", () => {
    expect(verifyPkceS256(RFC_VERIFIER, RFC_CHALLENGE)).toBe(true);
  });

  it("rejects a verifier that does not match the challenge", () => {
    const other = "a".repeat(43);
    expect(verifyPkceS256(other, RFC_CHALLENGE)).toBe(false);
  });

  it("rejects malformed verifiers before hashing", () => {
    expect(isPkceVerifier("short")).toBe(false);
    expect(isPkceVerifier(`${"a".repeat(42)}!`)).toBe(false);
    expect(isPkceVerifier(`${"a".repeat(129)}`)).toBe(false);
    expect(verifyPkceS256("short", RFC_CHALLENGE)).toBe(false);
  });

  it("rejects malformed challenges", () => {
    expect(isPkceChallenge("too-short")).toBe(false);
    expect(isPkceChallenge(`${"a".repeat(42)}=`)).toBe(false);
    expect(isPkceChallenge(`${"a".repeat(44)}`)).toBe(false);
    expect(verifyPkceS256(RFC_VERIFIER, "not-a-challenge")).toBe(false);
  });

  it("accepts the documented alphabet at the edges", () => {
    expect(isPkceVerifier("A".repeat(43))).toBe(true);
    expect(isPkceVerifier("-._~" + "A".repeat(39))).toBe(true);
    expect(isPkceVerifier("A".repeat(128))).toBe(true);
    expect(isPkceChallenge("A".repeat(43))).toBe(true);
  });
});
