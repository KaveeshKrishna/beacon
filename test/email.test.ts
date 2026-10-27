import { describe, expect, it } from "vitest";

import { resolveProviderOrder } from "@/lib/email/send";
import type {
  EmailProvider,
  EmailProviderName,
} from "@/lib/email/providers";

function provider(name: EmailProviderName, configured = true): EmailProvider {
  return {
    name,
    configured,
    from: name === "relay" ? "Beacon <relay@example.test>" : "Beacon <resend@example.test>",
  };
}

const both = [provider("relay"), provider("resend")];

describe("email provider resolution", () => {
  it("uses the deployment default when the account has no override", () => {
    expect(
      resolveProviderOrder("default", both, "relay_first").map((item) => item.name),
    ).toEqual(["relay", "resend"]);
    expect(
      resolveProviderOrder("default", both, "resend_first").map((item) => item.name),
    ).toEqual(["resend", "relay"]);
  });

  it("honours explicit first and only priorities", () => {
    expect(
      resolveProviderOrder("relay_first", both, "resend_first").map((item) => item.name),
    ).toEqual(["relay", "resend"]);
    expect(
      resolveProviderOrder("resend_first", both, "relay_first").map((item) => item.name),
    ).toEqual(["resend", "relay"]);
    expect(
      resolveProviderOrder("relay_only", both, "resend_first").map((item) => item.name),
    ).toEqual(["relay"]);
    expect(
      resolveProviderOrder("resend_only", both, "relay_first").map((item) => item.name),
    ).toEqual(["resend"]);
  });

  it("never falls back in an only mode", () => {
    expect(
      resolveProviderOrder("relay_only", [provider("relay"), provider("resend", false)], "relay_first"),
    ).toHaveLength(1);
    expect(
      resolveProviderOrder("resend_only", [provider("relay"), provider("resend", false)], "relay_first"),
    ).toEqual([]);
  });

  it("skips unconfigured providers", () => {
    expect(
      resolveProviderOrder("relay_first", [provider("relay", false), provider("resend")], "relay_first").map(
        (item) => item.name,
      ),
    ).toEqual(["resend"]);
    expect(resolveProviderOrder("relay_first", [], "relay_first")).toEqual([]);
  });
});
