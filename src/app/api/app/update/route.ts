import { ok } from "@/lib/api";
import { getEnv, type Env } from "@/lib/env";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_HASH_BYTES = 4 * 1024;
const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
};

type UpdateManifest = {
  enabled: true;
  versionName: string;
  apkUrl: string;
  sha256: string;
  sizeBytes: number;
  notes: string;
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function httpsUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function hash(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : null;
}

function version(value: string): string | null {
  const normalized = value.trim().replace(/^v/i, "");
  return /^\d+(\.\d+){1,3}$/.test(normalized) ? normalized : null;
}

function clean(value: string, max: number): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, max);
}

async function readLimited(
  response: Response,
  limit: number,
): Promise<string | null> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > limit) return null;
  const text = await response.text();
  return text.length > limit ? null : text;
}

async function fetchText(url: string, accept: string, limit: number) {
  const target = httpsUrl(url);
  if (!target) return null;
  const response = await fetch(target, {
    headers: { Accept: accept, "User-Agent": "Beacon-Server" },
    signal: AbortSignal.timeout(10_000),
    next: { revalidate: 900 },
  });
  if (!response.ok) return null;
  return readLimited(response, limit);
}

async function parseManifest(body: string): Promise<UpdateManifest | null> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  const root = record(parsed);
  if (!root) return null;

  // Simple schema: { versionName, apkUrl, sha256, sizeBytes?, notes? }
  if (typeof root.apkUrl === "string") {
    const versionName = version(
      typeof root.versionName === "string" ? root.versionName : "",
    );
    const apkUrl = httpsUrl(root.apkUrl);
    const sha256 = hash(typeof root.sha256 === "string" ? root.sha256 : "");
    if (!versionName || !apkUrl || !sha256) return null;
    return {
      enabled: true,
      versionName,
      apkUrl,
      sha256,
      sizeBytes:
        typeof root.sizeBytes === "number" && root.sizeBytes > 0
          ? Math.min(root.sizeBytes, 250 * 1024 * 1024)
          : 0,
      notes: clean(typeof root.notes === "string" ? root.notes : "", 2000),
    };
  }

  // GitHub releases/latest schema.
  const versionName = version(
    typeof root.tag_name === "string" ? root.tag_name : "",
  );
  if (!versionName) return null;

  const assets = Array.isArray(root.assets) ? root.assets : [];
  let apkUrl: string | null = null;
  let hashUrl: string | null = null;
  let sizeBytes = 0;
  for (const item of assets) {
    const asset = record(item);
    if (!asset) continue;
    const name = typeof asset.name === "string" ? asset.name : "";
    const url =
      typeof asset.browser_download_url === "string"
        ? asset.browser_download_url
        : "";
    if (name === "beacon.apk") {
      apkUrl = httpsUrl(url);
      sizeBytes =
        typeof asset.size === "number" && asset.size > 0
          ? Math.min(asset.size, 250 * 1024 * 1024)
          : 0;
    } else if (name === "beacon.apk.sha256") {
      hashUrl = httpsUrl(url);
    }
  }
  if (!apkUrl || !hashUrl) return null;

  const hashFile = await fetchText(hashUrl, "text/plain", MAX_HASH_BYTES);
  const sha256 = hash(hashFile?.trim().split(/\s+/)[0] ?? "");
  if (!sha256) return null;

  return {
    enabled: true,
    versionName,
    apkUrl,
    sha256,
    sizeBytes,
    notes: clean(typeof root.body === "string" ? root.body : "", 2000),
  };
}

async function resolveManifest(env: Env): Promise<UpdateManifest | null> {
  if (env.BEACON_ANDROID_UPDATE_MANIFEST_URL) {
    const body = await fetchText(
      env.BEACON_ANDROID_UPDATE_MANIFEST_URL,
      "application/vnd.github+json",
      MAX_MANIFEST_BYTES,
    );
    return body ? parseManifest(body) : null;
  }

  if (
    env.BEACON_ANDROID_VERSION &&
    env.BEACON_ANDROID_APK_URL &&
    env.BEACON_ANDROID_APK_SHA256
  ) {
    const apkUrl = httpsUrl(env.BEACON_ANDROID_APK_URL);
    const sha256 = hash(env.BEACON_ANDROID_APK_SHA256);
    if (!apkUrl || !sha256) return null;
    return {
      enabled: true,
      versionName: env.BEACON_ANDROID_VERSION,
      apkUrl,
      sha256,
      sizeBytes: 0,
      notes: "",
    };
  }

  return null;
}

export async function GET() {
  try {
    const manifest = await resolveManifest(getEnv());
    return ok(manifest ?? { enabled: false }, { headers: CACHE_HEADERS });
  } catch (error) {
    logger.warn("app-update", "Update manifest unavailable", {
      error: error instanceof Error ? error.message : String(error),
    });
    return ok({ enabled: false }, { headers: CACHE_HEADERS });
  }
}
