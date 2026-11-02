import { describe, expect, it } from "vitest";

import { safeNextPath } from "@/lib/safe-path";

describe("safeNextPath", () => {
  it("accepts a same-origin absolute path", () => {
    expect(safeNextPath("/app/reconnect?state=abc&install=def")).toBe(
      "/app/reconnect?state=abc&install=def",
    );
  });

  it("preserves a hash without letting it change the origin", () => {
    expect(safeNextPath("/app/settings#security")).toBe("/app/settings#security");
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(safeNextPath("https://evil.example/app")).toBeNull();
    expect(safeNextPath("//evil.example/app")).toBeNull();
    expect(safeNextPath("javascript:alert(1)")).toBeNull();
  });

  it("rejects backslash tricks and empty values", () => {
    expect(safeNextPath("/\\evil.example")).toBeNull();
    expect(safeNextPath("")).toBeNull();
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
  });

  it("rejects an unreasonably long path", () => {
    expect(safeNextPath(`/${"a".repeat(2048)}`)).toBeNull();
  });
});
