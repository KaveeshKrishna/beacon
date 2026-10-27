import "server-only";

import { z } from "zod";

const boolFromString = z
  .enum(["true", "false"])
  .default("true")
  .transform((value) => value === "true");

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  APP_URL: z
    .string()
    .url()
    .refine((value) => {
      // Production sessions use __Host- cookies, which require HTTPS. Allow
      // plain HTTP only for a local production smoke test.
      if (process.env.NODE_ENV !== "production") return true;
      const url = new URL(value);
      if (url.protocol === "https:") return true;
      return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(
        url.hostname,
      );
    }, "APP_URL must use https:// in production (http:// is allowed only for localhost)."),
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32),
  /**
   * Which proxy headers may be trusted for the client IP.
   *
   * - vercel:    only when the process runs on Vercel (VERCEL=1)
   * - forwarded: a reverse proxy in front of the app appends/overwrites
   *              X-Forwarded-For with the real peer address
   * - none:      never trust forwarded headers
   *
   * Trusting a header a client can set makes IP rate limits bypassable, so the
   * default is deliberately platform-scoped.
   */
  TRUSTED_PROXY: z.enum(["vercel", "forwarded", "none"]).default("vercel"),
  ENCRYPTION_KEY: z
    .string()
    .refine((value) => {
      try {
        return Buffer.from(value, "base64").length === 32;
      } catch {
        return false;
      }
    }, "ENCRYPTION_KEY must be a base64-encoded 32-byte key"),
  CRON_SECRET: z.string().min(24).optional(),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  LOCATION_RETENTION_DAYS: z.coerce.number().int().min(7).max(730).default(90),
  AUDIT_RETENTION_DAYS: z.coerce.number().int().min(30).max(1095).default(365),
  MAX_DEVICES_PER_USER: z.coerce.number().int().min(1).max(50).default(10),
  ALLOW_SIGNUPS: boolFromString,
  ENABLE_HIBP: boolFromString,
  EMAIL_PROVIDER_PRIORITY: z
    .enum(["relay_first", "resend_first", "relay_only", "resend_only"])
    .default("relay_first"),
  EMAIL_FROM: z.string().min(3).default("Beacon <no-reply@beacon.example.com>"),
  EMAIL_REPLY_TO: z.string().email().optional().or(z.literal("")),
  EMAIL_DEV_LOG: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  EMAIL_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(10000),
  RELAY_API_BASE_URL: z.string().url().optional().or(z.literal("")),
  RELAY_API_KEY: z.string().optional().or(z.literal("")),
  RELAY_FROM: z.string().optional().or(z.literal("")),
  RESEND_API_KEY: z.string().optional().or(z.literal("")),
  RESEND_FROM: z.string().optional().or(z.literal("")),
  FCM_PROJECT_ID: z.string().optional().or(z.literal("")),
  FCM_CLIENT_EMAIL: z.string().optional().or(z.literal("")),
  FCM_PRIVATE_KEY: z.string().optional().or(z.literal("")),
  NEXT_PUBLIC_MAP_STYLE_LIGHT: z
    .string()
    .url()
    .default("https://tiles.openfreemap.org/styles/positron"),
  NEXT_PUBLIC_MAP_STYLE_DARK: z
    .string()
    .url()
    .default("https://tiles.openfreemap.org/styles/dark"),
  NEXT_PUBLIC_APK_URL: z.string().optional().or(z.literal("")),
  NEXT_PUBLIC_GITHUB_URL: z.string().optional().or(z.literal("")),
  NEXT_PUBLIC_OPERATOR_NAME: z.string().default("Beacon Project"),
  NEXT_PUBLIC_CONTACT_EMAIL: z.string().default("security@example.com"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration — ${details}`);
  }

  cached = parsed.data;
  return cached;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function appOrigin(): string {
  return new URL(getEnv().APP_URL).origin;
}

export function allowedOrigins(): string[] {
  const origins = new Set<string>([appOrigin()]);

  // Vercel supplies hostnames without a scheme. Include the deployment and
  // project production aliases so both work when APP_URL has not been updated
  // yet, without trusting arbitrary Host headers.
  for (const key of [
    "VERCEL_URL",
    "VERCEL_PROJECT_PRODUCTION_URL",
    "VERCEL_BRANCH_URL",
  ]) {
    const host = process.env[key];
    if (host && /^[a-z0-9.-]+$/i.test(host)) {
      origins.add(`https://${host}`);
    }
  }

  if (process.env.NODE_ENV !== "production") {
    origins.add("http://localhost:3000");
    origins.add("http://127.0.0.1:3000");
  }
  return [...origins];
}

export function secureCookies(): boolean {
  return getEnv().APP_URL.startsWith("https://");
}
