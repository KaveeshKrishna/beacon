import { describe, expect, it } from "vitest";

import {
  dummyPasswordVerify,
  hashPassword,
  passwordPolicyIssue,
  verifyPassword,
} from "@/lib/password";

describe("password policy", () => {
  it("accepts a long passphrase", () => {
    expect(
      passwordPolicyIssue("correct horse battery staple", "alex@example.com"),
    ).toBeNull();
  });

  it("requires at least 12 characters", () => {
    expect(passwordPolicyIssue("short pass", "alex@example.com")).toBe(
      "Use at least 12 characters.",
    );
  });

  it("rejects the email local part", () => {
    expect(
      passwordPolicyIssue("alexander-the-great-2026", "alexander@example.com"),
    ).toBe("Do not include your email address in the password.");
  });

  it("rejects common passwords and repetition", () => {
    expect(
      passwordPolicyIssue("my-password-is-long", "alex@example.com"),
    ).toBe("This password appears in common password lists.");
    expect(passwordPolicyIssue("aaaaaaaaaaaaaa", "alex@example.com")).toBe(
      "Choose a less repetitive password.",
    );
  });

  it("does not reject short email local parts as substrings", () => {
    expect(
      passwordPolicyIssue("they-call-me-al-2026", "al@example.com"),
    ).toBeNull();
  });
});

describe("Argon2id hashing", () => {
  it("hashes and verifies without storing the plaintext", async () => {
    const password = "beacon-test-passphrase-2026";
    const hash = await hashPassword(password);

    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(hash).not.toContain(password);
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("uses a unique salt for each hash", async () => {
    const first = await hashPassword("same-password-2026");
    const second = await hashPassword("same-password-2026");
    expect(first).not.toBe(second);
  });

  it("fails closed on a malformed hash", async () => {
    expect(await verifyPassword("password", "not-a-hash")).toBe(false);
  });

  it("burns work for unknown accounts without throwing", async () => {
    await expect(dummyPasswordVerify("anything-at-all")).resolves.toBeUndefined();
  });
});
