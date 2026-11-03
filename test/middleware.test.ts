import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { middleware } from "@/middleware";

/**
 * Next.js stores request-header overrides for the downstream route under this
 * internal prefix. Reading it from the middleware response verifies the value
 * the server layout will see without starting a real HTTP server.
 */
function forwardedPath(request: NextRequest): string | null {
  return middleware(request).headers.get("x-middleware-request-x-beacon-path");
}

describe("middleware", () => {
  it("records the real path and query for sign-in redirects", () => {
    const request = new NextRequest(
      "https://beacon.example.com/app/reconnect?challenge=abc&state=def&install=0123",
    );
    expect(forwardedPath(request)).toBe(
      "/app/reconnect?challenge=abc&state=def&install=0123",
    );
  });

  it("overrides a client-supplied x-beacon-path header", () => {
    const request = new NextRequest("https://beacon.example.com/app/settings", {
      headers: { "x-beacon-path": "https://evil.example/steal" },
    });
    expect(forwardedPath(request)).toBe("/app/settings");
  });

  it("keeps the forwarded path out of the response headers", () => {
    const request = new NextRequest(
      "https://beacon.example.com/app/reconnect?challenge=abc",
    );
    expect(middleware(request).headers.get("x-beacon-path")).toBeNull();
  });
});
