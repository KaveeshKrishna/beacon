/**
 * Accept only a same-origin absolute path for post-login navigation. This is
 * deliberately narrow: a protocol-relative URL, a backslash, or an absolute
 * URL would let a crafted `next` value send the browser somewhere else.
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value || value.length > 2048) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return null;
  }
  try {
    const parsed = new URL(value, "https://beacon.invalid");
    if (parsed.origin !== "https://beacon.invalid") return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}
