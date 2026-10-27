export type UserAgentInfo = {
  browser: string;
  os: string;
  label: string;
};

export function describeUserAgent(userAgent: string | null | undefined): string {
  return parseUserAgent(userAgent).label;
}

export function parseUserAgent(userAgent: string | null | undefined): UserAgentInfo {
  const ua = (userAgent ?? "").trim();
  if (!ua) return { browser: "Unknown", os: "Unknown", label: "Unknown device" };

  const browser = /Edg\//i.test(ua)
    ? "Edge"
    : /OPR\//i.test(ua)
      ? "Opera"
      : /Firefox\//i.test(ua)
        ? "Firefox"
        : /Chrome\//i.test(ua) && !/Chromium/i.test(ua)
          ? "Chrome"
          : /Safari\//i.test(ua)
            ? "Safari"
            : /curl\//i.test(ua)
              ? "curl"
              : /okhttp/i.test(ua)
                ? "Beacon for Android"
                : "Browser";

  const os = /Android/i.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/i.test(ua)
      ? "iOS"
      : /Windows/i.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/i.test(ua)
          ? "macOS"
          : /Linux/i.test(ua)
            ? "Linux"
            : "Unknown OS";

  const label = os === "Unknown OS" ? browser : `${browser} on ${os}`;
  return { browser, os, label };
}
