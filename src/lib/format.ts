export function formatCoordinates(
  latitude: number,
  longitude: number,
  digits = 5,
): string {
  return `${latitude.toFixed(digits)}, ${longitude.toFixed(digits)}`;
}

export function formatBattery(level: number | null | undefined): string {
  if (level === null || level === undefined) return "—";
  return `${Math.round(level)}%`;
}

export function formatAccuracy(meters: number | null | undefined): string {
  if (meters === null || meters === undefined) return "—";
  if (meters < 10) return "±" + meters.toFixed(0) + " m";
  if (meters < 1000) return "±" + Math.round(meters) + " m";
  return "±" + (meters / 1000).toFixed(1) + " km";
}

export function formatSpeed(metersPerSecond: number | null | undefined): string {
  if (metersPerSecond === null || metersPerSecond === undefined) return "—";
  const kmh = metersPerSecond * 3.6;
  return `${kmh.toFixed(kmh < 10 ? 1 : 0)} km/h`;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDateTime(
  input: Date | string | number | null | undefined,
  timeZone = "UTC",
): string {
  if (!input) return "—";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(date);
}

export function formatTime(
  input: Date | string | number | null | undefined,
  timeZone?: string,
): string {
  if (!input) return "—";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone,
  }).format(date);
}

export function formatDate(
  input: Date | string | number | null | undefined,
  timeZone = "UTC",
): string {
  if (!input) return "—";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(date);
}

export function formatRelative(
  input: Date | string | number | null | undefined,
  now = Date.now(),
): string {
  if (!input) return "never";
  const timestamp = new Date(input).getTime();
  if (Number.isNaN(timestamp)) return "unknown";
  const seconds = Math.round((timestamp - now) / 1000);
  const absolute = Math.abs(seconds);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (absolute < 60) return formatter.format(seconds, "second");
  if (absolute < 3600) return formatter.format(Math.round(seconds / 60), "minute");
  if (absolute < 86_400) return formatter.format(Math.round(seconds / 3600), "hour");
  if (absolute < 2_592_000) return formatter.format(Math.round(seconds / 86_400), "day");
  return formatter.format(Math.round(seconds / 2_592_000), "month");
}

export function deviceStatus(
  lastSeenAt: Date | string | null | undefined,
  now = Date.now(),
): "online" | "stale" | "offline" {
  if (!lastSeenAt) return "offline";
  const ageMinutes = (now - new Date(lastSeenAt).getTime()) / 60_000;
  if (ageMinutes <= 10) return "online";
  if (ageMinutes <= 24 * 60) return "stale";
  return "offline";
}

export function providerLabel(provider: string): string {
  const normalized = provider.toLowerCase();
  if (normalized.includes("gps")) return "GPS";
  if (normalized.includes("fused")) return "Fused";
  if (normalized.includes("network")) return "Network";
  if (normalized.includes("passive")) return "Passive";
  if (normalized.includes("cell")) return "Cell";
  return provider || "Unknown";
}

export function truncate(value: string, length = 64): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
